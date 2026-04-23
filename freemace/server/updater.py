"""Background auto-updater: checks PyPI for new versions and upgrades in-place."""

import asyncio
import json
import logging
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


def do_upgrade() -> tuple[bool, str]:
    """Pip-install the latest version. Returns (success, output)."""
    python = sys.executable
    r = subprocess.run(
        [python, "-m", "pip", "install", "--upgrade", "freemace"],
        capture_output=True, text=True, timeout=120,
    )
    output = (r.stdout + r.stderr).strip()
    return r.returncode == 0, output


def restart_service() -> tuple[bool, str]:
    """Restart the systemd user service."""
    r = subprocess.run(
        ["systemctl", "--user", "restart", "freemace.service"],
        capture_output=True, text=True, timeout=30,
    )
    output = (r.stdout + r.stderr).strip()
    return r.returncode == 0, output


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
        return {"status": "error", "message": f"Upgrade failed: {out}"}

    rok, rout = await loop.run_in_executor(None, restart_service)
    return {
        "status": "updated",
        "from": freemace.__version__,
        "to": latest,
        "restarted": rok,
        "restart_output": rout,
    }


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
