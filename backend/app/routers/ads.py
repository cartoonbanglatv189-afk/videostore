from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends

from ..firebase_client import delete_data, is_admin_mode, push_data, read_data, update_data
from ..security import require_admin_key

router = APIRouter(prefix="/ads", tags=["ads"])


@router.get("")
async def get_ads_config() -> Any:
    return await read_data("ads_config")


@router.put("/monetag", dependencies=[Depends(require_admin_key)])
async def save_monetag(payload: dict) -> dict:
    mid = str(payload.get("monetag_id") or "")
    await update_data("settings", {"monetag_id": mid})
    return {"ok": is_admin_mode(), "monetag_id": mid}


@router.get("/interstitial_ids")
async def list_interstitial_ids() -> Any:
    return await read_data("ads_config/interstitial_ids")


@router.post("/interstitial_ids", dependencies=[Depends(require_admin_key)])
async def add_interstitial_id(payload: dict) -> dict:
    value = str(payload.get("id") or "")
    if is_admin_mode():
        await push_data("ads_config/interstitial_ids", value)
        return {"ok": True}
    return {"ok": False, "reason": "firebase-admin-not-configured"}


@router.delete("/interstitial_ids/{item_id}", dependencies=[Depends(require_admin_key)])
async def delete_interstitial_id(item_id: str) -> dict:
    await delete_data(f"ads_config/interstitial_ids/{item_id}")
    return {"ok": True}


@router.get("/banners")
async def list_banners() -> Any:
    return await read_data("ads_config/banners")


@router.post("/banners", dependencies=[Depends(require_admin_key)])
async def add_banner(payload: dict) -> dict:
    html = str(payload.get("html") or "")
    if is_admin_mode():
        await push_data("ads_config/banners", html)
        return {"ok": True}
    return {"ok": False, "reason": "firebase-admin-not-configured"}


@router.delete("/banners/{banner_id}", dependencies=[Depends(require_admin_key)])
async def delete_banner(banner_id: str) -> dict:
    await delete_data(f"ads_config/banners/{banner_id}")
    return {"ok": True}
