from __future__ import annotations

import asyncio
import logging

import httpx

from ..config import get_settings

API = "https://api.telegram.org"


def bot_token() -> str:
    return get_settings().telegram_bot_token


def bot_enabled() -> bool:
    return bool(bot_token())


async def _call(method: str, payload: dict) -> dict | None:
    token = bot_token()
    if not token:
        return None
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(f"{API}/bot{token}/{method}", json=payload)
            data = resp.json()
            if not data.get("ok"):
                logging.warning("Telegram %s failed: %s", method, data)
            return data if data.get("ok") else None
    except Exception as exc:
        logging.warning("Telegram %s error: %s", method, exc)
        return None


async def send_message(chat_id: int | str, text: str, web_app_url: str = "") -> bool:
    payload: dict = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if web_app_url:
        payload["reply_markup"] = {
            "inline_keyboard": [[{"text": "🎬 খুলুন", "web_app": {"url": web_app_url}}]]
        }
    return bool(await _call("sendMessage", payload))


async def broadcast(text: str, web_app_url: str = "", poll_delay: float = 0.05) -> int:
    data = await _call("getUpdates", {"offset": -100, "limit": 100})
    sent = 0
    from ..firebase_client import read_data

    users = (await read_data("bot_users")) or {}
    for user_id in users.keys():
        if await send_message(user_id, text, web_app_url):
            sent += 1
        await asyncio.sleep(poll_delay)
    return sent


async def chat_member_status(channel: str, user_id: int | str) -> str:
    channel = channel.strip()
    if channel.startswith("@"):
        lookup = channel
    else:
        lookup = f"@{channel}"
    data = await _call(
        "getChatMember", {"chat_id": lookup, "user_id": int(user_id)}
    )
    if not data:
        return "unknown"
    return data.get("result", {}).get("status", "unknown")


async def bot_username() -> str:
    data = await _call("getMe", {})
    if data:
        return data.get("result", {}).get("username", "")
    return ""
