"""FreeMace server — FastAPI application with JSON file storage."""

import json
import re
from pathlib import Path

__version__ = "0.0.0"

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

_PACKAGE_DIR = Path(__file__).resolve().parent
_BUNDLED_STATIC = _PACKAGE_DIR / "static"


def safe_name(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_\-]", "_", name)


def create_app(data_dir: str = "data") -> FastAPI:
    app = FastAPI(title="FreeMace", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    store_root = Path(data_dir)
    store_root.mkdir(parents=True, exist_ok=True)

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
        return {"message": "Saved", "path": str(path.relative_to(store_root))}

    @app.delete("/store/{collection}/{key}")
    async def jsonstore_delete(collection: str, key: str):
        path = store_root / safe_name(collection) / (safe_name(key) + ".json")
        if path.is_file():
            path.unlink()
            return {"message": "Deleted"}
        raise HTTPException(status_code=404, detail="Not found")

    # ── Health check ──────────────────────────────────────────

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    # ── Bundled UI static files ───────────────────────────────
    # Serves the built React app when it's been bundled into the
    # package (i.e. freemace/server/static/ exists with an index.html).
    # The SPA catch-all must be registered last so API routes take priority.

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

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            """Catch-all: serve static file if it exists, otherwise index.html for SPA routing."""
            requested = static_dir / full_path
            if full_path and requested.is_file():
                return FileResponse(str(requested))
            return HTMLResponse(index_html.read_text())

    return app
