from __future__ import annotations

import json
import logging

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .firebase_client import init_firebase, is_admin_mode
from .routers import ads, filters, links, packages, payments, settings, videos

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
