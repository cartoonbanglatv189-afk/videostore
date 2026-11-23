from __future__ import annotations

import json
import logging

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .firebase_client import init_firebase, is_admin_mode
from .routers import ads, engagement, filters, links, packages, payments, settings, stats, videos

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Viral Zone API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(videos.router)
app.include_router(filters.router)
app.include_router(links.router)
app.include_router(ads.router)
app.include_router(settings.router)
app.include_router(packages.router)
app.include_router(payments.router)
app.include_router(engagement.router)
app.include_router(stats.router)


@app.on_event("startup")
async def startup() -> None:
    try:
        init_firebase()
        mode = "admin" if is_admin_mode() else "rest-fallback"
        logging.info("Firebase initialized in %s mode", mode)
    except Exception as exc:
        logging.warning(" Firebase init failed: %s", exc)


@app.get("/")
async def index() -> dict:
    return {"status": "ok", "service": "viral-zone-api", "docs": "/docs"}


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "firebase_admin": is_admin_mode()}


@app.get("/firebase-config")
async def firebase_config() -> dict:
    cfg = get_settings().web_config
    return {"ok": bool(cfg), "config": cfg}


@app.get("/debug/firebase")
async def debug_firebase() -> dict:
    import time

    from .firebase_client import delete_data, push_data, read_data

    settings = get_settings()
    out = {"url": settings.resolved_db_url, "admin_mode": is_admin_mode()}
    try:
        key = await push_data("debug/ping", {"at": int(time.time() * 1000)})
        out["write_ok"] = bool(key)
        out["read_back_ok"] = bool(key and await read_data(f"debug/ping/{key}"))
        if key:
            await delete_data(f"debug/ping/{key}")
    except Exception as exc:
        out["error"] = str(exc)
    return out
