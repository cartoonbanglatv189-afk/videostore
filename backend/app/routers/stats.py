from __future__ import annotations

import time

from fastapi import APIRouter

from ..firebase_client import read_data
from ..services import telegram

router = APIRouter(tags=["stats"])


@router.get("/admin/stats")
async def stats() -> dict:
    videos = (await read_data("videos")) or {}
    packages = (await read_data("packages")) or {}
    users = (await read_data("bot_users")) or {}
    purchases = (await read_data("purchases")) or {}
    approved = [
        p for p in purchases.values() if isinstance(p, dict) and p.get("status") == "approved"
    ]
    total_views = sum(
        (v or {}).get("view_count", 0) for v in videos.values() if isinstance(v, dict)
    )
    revenue = sum(
        (p or {}).get("amount", 0) for p in approved if isinstance(p.get("amount"), (int, float))
    )
    return {
        "videos": len(videos),
        "packages": len(packages),
        "users": len(users),
        "total_views": total_views,
        "purchases": len(approved),
        "pending_purchases": len(purchases) - len(approved),
        "revenue": revenue,
        "bot_connected": telegram.bot_enabled(),
    }


@router.post("/admin/broadcast")
async def broadcast(payload: dict) -> dict:
    text = str(payload.get("text") or "").strip()
    if not text:
        return {"ok": False, "reason": "empty"}
    if not telegram.bot_enabled():
        return {"ok": False, "reason": "bot-not-configured"}
    settings_data = (await read_data("settings")) or {}
    web_app_url = str(settings_data.get("bot_app_link") or "")
    sent = await telegram.broadcast(text, web_app_url)
    return {"ok": True, "sent": sent, "at": int(time.time() * 1000)}
