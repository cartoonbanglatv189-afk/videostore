from __future__ import annotations

import os

from fastapi import Header, HTTPException


async def require_admin_key(x_admin_key: str | None = Header(default=None)) -> None:
    expected = os.getenv("ADMIN_KEY", "")
    if not expected:
        return
    if x_admin_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing x-admin-key")
