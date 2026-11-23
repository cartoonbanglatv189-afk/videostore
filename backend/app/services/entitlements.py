from __future__ import annotations

import time

from ..firebase_client import read_data, update_data

DAY_MS = 86_400_000


def entitlement_path(user_id: str) -> str:
    return f"user_entitlements/{user_id}"


async def apply_purchase(purchase: dict) -> None:
    user_id = str(purchase.get("user_id") or "")
    if not user_id:
        return
    path = entitlement_path(user_id)
    current = (await read_data(path)) or {}
    updates: dict = {}

    if purchase.get("video_id"):
        unlocked = current.get("videos_unlocked") or {}
        unlocked[str(purchase["video_id"])] = True
        updates["videos_unlocked"] = unlocked

    pkg_key = purchase.get("package_key")
    if pkg_key:
        pkg = (await read_data(f"packages/{pkg_key}")) or {}
        credits = int(current.get("video_unlock_credits") or 0) + int(pkg.get("video_count") or 0)
        updates["video_unlock_credits"] = credits
        days = int(pkg.get("duration_days") or 0)
        if days > 0:
            base = max(int(current.get("membership_until") or 0), int(time.time() * 1000))
            updates["membership_until"] = base + days * DAY_MS

    if updates:
        await update_data(path, updates)


async def use_credit(user_id: str, video_id: str, required: int = 1) -> dict:
    path = entitlement_path(user_id)
    current = (await read_data(path)) or {}
    credits = int(current.get("video_unlock_credits") or 0)
    if credits < required:
        return {"ok": False, "reason": "no-credits"}
    unlocked = current.get("videos_unlocked") or {}
    unlocked[video_id] = True
    await update_data(path, {"video_unlock_credits": credits - required, "videos_unlocked": unlocked})
    return {"ok": True}
