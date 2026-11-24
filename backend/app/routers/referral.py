from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends

from ..firebase_client import is_admin_mode, push_data, read_data, update_data
from ..security import require_admin_key
from ..services import telegram

router = APIRouter(prefix="/referral", tags=["referral"])


async def get_referral_config() -> dict:
    return (await read_data("referral_config")) or {}


async def _credit_referrer_wallet(referrer: str, amount: float) -> float:
    path = f"user_wallets/{referrer}"
    wallet = (await read_data(path)) or {}
    balance = float(wallet.get("balance") or 0)
    new_balance = round(balance + amount, 8)
    await update_data(path, {"balance": new_balance, "updated_at": int(time.time() * 1000)})
    return new_balance


async def reward_referrer_for_user(user_id: str, kind: str, context_id: str = "") -> None:
    user_id = str(user_id or "").strip()
    if not user_id:
        return
    referred_by = str(((await read_data(f"bot_users/{user_id}")) or {}).get("referred_by") or "").strip()
    if not referred_by or referred_by == user_id:
        return
    cfg = await get_referral_config()
    if cfg.get("enabled") is False:
        return
    try:
        amount = round(float(cfg.get(f"bonus_{kind}") or 0), 8)
    except (TypeError, ValueError):
        return
    if amount <= 0:
        return
    mode = str(cfg.get("purchase_mode") or "first")
    paid_flags = (await read_data(f"referral_paid/{user_id}")) or {}
    if paid_flags.get(kind):
        return
    ctx_flag = f"{kind}_{context_id}" if context_id else ""
    if ctx_flag and paid_flags.get(ctx_flag):
        return
    balance = await _credit_referrer_wallet(referred_by, amount)
    earned = float(((await read_data(f"bot_users/{referred_by}")) or {}).get("ref_earned") or 0)
    await update_data(f"bot_users/{referred_by}", {"ref_earned": round(earned + amount, 8)})
    flag_update: dict = {ctx_flag or kind: True}
    if kind == "purchase" and mode == "first":
        flag_update["purchase"] = True
    await update_data(f"referral_paid/{user_id}", flag_update)
    await push_data(
        "referral_log",
        {
            "referrer": referred_by,
            "referred": user_id,
            "kind": kind,
            "amount": amount,
            "context_id": context_id,
            "ts": int(time.time() * 1000),
        },
    )
    if telegram.bot_enabled():
        if kind == "join":
            text = (
                "🎁 <b>রেফার বোনাস!</b>\n"
                "আপনার বন্ধু Viral Zone-এ এসেছে — "
                f"<b>{amount} USDT</b> আপনার Balance-এ যোগ হয়েছে! 🎉\n"
                f"💰 বর্তমান Balance: <b>{balance} USDT</b>"
            )
        else:
            text = (
                "💰 <b>রেফার ইনকাম!</b>\n"
                "আপনার রেফার করা বন্ধু কেনাকাটা করেছে — "
                f"<b>{amount} USDT</b> আপনার Balance-এ যোগ হয়েছে! 🎉\n"
                f"💰 বর্তমান Balance: <b>{balance} USDT</b>"
            )
        try:
            await telegram.send_message(referred_by, text)
        except Exception:
            pass


@router.get("/config")
async def referral_config_read() -> Any:
    return await get_referral_config()


@router.put("/config", dependencies=[Depends(require_admin_key)])
async def referral_config_save(payload: dict) -> dict:
    data: dict[str, Any] = {}
    if "enabled" in payload:
        data["enabled"] = bool(payload["enabled"])
    if "bonus_join" in payload:
        data["bonus_join"] = round(float(payload["bonus_join"] or 0), 8)
    if "bonus_purchase" in payload:
        data["bonus_purchase"] = round(float(payload["bonus_purchase"] or 0), 8)
    if "purchase_mode" in payload:
        data["purchase_mode"] = "first" if str(payload["purchase_mode"]).lower() == "first" else "every"
    if data:
        await update_data("referral_config", data)
    return {"ok": is_admin_mode(), "saved": data}
