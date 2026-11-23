from __future__ import annotations

import time

from fastapi import APIRouter

from ..config import get_settings
from ..firebase_client import push_data, read_data, update_data
from ..services import telegram

router = APIRouter(tags=["engagement"])

DAY_MS = 86_400_000


@router.post("/users/register")
async def register_user(payload: dict) -> dict:
    user_id = str(payload.get("user_id") or "").strip()
    if not user_id:
        return {"ok": False, "reason": "no-user"}
    path = f"bot_users/{user_id}"
    existing = (await read_data(path)) or {}
    name = str(payload.get("first_name") or "")
    last_name = str(payload.get("last_name") or "")
    username = str(payload.get("username") or "")
    photo_url = str(payload.get("photo_url") or "")
    language = str(payload.get("language_code") or "")
    update: dict = {"last_seen": int(time.time() * 1000)}
    if not existing:
        update["joined_at"] = int(time.time() * 1000)
    if name:
        update["first_name"] = name
    if last_name:
        update["last_name"] = last_name
    if username:
        update["username"] = username
    if photo_url:
        update["photo_url"] = photo_url
    if language:
        update["language_code"] = language
    update["telegram_id"] = user_id
    await update_data(path, update)

    referrer = str(payload.get("referrer") or "").strip()
    new_user = not existing
    referral_ok = False
    if referrer and referrer != user_id and new_user:
        ref_path = f"user_entitlements/{referrer}"
        ref_ent = (await read_data(ref_path)) or {}
        credits = int(ref_ent.get("video_unlock_credits") or 0)
        unlocked = ref_ent.get("videos_unlocked") or {}
        await update_data(
            ref_path,
            {"video_unlock_credits": credits + 1, "videos_unlocked": unlocked},
        )
        await update_data(path, {"referred_by": referrer})
        await update_data(f"bot_users/{referrer}", {"referrals": int(((await read_data(f'bot_users/{referrer}')) or {}).get("referrals") or 0) + 1})
        referral_ok = True
        if telegram.bot_enabled():
            await telegram.send_message(
                referrer,
                "🎁 <b>রেফার বাউন্টি!</b>\n আপনার একজন বন্ধু Viral Zone-এ এসেছে — আপনি <b>1টি ফ্রি ভিডিও ক্রেডিট</b> পেয়েছেন! 🎉",
            )
    return {"ok": True, "new_user": new_user, "referral_ok": referral_ok}


@router.get("/telegram/check-join/{user_id}")
async def check_join(user_id: str) -> dict:
    settings = await read_data("settings") or {}
    channel = str(settings.get("telegram_channel") or "").strip()
    if not channel:
        return {"required": False, "joined": True}
    if not telegram.bot_enabled():
        return {"required": False, "joined": True}
    status = await telegram.chat_member_status(channel, user_id)
    return {
        "required": True,
        "joined": status in ("member", "administrator", "creator"),
        "status": status,
        "channel": channel,
    }


@router.post("/videos/{video_id}/rate")
async def rate_video(video_id: str, payload: dict) -> dict:
    user_id = str(payload.get("user_id") or "").strip()
    stars = int(payload.get("stars") or 0)
    if not user_id or not (1 <= stars <= 5):
        return {"ok": False, "reason": "invalid"}
    await update_data(
        f"ratings/{video_id}/{user_id}",
        {
            "stars": stars,
            "name": str(payload.get("first_name") or "user")[:24],
            "ts": int(time.time() * 1000),
        },
    )
    ratings = (await read_data(f"ratings/{video_id}")) or {}
    values = [r.get("stars", 0) for r in ratings.values() if isinstance(r, dict)]
    avg = round(sum(values) / len(values), 1) if values else 0
    return {"ok": True, "avg": avg, "count": len(values)}


@router.post("/videos/{video_id}/comment")
async def add_comment(video_id: str, payload: dict) -> dict:
    user_id = str(payload.get("user_id") or "").strip()
    text = str(payload.get("text") or "").strip()
    if not user_id or not video_id:
        return {"ok": False, "reason": "invalid"}
    if len(text) > 300:
        return {"ok": False, "reason": "too-long"}
    safe = text.replace("<", "&lt;").replace(">", "&gt;").replace("onerror", "")
    await push_data(
        f"comments/{video_id}",
        {
            "user_id": user_id,
            "name": str(payload.get("first_name") or "user")[:24].replace("<", "&lt;"),
            "text": safe,
            "ts": int(time.time() * 1000),
        },
    )
    return {"ok": True}
