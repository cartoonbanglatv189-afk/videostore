"""Firebase Realtime Database REST helpers (no firebase-admin dependency)."""
from __future__ import annotations

from typing import Any

import httpx

from bot import config


async def rget(path: str) -> Any:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{config.DB_URL}/{path.strip('/')}.json")
        return r.json() if r.status_code == 200 else None


async def rput(path: str, data: Any) -> Any:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.put(f"{config.DB_URL}/{path.strip('/')}.json", json=data)
        return r.json() if r.status_code == 200 else None


async def rpatch(path: str, data: dict) -> Any:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.patch(f"{config.DB_URL}/{path.strip('/')}.json", json=data)
        return r.json() if r.status_code == 200 else None


async def rpush(path: str, data: Any) -> str | None:
    """Push to a list/demo list; returns the generated key (-P...)."""
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{config.DB_URL}/{path.strip('/')}.json", json=data)
        if r.status_code == 200:
            return (r.json() or {}).get("name")
        return None


async def rdelete(path: str) -> bool:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.delete(f"{config.DB_URL}/{path.strip('/')}.json")
        return r.status_code == 200


# ---------- domain helpers ----------

PACKAGES = f"{config.BASE}/packages"
USERS = f"{config.BASE}/users"
REFERRAL = f"{config.BASE}/referral_config"
DEPOSITS = f"{config.BASE}/deposits"
DEPOSIT_METHODS = f"{config.BASE}/deposit_methods"


async def list_packages() -> dict:
    data = await rget(PACKAGES)
    return data or {}


async def get_package(key: str) -> dict:
    return await rget(f"{PACKAGES}/{key}") or {}


async def register_user(user) -> dict:
    """Create the user record if missing; returns (user_data, is_new)."""
    uid = str(user.id)
    data = await rget(f"{USERS}/{uid}")
    is_new = not data
    if is_new:
        await rput(f"{USERS}/{uid}", {
            "joined_at": __import__("time").time(),
            "first_name": user.first_name or "",
            "username": user.username or "",
        })
        data = await rget(f"{USERS}/{uid}")
    return data or {}, is_new


async def credit_balance(uid: str, amount: float) -> None:
    if amount <= 0:
        return
    cur = await rget(f"{USERS}/{uid}/balance") or 0
    await rput(f"{USERS}/{uid}/balance", round(float(cur) + amount, 6))
