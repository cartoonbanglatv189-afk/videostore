from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends

from ..firebase_client import delete_data, is_admin_mode, push_data, read_data
from ..security import require_admin_key

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
        push_data("videos", video)
        return {"ok": True, "data": video}
    return {"ok": False, "reason": "firebase-admin-not-configured"}


@router.delete("/{video_id}", dependencies=[Depends(require_admin_key)])
async def delete_video(video_id: str) -> dict:
    await delete_data(f"videos/{video_id}")
    return {"ok": True}
