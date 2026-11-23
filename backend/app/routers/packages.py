from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends

from ..firebase_client import delete_data, push_data, read_data, update_data
from ..security import require_admin_key

router = APIRouter(prefix="/packages", tags=["packages"])


@router.get("")
async def list_packages() -> Any:
    return await read_data("packages")


@router.post("", dependencies=[Depends(require_admin_key)])
async def create_package(payload: dict) -> dict:
    pkg = {
        "name": payload.get("name"),
        "description": payload.get("description", ""),
        "price": float(payload.get("price", 0)),
        "bkash_price": float(payload.get("bkash_price", 0) or 0),
        "video_count": int(payload.get("video_count", 0) or 0),
        "duration_days": int(payload.get("duration_days", 0) or 0),
        "benefits": payload.get("benefits") or [],
        "active": bool(payload.get("active", True)),
        "created_at": int(time.time() * 1000),
    }
    await push_data("packages", pkg)
    return {"ok": True, "data": pkg}


@router.put("/{package_id}", dependencies=[Depends(require_admin_key)])
async def edit_package(package_id: str, payload: dict) -> dict:
    await update_data(f"packages/{package_id}", payload)
    return {"ok": True}


@router.delete("/{package_id}", dependencies=[Depends(require_admin_key)])
async def delete_package(package_id: str) -> dict:
    await delete_data(f"packages/{package_id}")
    return {"ok": True}
