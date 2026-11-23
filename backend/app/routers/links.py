from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from ..firebase_client import delete_data, is_admin_mode, push_data, read_data
from ..security import require_admin_key

router = APIRouter(prefix="/links", tags=["links"])


@router.get("")
async def list_links() -> Any:
    return await read_data("links")


@router.post("", dependencies=[Depends(require_admin_key)])
async def create_link(payload: dict) -> dict:
    l = {"title": payload.get("title"), "url": payload.get("url")}
    if is_admin_mode():
        await push_data("links", l)
        return {"ok": True, "data": l}
    return {"ok": False, "reason": "firebase-admin-not-configured"}


@router.delete("/{link_id}", dependencies=[Depends(require_admin_key)])
async def delete_link(link_id: str) -> dict:
    await delete_data(f"links/{link_id}")
    return {"ok": True}
