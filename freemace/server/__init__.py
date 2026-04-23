"""FreeMace server — FastAPI application with JSON file storage."""
from __future__ import annotations

import asyncio
import json
import logging
import re
from pathlib import Path

__version__ = "0.0.0"

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from freemace.server import gitsync, updater

log = logging.getLogger("freemace")

_PACKAGE_DIR = Path(__file__).resolve().parent
_BUNDLED_STATIC = _PACKAGE_DIR / "static"

DEFAULT_CONFIG = {
    "port": 5002,
    "host": "0.0.0.0",
    "data_dir": "data",
    "git_remote": "",
    "auto_update": False,
    "update_interval_hours": 24,
}


def load_config(config_path: str | None) -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if config_path:
        p = Path(config_path)
        if p.is_file():
            with open(p) as f:
                cfg.update(json.load(f))
    return cfg


def save_config(config_path: str, cfg: dict):
    p = Path(config_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w") as f:
        json.dump(cfg, f, indent=2)


def safe_name(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_\-]", "_", name)


def create_app(data_dir: str = "data", config_path: str | None = None) -> FastAPI:
    cfg = load_config(config_path)
    if data_dir != "data":
        cfg["data_dir"] = data_dir
    actual_data_dir = cfg["data_dir"]

    app = FastAPI(title="FreeMace", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    store_root = Path(actual_data_dir)
    store_root.mkdir(parents=True, exist_ok=True)

    # ── Startup hooks ─────────────────────────────────────────

    @app.on_event("startup")
    async def _startup():
        gitsync.start_sync(store_root)

        if cfg.get("auto_update"):
            updater.start_update_loop(cfg.get("update_interval_hours", 24))

    # ── JSON Store routes ─────────────────────────────────────

    @app.get("/store/{collection}")
    async def jsonstore_list(collection: str):
        folder = store_root / safe_name(collection)
        if not folder.is_dir():
            return JSONResponse([])
        names = sorted(
            f.stem for f in folder.iterdir()
            if f.suffix == ".json" and not f.name.startswith("_")
        )
        return JSONResponse(names)

    @app.get("/store/{collection}/{key}")
    async def jsonstore_get(collection: str, key: str):
        path = store_root / safe_name(collection) / (safe_name(key) + ".json")
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(path, media_type="application/json")

    @app.put("/store/{collection}/{key}")
    async def jsonstore_put(collection: str, key: str, request: Request):
        folder = store_root / safe_name(collection)
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / (safe_name(key) + ".json")
        try:
            data = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
        gitsync.notify_write()
        return {"message": "Saved", "path": str(path.relative_to(store_root))}

    @app.delete("/store/{collection}/{key}")
    async def jsonstore_delete(collection: str, key: str):
        path = store_root / safe_name(collection) / (safe_name(key) + ".json")
        if path.is_file():
            path.unlink()
            gitsync.notify_write()
            return {"message": "Deleted"}
        raise HTTPException(status_code=404, detail="Not found")

    # ── Status & management ───────────────────────────────────

    @app.get("/health")
    async def health():
        import freemace
        return {
            "status": "ok",
            "version": freemace.__version__,
            "git_enabled": gitsync.is_git_repo(store_root),
        }

    @app.get("/api/update/check")
    async def check_for_update():
        """Check PyPI for a newer version without installing."""
        import freemace as _fm
        loop = asyncio.get_event_loop()
        latest = await loop.run_in_executor(None, updater.get_latest_version)
        if latest is None:
            return {"status": "error", "message": "Could not reach PyPI"}
        return {
            "current": _fm.__version__,
            "latest": latest,
            "update_available": updater.needs_update(latest),
        }

    @app.post("/api/update")
    async def trigger_update():
        result = await updater.check_and_update()
        return result

    @app.get("/api/update/config")
    async def get_update_config():
        import freemace as _fm
        return {
            "auto_update": cfg.get("auto_update", False),
            "update_interval_hours": cfg.get("update_interval_hours", 24),
            "current_version": _fm.__version__,
        }

    @app.put("/api/update/config")
    async def set_update_config(request: Request):
        body = await request.json()
        if "auto_update" in body:
            cfg["auto_update"] = bool(body["auto_update"])
        if "update_interval_hours" in body:
            cfg["update_interval_hours"] = max(1, int(body["update_interval_hours"]))
        if config_path:
            save_config(config_path, cfg)
        return {
            "auto_update": cfg.get("auto_update", False),
            "update_interval_hours": cfg.get("update_interval_hours", 24),
        }

    # ── Git configuration API ─────────────────────────────────

    @app.get("/api/git/status")
    async def git_status():
        return gitsync.get_status(store_root)

    @app.post("/api/git/generate-key")
    async def git_generate_key():
        loop = asyncio.get_event_loop()
        pub = await loop.run_in_executor(None, gitsync.generate_ssh_key)
        return {"public_key": pub}

    @app.get("/api/git/ssh-key")
    async def git_ssh_key():
        pub = gitsync.get_ssh_public_key()
        if pub is None:
            raise HTTPException(status_code=404, detail="No SSH key generated yet")
        return {"public_key": pub}

    @app.post("/api/git/setup")
    async def git_setup(request: Request):
        body = await request.json()
        remote = body.get("remote", "").strip()
        if not remote:
            raise HTTPException(status_code=400, detail="remote is required")

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, gitsync.git_init, store_root, remote)

        if config_path:
            cfg["git_remote"] = remote
            save_config(config_path, cfg)

        sha = await loop.run_in_executor(None, gitsync.git_sync, store_root)
        gitsync.ensure_sync_running(store_root)

        return {
            "message": "Git configured",
            "remote": remote,
            "commit": sha,
        }

    @app.post("/api/git/sync")
    async def git_trigger_sync():
        loop = asyncio.get_event_loop()
        sha = await loop.run_in_executor(None, gitsync.git_sync, store_root)
        return {"commit": sha}

    @app.post("/api/git/test")
    async def git_test_connection():
        """Test if the SSH connection to GitHub works."""
        loop = asyncio.get_event_loop()

        def _test():
            import subprocess
            r = subprocess.run(
                ["ssh", "-T", "-o", "StrictHostKeyChecking=accept-new",
                 "git@github.com-freemace"],
                capture_output=True, text=True, timeout=15,
            )
            output = (r.stdout + r.stderr).strip()
            return r.returncode == 1 and "successfully authenticated" in output.lower(), output

        ok, output = await loop.run_in_executor(None, _test)
        return {"connected": ok, "output": output}

    # ── Bundled UI static files ───────────────────────────────

    static_dir = _BUNDLED_STATIC
    index_html = static_dir / "index.html"

    if static_dir.is_dir() and index_html.is_file():
        app.mount(
            "/assets",
            StaticFiles(directory=str(static_dir / "assets")),
            name="static-assets",
        )

        @app.get("/favicon.ico")
        async def favicon():
            path = static_dir / "favicon.ico"
            if path.is_file():
                return FileResponse(str(path))
            raise HTTPException(status_code=404)

        _API_PREFIXES = ("api/", "store/", "health")

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            """Catch-all for SPA routing. Never intercepts API/store paths."""
            if full_path.startswith(_API_PREFIXES):
                raise HTTPException(status_code=404)
            requested = static_dir / full_path
            if full_path and requested.is_file():
                return FileResponse(str(requested))
            return HTMLResponse(index_html.read_text())

    return app
