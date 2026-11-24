from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..firebase_client import delete_data, push_data, read_data, update_data
from ..security import require_admin_key
from ..services import binance, crypto
from ..services.entitlements import apply_purchase, entitlement_path, use_credit
from .referral import reward_referrer_for_user

router = APIRouter(prefix="/payments", tags=["payments"])

AUTO_VERIFY_NETWORKS = {
    "TRC20": crypto.verify_trc20,
    "BEP20": crypto.verify_bep20,
}


def _sale_active(pkg: dict, now_ms: int) -> bool:
    until = int(pkg.get("sale_until") or 0)
    has_price = float(pkg.get("sale_price") or 0) or float(pkg.get("sale_bkash_price") or 0)
    return bool(until and now_ms <= until and has_price)


async def credit_balance(user_id: str, amount: float) -> None:
    path = f"user_wallets/{user_id}"
    current = (await read_data(path)) or {}
    balance = float(current.get("balance") or 0)
    await update_data(path, {"balance": round(balance + amount, 8), "updated_at": int(time.time() * 1000)})


async def _match_binance_pay(ref: str, required: float, currency: str, cfg: dict) -> bool:
    result = await binance.query_pay_transactions(cfg)
    if not result.get("ok"):
        return False
    for tx in result.get("items") or []:
        if not isinstance(tx, dict):
            continue
        tx_id = str(tx.get("transactionId") or tx.get("id") or "").strip()
        if tx_id != ref:
            continue
        try:
            tx_amount = float(tx.get("amount") or 0)
        except (TypeError, ValueError):
            continue
        tx_currency = str(tx.get("currency") or "")
        if tx_amount >= required and (tx_currency == currency or not tx_currency):
            return True
    return False


async def _build_purchase(payload: dict, method: str) -> dict:
    user_id = str(payload.get("user_id") or "")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")
    pkg_key = payload.get("package_key")
    video_id = payload.get("video_id")
    now = int(time.time() * 1000)

    purchase: dict[str, Any] = {
        "user_id": user_id,
        "method": method,
        "status": "pending",
        "created_at": now,
        "package_key": pkg_key,
        "video_id": video_id,
    }

    if pkg_key:
        pkg = await read_data(f"packages/{pkg_key}")
        if not pkg:
            raise HTTPException(status_code=404, detail="Package not found")
        purchase["package_name"] = pkg.get("name")
        on_sale = _sale_active(pkg, now)
        if method in ("binance", "crypto", "binance_id", "wallet"):
            sale_usdt = float(pkg.get("sale_price") or 0)
            purchase["amount"] = sale_usdt if (on_sale and sale_usdt) else float(pkg.get("price", 0))
        else:
            sale_bdt = float(pkg.get("sale_bkash_price") or 0)
            base = float(pkg.get("bkash_price", 0) or pkg.get("price", 0))
            purchase["amount"] = sale_bdt if (on_sale and sale_bdt) else base
        purchase["on_sale"] = on_sale
        purchase["currency"] = "USDT" if method in ("binance", "crypto", "binance_id", "wallet") else "BDT"
        purchase["duration_days"] = int(pkg.get("duration_days", 0) or 0)
        purchase["video_count"] = int(pkg.get("video_count", 0) or 0)
    elif video_id:
        video = await read_data(f"videos/{video_id}") or {}
        settings = (await read_data("settings")) or {}
        purchase["video_name"] = video.get("name")
        amount = float(video.get("price") or settings.get("video_price") or 0)
        purchase["amount"] = amount
        purchase["currency"] = "USDT"
    else:
        raise HTTPException(status_code=400, detail="package_key or video_id required")

    return purchase


@router.get("/config")
async def get_payment_config() -> Any:
    return await read_data("payments_config")


@router.put("/config", dependencies=[Depends(require_admin_key)])
async def save_payment_config(payload: dict) -> dict:
    data: dict[str, Any] = {}
    for key in ("binance_api_key", "binance_api_secret", "manual_phone", "manual_instructions"):
        if key in payload:
            data[key] = str(payload[key] or "")
    for key in ("binance_enabled", "manual_enabled", "crypto_enabled"):
        if key in payload:
            data[key] = bool(payload[key])
    if "binance_pay_id" in payload:
        data["binance_pay_id"] = str(payload["binance_pay_id"] or "")
    if "binance_pay_ids" in payload:
        pay_ids = []
        for w in payload["binance_pay_ids"] or []:
            if not isinstance(w, dict) or not w.get("id"):
                continue
            pay_ids.append({"id": str(w["id"]).strip(), "label": str(w.get("label") or ""), "on": bool(w.get("on", True))})
        data["binance_pay_ids"] = pay_ids
    if "crypto_wallets" in payload:
        wallets = []
        for w in payload["crypto_wallets"] or []:
            if not isinstance(w, dict) or not w.get("address"):
                continue
            wallets.append(
                {
                    "network": str(w.get("network") or "OTHER").upper(),
                    "address": str(w["address"]).strip(),
                    "label": str(w.get("label") or ""),
                    "on": bool(w.get("on", True)),
                }
            )
        data["crypto_wallets"] = wallets
    if "mobile_wallets" in payload:
        wallets = []
        for w in payload["mobile_wallets"] or []:
            if not isinstance(w, dict) or not w.get("number"):
                continue
            wallets.append(
                {
                    "type": str(w.get("type") or "bKash"),
                    "number": str(w["number"]).strip(),
                    "on": bool(w.get("on", True)),
                }
            )
        data["mobile_wallets"] = wallets
    if "video_price" in payload:
        data["video_price"] = float(payload["video_price"] or 0)
    if data:
        await update_data("payments_config", data)
    return {"ok": True, "saved": list(data.keys())}


@router.post("/binance/create")
async def binance_create(payload: dict) -> dict:
    purchase = await _build_purchase(payload, "binance")
    amount = float(purchase.get("amount") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")
    cfg = (await read_data("payments_config")) or {}
    if not (cfg.get("binance_api_key") and cfg.get("binance_api_secret")):
        return {"ok": False, "reason": "binance-not-configured"}

    trade_no = f"vz{uuid.uuid4().hex[:20]}"
    goods_id = purchase.get("video_id") or purchase.get("package_key") or "item"
    goods_name = purchase.get("video_name") or purchase.get("package_name") or "Viral Zone Purchase"
    resp = await binance.create_order(cfg, amount, trade_no, goods_name, goods_id)
    if resp.get("code") != "000000":
        return {"ok": False, "reason": "binance-error", "detail": resp}

    data = resp.get("data") or {}
    purchase["merchant_trade_no"] = trade_no
    purchase["prepay_id"] = data.get("prepayId")
    purchase["checkout_url"] = data.get("universalUrl") or data.get("checkoutUrl") or data.get("qrLink") or ""
    purchase_id = await push_data("purchases", purchase)
    return {"ok": True, "purchase_id": purchase_id, "checkout_url": purchase["checkout_url"]}


@router.get("/binance/check/{purchase_id}")
async def binance_check(purchase_id: str) -> dict:
    purchase = await read_data(f"purchases/{purchase_id}")
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if purchase.get("status") == "approved":
        return {"ok": True, "status": "approved"}

    cfg = (await read_data("payments_config")) or {}
    if not (cfg.get("binance_api_key") and cfg.get("binance_api_secret")):
        return {"ok": False, "reason": "binance-not-configured", "status": purchase.get("status")}

    resp = await binance.query_order(cfg, purchase.get("merchant_trade_no"))
    binance_status = (resp.get("data") or {}).get("status") if resp.get("code") == "000000" else None

    if binance_status in ("PAID", "PAY_SUCCESS", "SUCCESS"):
        now = int(time.time() * 1000)
        await update_data(f"purchases/{purchase_id}", {"status": "approved", "verified_at": now})
        await apply_purchase({**purchase, "status": "approved"})
        await reward_referrer_for_user(str(purchase.get("user_id") or ""), "purchase", purchase_id)
        return {"ok": True, "status": "approved"}

    return {"ok": True, "status": purchase.get("status") or "pending", "binance_status": binance_status}


@router.post("/manual/create")
async def manual_create(payload: dict) -> dict:
    purchase = await _build_purchase(payload, "manual")
    purchase["transaction_ref"] = str(payload.get("transaction_ref") or "")
    cfg = (await read_data("payments_config")) or {}
    purchase_id = await push_data("purchases", purchase)
    return {
        "ok": True,
        "purchase_id": purchase_id,
        "manual_phone": cfg.get("manual_phone", ""),
        "manual_instructions": cfg.get("manual_instructions", ""),
    }


@router.get("/purchases")
async def list_purchases(_: None = Depends(require_admin_key)) -> Any:
    return await read_data("purchases")


@router.post("/manual/{purchase_id}/approve", dependencies=[Depends(require_admin_key)])
async def approve_manual(purchase_id: str) -> dict:
    purchase = await read_data(f"purchases/{purchase_id}")
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    now = int(time.time() * 1000)
    await update_data(f"purchases/{purchase_id}", {"status": "approved", "verified_at": now})
    await apply_purchase({**purchase, "status": "approved"})
    await reward_referrer_for_user(str(purchase.get("user_id") or ""), "purchase", purchase_id)
    return {"ok": True}


@router.post("/manual/{purchase_id}/reject", dependencies=[Depends(require_admin_key)])
async def reject_manual(purchase_id: str) -> dict:
    await update_data(f"purchases/{purchase_id}", {"status": "rejected", "verified_at": int(time.time() * 1000)})
    return {"ok": True}


@router.delete("/purchases/{purchase_id}", dependencies=[Depends(require_admin_key)])
async def delete_purchase(purchase_id: str) -> dict:
    await delete_data(f"purchases/{purchase_id}")
    return {"ok": True}


@router.post("/crypto/submit")
async def crypto_submit(payload: dict) -> dict:
    purchase = await _build_purchase(payload, "crypto")
    network = str(payload.get("network") or "").strip().upper()
    txid = str(payload.get("txid") or "").strip()
    if not network or not txid:
        raise HTTPException(status_code=400, detail="network and txid required")
    purchase["crypto_network"] = network
    purchase["transaction_ref"] = txid
    purchase_id = await push_data("purchases", purchase)
    return {"ok": True, "purchase_id": purchase_id, "auto": network in AUTO_VERIFY_NETWORKS}


@router.get("/crypto/check/{purchase_id}")
async def crypto_check(purchase_id: str) -> dict:
    purchase = await read_data(f"purchases/{purchase_id}")
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if purchase.get("status") == "approved":
        return {"ok": True, "status": "approved"}

    network = str(purchase.get("crypto_network") or "").upper()
    verifier = AUTO_VERIFY_NETWORKS.get(network)
    if not verifier:
        return {"ok": True, "status": purchase.get("status") or "pending", "auto": False}

    cfg = (await read_data("payments_config")) or {}
    wallets = cfg.get("crypto_wallets") or []
    if isinstance(wallets, dict):
        wallets = list(wallets.values())
    wallet = next(
        (w for w in wallets if isinstance(w, dict) and str(w.get("network", "")).upper() == network),
        None,
    )
    if not wallet:
        return {"ok": False, "status": purchase.get("status") or "pending", "reason": "wallet-missing"}

    result = await verifier(
        purchase.get("transaction_ref") or "",
        wallet.get("address") or "",
        float(purchase.get("amount") or 0),
    )
    if result.get("ok"):
        now = int(time.time() * 1000)
        await update_data(
            f"purchases/{purchase_id}",
            {"status": "approved", "verified_at": now, "verified_by": f"auto-{network}"},
        )
        await apply_purchase({**purchase, "status": "approved"})
        await reward_referrer_for_user(str(purchase.get("user_id") or ""), "purchase", purchase_id)
        return {"ok": True, "status": "approved"}

    return {"ok": True, "status": purchase.get("status") or "pending", "reason": result.get("reason")}


@router.post("/binance-id/submit")
async def binance_id_submit(payload: dict) -> dict:
    purchase = await _build_purchase(payload, "binance_id")
    ref_id = str(payload.get("transfer_id") or payload.get("txid") or "").strip()
    if not ref_id:
        raise HTTPException(status_code=400, detail="transfer_id required")
    purchase["transaction_ref"] = ref_id
    purchase_id = await push_data("purchases", purchase)
    return {"ok": True, "purchase_id": purchase_id}


@router.get("/binance-id/check/{purchase_id}")
async def binance_id_check(purchase_id: str) -> dict:
    purchase = await read_data(f"purchases/{purchase_id}")
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if purchase.get("status") == "approved":
        return {"ok": True, "status": "approved"}

    cfg = (await read_data("payments_config")) or {}
    result = await binance.query_pay_transactions(cfg)
    if not result.get("ok"):
        return {"ok": True, "status": purchase.get("status") or "pending", "auto": False}

    approved = await _match_binance_pay(
        str(purchase.get("transaction_ref") or ""),
        float(purchase.get("amount") or 0),
        str(purchase.get("currency") or "USDT"),
        cfg,
    )
    if approved:
        now = int(time.time() * 1000)
        await update_data(
            f"purchases/{purchase_id}",
            {"status": "approved", "verified_at": now, "verified_by": "auto-binance-pay"},
        )
        await apply_purchase({**purchase, "status": "approved"})
        await reward_referrer_for_user(str(purchase.get("user_id") or ""), "purchase", purchase_id)
        return {"ok": True, "status": "approved"}

    return {"ok": True, "status": purchase.get("status") or "pending", "auto": True}


@router.post("/deposits/submit")
async def deposit_submit(payload: dict) -> dict:
    user_id = str(payload.get("user_id") or "")
    method = str(payload.get("method") or "").strip()
    ref = str(payload.get("ref") or "").strip()
    try:
        amount = float(payload.get("amount") or 0)
    except (TypeError, ValueError):
        amount = 0
    network = str(payload.get("network") or "").upper()
    if not user_id or amount <= 0 or not ref or method not in ("crypto", "binance_id"):
        return {"ok": False, "reason": "invalid"}
    deposit = {
        "user_id": user_id,
        "amount": amount,
        "method": method,
        "crypto_network": network or None,
        "transaction_ref": ref,
        "status": "pending",
        "created_at": int(time.time() * 1000),
    }
    deposit_id = await push_data("deposits", deposit)
    auto = method == "binance_id" or network in AUTO_VERIFY_NETWORKS
    return {"ok": True, "deposit_id": deposit_id, "auto": auto}


@router.get("/deposits/check/{deposit_id}")
async def deposit_check(deposit_id: str) -> dict:
    deposit = await read_data(f"deposits/{deposit_id}")
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if deposit.get("status") == "approved":
        return {"ok": True, "status": "approved"}

    cfg = (await read_data("payments_config")) or {}
    ref = str(deposit.get("transaction_ref") or "")
    required = float(deposit.get("amount") or 0)
    method = str(deposit.get("method") or "")

    approved = False
    reason = None
    if method == "crypto":
        network = str(deposit.get("crypto_network") or "").upper()
        verifier = AUTO_VERIFY_NETWORKS.get(network)
        if not verifier:
            return {"ok": True, "status": "pending", "auto": False}
        wallets = cfg.get("crypto_wallets") or []
        if isinstance(wallets, dict):
            wallets = list(wallets.values())
        wallet = next(
            (w for w in wallets if isinstance(w, dict) and str(w.get("network", "")).upper() == network),
            None,
        )
        if not wallet:
            return {"ok": False, "status": "pending", "reason": "wallet-missing"}
        result = await verifier(ref, wallet.get("address") or "", required)
        approved = bool(result.get("ok"))
        reason = result.get("reason")
    elif method == "binance_id":
        approved = await _match_binance_pay(ref, required, "USDT", cfg)

    if approved:
        now = int(time.time() * 1000)
        await update_data(
            f"deposits/{deposit_id}",
            {"status": "approved", "verified_at": now},
        )
        await credit_balance(str(deposit.get("user_id") or ""), required)
        await reward_referrer_for_user(str(deposit.get("user_id") or ""), "purchase", deposit_id)
        return {"ok": True, "status": "approved", "amount": required}

    return {"ok": True, "status": "pending", "reason": reason}


@router.get("/deposits", dependencies=[Depends(require_admin_key)])
async def list_deposits() -> Any:
    return await read_data("deposits")


@router.post("/deposits/{deposit_id}/approve", dependencies=[Depends(require_admin_key)])
async def approve_deposit(deposit_id: str) -> dict:
    deposit = await read_data(f"deposits/{deposit_id}")
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if deposit.get("status") != "approved":
        now = int(time.time() * 1000)
        await update_data(f"deposits/{deposit_id}", {"status": "approved", "verified_at": now})
        await credit_balance(str(deposit.get("user_id") or ""), float(deposit.get("amount") or 0))
        await reward_referrer_for_user(str(deposit.get("user_id") or ""), "purchase", deposit_id)
    return {"ok": True}


@router.post("/deposits/{deposit_id}/reject", dependencies=[Depends(require_admin_key)])
async def reject_deposit(deposit_id: str) -> dict:
    await update_data(f"deposits/{deposit_id}", {"status": "rejected", "verified_at": int(time.time() * 1000)})
    return {"ok": True}


@router.get("/wallet/{user_id}")
async def wallet_get(user_id: str) -> Any:
    return await read_data(f"user_wallets/{user_id}")


@router.post("/wallet/pay")
async def wallet_pay(payload: dict) -> dict:
    user_id = str(payload.get("user_id") or "")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")
    purchase = await _build_purchase(payload, "wallet")
    amount = float(purchase.get("amount") or 0)
    wallet = (await read_data(f"user_wallets/{user_id}")) or {}
    balance = float(wallet.get("balance") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid amount")
    if balance < amount:
        return {"ok": False, "reason": "insufficient", "balance": balance}
    await update_data(f"user_wallets/{user_id}", {"balance": round(balance - amount, 8), "updated_at": int(time.time() * 1000)})
    now = int(time.time() * 1000)
    purchase.update({"status": "approved", "verified_at": now, "verified_by": "wallet"})
    purchase_key = await push_data("purchases", purchase)
    await apply_purchase({**purchase, "user_id": user_id, "status": "approved"})
    await reward_referrer_for_user(user_id, "purchase", purchase_key or "")
    return {"ok": True, "balance": round(balance - amount, 8)}


@router.post("/use-credit")
async def use_credit_endpoint(payload: dict) -> dict:
    user_id = str(payload.get("user_id") or "")
    video_id = str(payload.get("video_id") or "")
    video = await read_data(f"videos/{video_id}") or {}
    required = int(video.get("ad_watches_required") or 1)
    return await use_credit(user_id, video_id, max(required, 1))


@router.get("/entitlement/{user_id}")
async def get_entitlement(user_id: str) -> Any:
    return await read_data(entitlement_path(user_id))
