from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, Depends

from ..config import get_settings
from ..firebase_client import delete_data, is_admin_mode, push_data, read_data
from ..security import require_admin_key
from ..services import telegram

router = APIRouter(prefix="/videos", tags=["videos"])


@router.get("")
async def list_videos() -> Any:
    return await read_data("videos")


@router.post("", dependencies=[Depends(require_admin_key)])
async def create_video(payload: dict) -> dict:
    video = {
        "name": payload.get("name"),
        "image_url": payload.get("image_url"),
        "download_link": payload.get("download_link"),
        "category": payload.get("category", "all"),
        "ad_watches_required": int(payload.get("ad_watches_required", 1)),
        "price": float(payload.get("price") or 0),
        "view_count": int(payload.get("view_count", 0)),
        "created_at": int(time.time() * 1000),
    }
    if is_admin_mode():
        key = await push_data("videos", video)
        if key:
            asyncio.create_task(_notify_new_video(video))
        return {"ok": True, "id": key, "data": video}
    return {"ok": False, "reason": "firebase-admin-not-configured"}


async def _notify_new_video(video: dict) -> None:
    try:
        cfg = get_settings()
        if not cfg.telegram_auto_notify.startswith("1") or not telegram.bot_enabled():
            return
        settings = (await read_data("settings")) or {}
        web_app_url = str(settings.get("bot_app_link") or "")
        text = f"🆕 <b>নতুন ভিডিও!</b>\n🎬 {video.get('name', '')}\n\nএখনই দেখুন 🔥"
        await telegram.broadcast(text, web_app_url)
    except Exception as exc:
        logging.warning("new-video notify failed: %s", exc)


@router.delete("/{video_id}", dependencies=[Depends(require_admin_key)])
async def delete_video(video_id: str) -> dict:
    await delete_data(f"videos/{video_id}")
    return {"ok": True}
