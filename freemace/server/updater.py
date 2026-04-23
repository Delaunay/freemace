"""Background auto-updater: checks PyPI for new versions and upgrades in-place."""
from __future__ import annotations

import asyncio
import json
import logging
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.request import urlopen

import freemace

log = logging.getLogger("freemace.updater")

PYPI_URL = "https://pypi.org/pypi/freemace/json"


def get_latest_version() -> str | None:
    try:
        with urlopen(PYPI_URL, timeout=10) as resp:
            data = json.loads(resp.read())
        return data["info"]["version"]
    except Exception:
        log.warning("Could not check PyPI for updates")
        return None


def _version_tuple(v: str) -> tuple[int, ...]:
    return tuple(int(x) for x in v.split("."))


def needs_update(latest: str) -> bool:
    try:
        return _version_tuple(latest) > _version_tuple(freemace.__version__)
    except (ValueError, TypeError):
        return False


def _run(cmd: list[str], timeout: int = 120) -> tuple[bool, str]:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        output = (r.stdout + r.stderr).strip()
        return r.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, f"Command timed out after {timeout}s: {' '.join(cmd)}"
    except FileNotFoundError:
        return False, f"Command not found: {cmd[0]}"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


def do_upgrade() -> tuple[bool, str]:
    """Install the latest version via uv (preferred) or pip fallback."""
    python = sys.executable
    uv = shutil.which("uv")
    if uv:
        cmd = [uv, "pip", "install", "--python", python, "--upgrade", "freemace"]
    else:
        cmd = [python, "-m", "pip", "install", "--upgrade", "freemace"]
    return _run(cmd, timeout=120)


def restart_service() -> tuple[bool, str]:
    """Restart the systemd service (tries system-level, falls back to user-level)."""
    ok, out = _run(["sudo", "systemctl", "restart", "freemace.service"], timeout=30)
    if ok:
        return True, out

    ok2, out2 = _run(
        ["systemctl", "--user", "restart", "freemace.service"], timeout=30,
    )
    if ok2:
        return True, out2
    return False, f"system: {out}\nuser: {out2}"


async def check_and_update() -> dict:
    """One-shot check + update. Returns status dict."""
    loop = asyncio.get_event_loop()
    latest = await loop.run_in_executor(None, get_latest_version)

    if latest is None:
        return {"status": "error", "message": "Could not reach PyPI"}

    if not needs_update(latest):
        return {
            "status": "up-to-date",
            "current": freemace.__version__,
            "latest": latest,
        }

    log.info("Upgrading %s -> %s", freemace.__version__, latest)
    ok, out = await loop.run_in_executor(None, do_upgrade)
    if not ok:
        return {"status": "error", "message": "Upgrade failed", "output": out}

    rok, rout = await loop.run_in_executor(None, restart_service)
    result = {
        "status": "updated",
        "from": freemace.__version__,
        "to": latest,
        "restarted": rok,
    }
    if not rok:
        result["output"] = rout
    return result


async def _update_loop(interval_hours: float):
    interval_s = interval_hours * 3600
    while True:
        await asyncio.sleep(interval_s)
        try:
            result = await check_and_update()
            if result["status"] == "updated":
                log.info("Updated to %s, restarting...", result["to"])
            elif result["status"] == "error":
                log.warning("Update check: %s", result.get("message"))
        except Exception:
            log.exception("Update loop error")


_update_task: asyncio.Task | None = None


def start_update_loop(interval_hours: float = 24.0):
    global _update_task
    _update_task = asyncio.create_task(_update_loop(interval_hours))
    log.info("Auto-update loop started (check every %sh)", interval_hours)
