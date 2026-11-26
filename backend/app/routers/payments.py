from __future__ import annotations

import re
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



def _txid_plausible(txid: str, network: str) -> bool:
    """Reject obviously fake Transaction IDs before they create a pending order."""
    t = str(txid or "").strip()
    if len(t) < 16:
        return False
    up = str(network or "").upper()
    if up == "TRC20":
        return bool(re.fullmatch(r"[0-9a-fA-F]{64}", t))
    if up in ("BEP20", "ERC20"):
        return bool(re.fullmatch(r"0x[0-9a-fA-F]{64}", t))
    return True


def _transfer_id_plausible(ref: str) -> bool:
    """Binance Pay Transfer IDs are long numeric strings."""
    return bool(re.fullmatch(r"\d{6,25}", str(ref or "").strip()))



def _offchain_digits(ref: str) -> str:
    """Users often paste 'Off-chain transfer 435223450025' from Binance receipts.
    If the reference points to an off-chain Binance Pay transfer, return its numeric ID."""
    t = str(ref or "").strip()
    if re.fullmatch(r"(?i)off[\s\-]*chain[\s\-]*transfer[\s\-]*(\d{6,25})", t):
        return re.search(r"(\d{6,25})", t).group(1)
    return t

async def _ref_already_used(ref: str, exclude_purchase: str = "", exclude_deposit: str = "") -> bool:
    """True if the same transaction reference was already submitted anywhere (purchases or deposits)."""
    t = str(ref or "").strip().lower()
    if not t:
        return False

    def _scan(node: dict, exclude_key: str) -> bool:
        if not isinstance(node, dict):
            return False
        for key, item in node.items():
            if key == exclude_key or not isinstance(item, dict):
                continue
            if str(item.get("transaction_ref") or "").strip().lower() == t:
                return True
        return False

    purchases = (await read_data("purchases")) or {}
    if _scan(purchases, exclude_purchase):
        return True
    deposits = (await read_data("deposits")) or {}
    return _scan(deposits, exclude_deposit)

async def _credit_excess(user_id: str, required: float, paid: Any) -> None:
    """If the user paid more than required, top up the remainder to their wallet."""
    try:
        paid_amt = float(paid) if paid is not None else float(required)
    except (TypeError, ValueError):
        paid_amt = float(required)
    excess = round(paid_amt - float(required), 8)
    if excess > 0.000001:
        await credit_balance(user_id, excess)


async def _scan_binance_deposits(ref: str, required: float, now_ms: int, window_ms: int) -> tuple:
    """Scan Binance wallet DEPOSIT history for a matching transfer.

    When a Binance user sends USDT to our wallet ADDRESS from inside the
    Binance app, Binance routes it off-chain and the receiver history shows
    txId = "Off-chain transfer <number>" — this NEVER appears in Pay
    transactions, only in /sapi/v1/capital/deposit/hisrec. Any arriving
    deposit is real money received by us, so it is eligible the same way.
    """
    cfg = (await read_data("payments_config")) or {}
    result = await binance.query_deposit_history(cfg, limit=50)
    if not result.get("ok"):
        return (None, None)
    ref = str(ref or "").strip()
    exact = None
    fallback = None
    for rec in result.get("items") or []:
        if not isinstance(rec, dict):
            continue
        if str(rec.get("coin") or "").upper() != "USDT":
            continue
        try:
            if int(rec.get("status") or -1) != 1:  # 1 = success
                continue
        except (TypeError, ValueError):
            continue
        try:
            amt = float(rec.get("amount") or 0)
        except (TypeError, ValueError):
            continue
        if amt <= 0:
            continue
        if required > 0 and amt < required:
            continue
        txid_full = str(rec.get("txId") or "").strip()
        digits = _offchain_digits(txid_full)
        rec_id = str(rec.get("id") or "").strip()
        tx_key = f"dep_{rec_id}" if rec_id else (digits or txid_full)
        ts = int(rec.get("insertTime") or rec.get("completeTime") or 0)
        if ref and ref and (txid_full == ref or (digits and digits == ref) or (ref in txid_full)):
            return ({"ok": True, "amount": amt, "tx_id": tx_key}, None)
        if fallback is None and ts and (now_ms - ts) < window_ms:
            fallback = {"ok": True, "amount": amt, "tx_id": tx_key}
    return (exact, fallback)


async def _match_binance_pay(ref: str, required: float, currency: str, cfg: dict) -> dict:
    """Match a Binance Pay transfer OR a Binance wallet deposit.

    Binance Pay transfers are off-chain and the sender's receipt shows a short
    numeric ID that may differ from the receiver-side transactionId. So we accept:
      1) an exact transactionId match, OR
      2) any not-yet-consumed received USDT transfer of the required amount
         (or more) within the last 2 hours.
    Deposits sent to our wallet addresses from inside Binance arrive off-chain
    as "Off-chain transfer <number>" — these are matched via the deposit
    history too (see _scan_binance_deposits).
    Consumed transfers are recorded in used_binance_txids so a payment can
    never be credited twice.
    """
    result = await binance.query_pay_transactions(cfg, limit=50)
    if not result.get("ok"):
        return {"ok": False}
    ref = str(ref or "").strip()
    now_ms = int(time.time() * 1000)
    window_ms = 2 * 60 * 60 * 1000
    exact = None
    fallback = None
    for tx in result.get("items") or []:
        if not isinstance(tx, dict):
            continue
        try:
            tx_amount = float(tx.get("amount") or 0)
        except (TypeError, ValueError):
            continue
        # Only RECEIVED transfers count (sent = negative) and never credit twice.
        if tx_amount <= 0:
            continue
        if required > 0 and tx_amount < required:
            continue
        tx_currency = str(tx.get("currency") or "")
        if tx_currency and tx_currency != currency:
            continue
        # The Binance app shows the numeric "orderId" on receipts ("Off-chain
        # transfer 462443681506172928") while the API "transactionId" differs —
        # accept both, prefer an exact hit on either.
        tx_id = str(tx.get("transactionId") or "").strip()
        order_id = str(tx.get("orderId") or "").strip()
        ts = int(tx.get("transactionTime") or tx.get("payTime") or 0)
        if ref and (tx_id == ref or order_id == ref):
            exact = {"ok": True, "amount": tx_amount, "tx_id": tx_id or order_id}
            break
        if fallback is None and ts and (now_ms - ts) < window_ms:
            fallback = {"ok": True, "amount": tx_amount, "tx_id": tx_id or order_id}
    if exact:
        return exact
    if fallback:
        return fallback

    # Nothing in Pay history — check wallet deposit history as well.
    dep_exact, dep_fallback = await _scan_binance_deposits(ref, required, now_ms, window_ms)
    if dep_exact:
        return dep_exact
    if dep_fallback:
        return dep_fallback
    return {"ok": False}


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
async def binance_check(purchase_id: str, finalize: int = 0) -> dict:
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

    if finalize:
        # User hit the verification deadline: reject the order immediately
        # unless payment really is complete on the Binance side.
        await update_data(
            f"purchases/{purchase_id}",
            {"status": "rejected", "reject_reason": "not-found-timeout"},
        )
        return {"ok": True, "status": "rejected", "reason": "not-found-timeout"}

    return {"ok": True, "status": purchase.get("status") or "pending", "binance_status": binance_status}


@router.post("/manual/create")
async def manual_create(payload: dict) -> dict:
    purchase = await _build_purchase(payload, "manual")
    purchase["transaction_ref"] = str(payload.get("transaction_ref") or "")
    if purchase["transaction_ref"] and await _ref_already_used(purchase["transaction_ref"]):
        return {"ok": False, "reason": "duplicate-txid"}
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
    if not _txid_plausible(txid, network):
        # Not a blockchain hash — but users frequently paste the Binance receipt
        # line ("Off-chain transfer 435223450025") here. Accept it and verify
        # through Binance Pay transfer history instead of the blockchain.
        norm = _offchain_digits(txid)
        if re.fullmatch(r"\d{6,25}", norm):
            purchase["transaction_ref"] = norm
            purchase["method"] = "binance_id"
            purchase_id = await push_data("purchases", purchase)
            return {"ok": True, "purchase_id": purchase_id, "auto": True, "rerouted": "binance-pay"}
        return {"ok": False, "reason": "invalid-txid"}
    if await _ref_already_used(txid):
        return {"ok": False, "reason": "duplicate-txid"}
    purchase["crypto_network"] = network
    purchase["transaction_ref"] = txid
    purchase_id = await push_data("purchases", purchase)
    return {"ok": True, "purchase_id": purchase_id, "auto": network in AUTO_VERIFY_NETWORKS}


@router.get("/crypto/check/{purchase_id}")
async def crypto_check(purchase_id: str, finalize: int = 0) -> dict:
    purchase = await read_data(f"purchases/{purchase_id}")
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if purchase.get("status") == "approved":
        return {"ok": True, "status": "approved"}

    if not purchase.get("crypto_network"):
        # Re-routed off-chain Binance Pay transfer — match against the merchant's
        # received Pay transfers instead of the blockchain.
        cfg0 = (await read_data("payments_config")) or {}
        match = await _match_binance_pay(
            str(purchase.get("transaction_ref") or ""),
            float(purchase.get("amount") or 0),
            "USDT",
            cfg0,
        )
        if match.get("ok"):
            matched_tx = str(match.get("tx_id") or "").strip()
            now = int(time.time() * 1000)
            if matched_tx:
                if await read_data(f"used_binance_txids/{matched_tx}"):
                    await update_data(f"purchases/{purchase_id}", {"status": "rejected", "reject_reason": "duplicate-txid"})
                    return {"ok": False, "status": "rejected", "reason": "duplicate-txid"}
                await update_data(f"used_binance_txids/{matched_tx}", {"purchase_id": purchase_id, "ts": now})
            await update_data(
                f"purchases/{purchase_id}",
                {"status": "approved", "verified_at": now, "verified_by": "auto-binance-pay", "matched_transaction_id": matched_tx or None},
            )
            await apply_purchase({**purchase, "status": "approved"})
            await _credit_excess(str(purchase.get("user_id") or ""), float(purchase.get("amount") or 0), match.get("amount"))
            await reward_referrer_for_user(str(purchase.get("user_id") or ""), "purchase", purchase_id)
            return {"ok": True, "status": "approved"}
        if finalize:
            await update_data(
                f"purchases/{purchase_id}",
                {"status": "rejected", "reject_reason": "not-found-timeout"},
            )
            return {"ok": True, "status": "rejected", "reason": "not-found-timeout"}
        return {"ok": True, "status": purchase.get("status") or "pending", "reason": "tx-not-found"}

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
        if await _ref_already_used(str(purchase.get("transaction_ref") or ""), exclude_purchase=purchase_id):
            await update_data(f"purchases/{purchase_id}", {"status": "rejected", "reject_reason": "duplicate-txid"})
            return {"ok": False, "status": "rejected", "reason": "duplicate-txid"}
        now = int(time.time() * 1000)
        await update_data(
            f"purchases/{purchase_id}",
            {"status": "approved", "verified_at": now, "verified_by": f"auto-{network}"},
        )
        await apply_purchase({**purchase, "status": "approved"})
        await _credit_excess(str(purchase.get("user_id") or ""), float(purchase.get("amount") or 0), result.get("amount"))
        await reward_referrer_for_user(str(purchase.get("user_id") or ""), "purchase", purchase_id)
        return {"ok": True, "status": "approved"}

    if finalize and result.get("reason") != "network-error":
        # Deadline reached and the blockchain really has no matching
        # transaction - reject right away instead of leaving it pending.
        await update_data(
            f"purchases/{purchase_id}",
            {"status": "rejected", "reject_reason": "not-found-timeout"},
        )
        return {"ok": True, "status": "rejected", "reason": "not-found-timeout"}

    return {"ok": True, "status": purchase.get("status") or "pending", "reason": result.get("reason")}


@router.post("/binance-id/submit")
async def binance_id_submit(payload: dict) -> dict:
    purchase = await _build_purchase(payload, "binance_id")
    ref_id = str(payload.get("transfer_id") or payload.get("txid") or "").strip()
    if not ref_id:
        raise HTTPException(status_code=400, detail="transfer_id required")
    if not _transfer_id_plausible(ref_id):
        return {"ok": False, "reason": "invalid-txid"}
    if await _ref_already_used(ref_id):
        return {"ok": False, "reason": "duplicate-txid"}
    purchase["transaction_ref"] = ref_id
    purchase_id = await push_data("purchases", purchase)
    return {"ok": True, "purchase_id": purchase_id}


@router.get("/binance-id/check/{purchase_id}")
async def binance_id_check(purchase_id: str, finalize: int = 0) -> dict:
    purchase = await read_data(f"purchases/{purchase_id}")
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if purchase.get("status") == "approved":
        return {"ok": True, "status": "approved"}

    cfg = (await read_data("payments_config")) or {}
    result = await binance.query_pay_transactions(cfg)
    if not result.get("ok"):
        return {"ok": True, "status": purchase.get("status") or "pending", "auto": False, "gateway_error": result.get("gateway_error", "query-failed")}

    match = await _match_binance_pay(
        str(purchase.get("transaction_ref") or ""),
        float(purchase.get("amount") or 0),
        str(purchase.get("currency") or "USDT"),
        cfg,
    )
    if match.get("ok"):
        matched_tx = str(match.get("tx_id") or "").strip()
        now = int(time.time() * 1000)
        if matched_tx:
            if await read_data(f"used_binance_txids/{matched_tx}"):
                await update_data(f"purchases/{purchase_id}", {"status": "rejected", "reject_reason": "duplicate-txid"})
                return {"ok": False, "status": "rejected", "reason": "duplicate-txid"}
            await update_data(f"used_binance_txids/{matched_tx}", {"purchase_id": purchase_id, "ts": now})
        if await _ref_already_used(str(purchase.get("transaction_ref") or ""), exclude_purchase=purchase_id):
            await update_data(f"purchases/{purchase_id}", {"status": "rejected", "reject_reason": "duplicate-txid"})
            return {"ok": False, "status": "rejected", "reason": "duplicate-txid"}
        await update_data(
            f"purchases/{purchase_id}",
            {"status": "approved", "verified_at": now, "verified_by": "auto-binance-pay", "matched_transaction_id": matched_tx or None},
        )
        await apply_purchase({**purchase, "status": "approved"})
        await _credit_excess(str(purchase.get("user_id") or ""), float(purchase.get("amount") or 0), match.get("amount"))
        await reward_referrer_for_user(str(purchase.get("user_id") or ""), "purchase", purchase_id)
        return {"ok": True, "status": "approved"}

    if finalize:
        await update_data(
            f"purchases/{purchase_id}",
            {"status": "rejected", "reject_reason": "not-found-timeout"},
        )
        return {"ok": True, "status": "rejected", "reason": "not-found-timeout"}

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
    if method == "crypto" and not _txid_plausible(ref, network):
        return {"ok": False, "reason": "invalid-txid"}
    if method == "binance_id" and not _transfer_id_plausible(ref):
        return {"ok": False, "reason": "invalid-txid"}
    if await _ref_already_used(ref):
        return {"ok": False, "reason": "duplicate-txid"}
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
    paid_amount = required
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
        if approved and result.get("amount") is not None:
            try:
                paid_amount = max(required, float(result.get("amount")))
            except (TypeError, ValueError):
                paid_amount = required
    elif method == "binance_id":
        match = await _match_binance_pay(ref, required, "USDT", cfg)
        approved = bool(match.get("ok"))
        if approved and match.get("amount") is not None:
            try:
                paid_amount = max(required, float(match.get("amount")))
            except (TypeError, ValueError):
                paid_amount = required

    if approved:
        now = int(time.time() * 1000)
        if method == "binance_id":
            matched_tx = str(match.get("tx_id") or "").strip()
            if matched_tx:
                if await read_data(f"used_binance_txids/{matched_tx}"):
                    await update_data(f"deposits/{deposit_id}", {"status": "rejected", "reject_reason": "duplicate-txid"})
                    return {"ok": False, "status": "rejected", "reason": "duplicate-txid"}
                await update_data(f"used_binance_txids/{matched_tx}", {"deposit_id": deposit_id, "ts": now})
        await update_data(
            f"deposits/{deposit_id}",
            {"status": "approved", "verified_at": now, "matched_transaction_id": (str(match.get("tx_id") or "").strip() or None) if method == "binance_id" else None},
        )
        await credit_balance(str(deposit.get("user_id") or ""), paid_amount)
        await reward_referrer_for_user(str(deposit.get("user_id") or ""), "purchase", deposit_id)
        return {"ok": True, "status": "approved", "amount": paid_amount}

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
