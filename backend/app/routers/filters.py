from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ..firebase_client import delete_data, is_admin_mode, push_data, read_data
from ..security import require_admin_key

router = APIRouter(prefix="/filters", tags=["filters"])


@router.get("")
async def list_filters() -> Any:
    return await read_data("filters")


@router.post("", dependencies=[Depends(require_admin_key)])
async def create_filter(payload: dict) -> dict:
    f = {"id": payload.get("id"), "name": payload.get("name")}
    if is_admin_mode():
        await push_data("filters", f)
        return {"ok": True, "data": f}
    return {"ok": False, "reason": "firebase-admin-not-configured"}


@router.delete("/{filter_id}", dependencies=[Depends(require_admin_key)])
async def delete_filter(filter_id: str) -> dict:
    await delete_data(f"filters/{filter_id}")
    return {"ok": True}
