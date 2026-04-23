"""Background auto-updater: checks PyPI for new versions and upgrades in-place."""
from __future__ import annotations

import asyncio
import json
import logging
import shutil
import subprocess
import sys
from pathlib import Path
from typing import AsyncIterator
from urllib.request import urlopen

import freemace

log = logging.getLogger("freemace.updater")

PYPI_URL = "https://pypi.org/pypi/freemace/json"

_latest_cache: dict = {"version": None, "ts": 0.0}
_CACHE_TTL = 300  # 5 minutes


def get_latest_version() -> str | None:
    import time
    now = time.monotonic()
    if _latest_cache["version"] and (now - _latest_cache["ts"]) < _CACHE_TTL:
        return _latest_cache["version"]
    try:
        with urlopen(PYPI_URL, timeout=10) as resp:
            data = json.loads(resp.read())
        ver = data["info"]["version"]
        _latest_cache["version"] = ver
        _latest_cache["ts"] = now
        return ver
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


def _upgrade_cmd() -> list[str]:
    python = sys.executable
    uv = shutil.which("uv")
    if uv:
        return [uv, "pip", "install", "--python", python, "--upgrade", "freemace"]
    return [python, "-m", "pip", "install", "--upgrade", "freemace"]


def _restart_cmds() -> list[list[str]]:
    return [
        ["sudo", "systemctl", "restart", "freemace.service"],
        ["systemctl", "--user", "restart", "freemace.service"],
    ]


def do_upgrade() -> tuple[bool, str]:
    """Install the latest version via uv (preferred) or pip fallback."""
    return _run(_upgrade_cmd(), timeout=120)


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


# ── SSE streaming upgrade ────────────────────────────────────

def _sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


async def stream_upgrade() -> AsyncIterator[str]:
    """Run the full upgrade pipeline, yielding SSE events with live output."""
    loop = asyncio.get_event_loop()
    current = freemace.__version__

    yield _sse("log", f"Current version: {current}")
    yield _sse("log", "Checking PyPI for latest version...")

    latest = await loop.run_in_executor(None, get_latest_version)
    if latest is None:
        yield _sse("log", "ERROR: Could not reach PyPI")
        yield _sse("done", json.dumps({"status": "error", "message": "Could not reach PyPI"}))
        return

    yield _sse("log", f"Latest on PyPI: {latest}")

    if not needs_update(latest):
        yield _sse("log", "Already up to date.")
        yield _sse("done", json.dumps({
            "status": "up-to-date", "current": current, "latest": latest,
        }))
        return

    yield _sse("log", f"Upgrading {current} -> {latest} ...")

    cmd = _upgrade_cmd()
    yield _sse("log", f"$ {' '.join(cmd)}")

    ok, output = await _stream_subprocess(cmd, lambda line: None)
    for line in output:
        yield _sse("log", line)

    if not ok:
        yield _sse("log", "ERROR: Upgrade failed")
        yield _sse("done", json.dumps({
            "status": "error", "message": "Upgrade failed", "output": "\n".join(output),
        }))
        return

    yield _sse("log", "Upgrade successful. Restarting service...")

    for restart_cmd in _restart_cmds():
        yield _sse("log", f"$ {' '.join(restart_cmd)}")
        rok, restart_output = await _stream_subprocess(restart_cmd, lambda line: None, timeout=30)
        for line in restart_output:
            yield _sse("log", line)
        if rok:
            yield _sse("log", "Service restarted successfully.")
            yield _sse("done", json.dumps({
                "status": "updated", "from": current, "to": latest, "restarted": True,
            }))
            return

    yield _sse("log", "WARNING: Could not restart service automatically.")
    yield _sse("done", json.dumps({
        "status": "updated", "from": current, "to": latest, "restarted": False,
    }))


async def _stream_subprocess(
    cmd: list[str],
    on_line,
    timeout: int = 120,
) -> tuple[bool, list[str]]:
    """Run a subprocess, collecting output lines. Returns (success, lines)."""
    lines: list[str] = []
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        assert proc.stdout is not None
        while True:
            try:
                raw = await asyncio.wait_for(proc.stdout.readline(), timeout=timeout)
            except asyncio.TimeoutError:
                proc.kill()
                lines.append(f"Command timed out after {timeout}s")
                return False, lines
            if not raw:
                break
            line = raw.decode("utf-8", errors="replace").rstrip()
            lines.append(line)
            on_line(line)
        await proc.wait()
        return proc.returncode == 0, lines
    except FileNotFoundError:
        lines.append(f"Command not found: {cmd[0]}")
        return False, lines
    except Exception as exc:
        lines.append(f"{type(exc).__name__}: {exc}")
        return False, lines


# ── Legacy one-shot (used by background loop & CLI) ──────────

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
