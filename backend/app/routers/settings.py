from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ..firebase_client import is_admin_mode, read_data, update_data
from ..security import require_admin_key

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
async def get_settings() -> Any:
    return await read_data("settings")


@router.put("", dependencies=[Depends(require_admin_key)])
async def save_settings(payload: dict) -> dict:
    data: dict[str, Any] = {}
    if "tutorial_id" in payload:
        data["tutorial_id"] = str(payload["tutorial_id"] or "")
    if "bot_app_link" in payload:
        data["bot_app_link"] = str(payload["bot_app_link"] or "")
    if "ads_limit" in payload:
        data["ads_limit"] = int(payload["ads_limit"] or 0)
    if "monetag_id" in payload:
        data["monetag_id"] = str(payload["monetag_id"] or "")
    if data:
        await update_data("settings", data)
    return {"ok": is_admin_mode(), "saved": data}
