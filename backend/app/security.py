from __future__ import annotations

import os

from fastapi import Header, HTTPException


async def require_admin_key(x_admin_key: str | None = Header(default=None)) -> None:
    expected = os.getenv("ADMIN_KEY", "").strip()
    if not expected:
        raise HTTPException(
            status_code=403,
            detail="ADMIN_KEY not configured on backend — set it in the Render environment",
        )
    if not x_admin_key:
        raise HTTPException(status_code=401, detail="Admin login required")
    if x_admin_key != expected:
        raise HTTPException(status_code=401, detail="Wrong admin password")
