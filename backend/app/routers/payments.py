from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..firebase_client import delete_data, push_data, read_data, update_data
from ..security import require_admin_key
from ..services import binance
from ..services.entitlements import apply_purchase, entitlement_path, use_credit

router = APIRouter(prefix="/payments", tags=["payments"])


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
        purchase["amount"] = float(pkg.get("price", 0)) if method == "binance" else float(pkg.get("bkash_price", 0) or pkg.get("price", 0))
        purchase["currency"] = "USDT" if method == "binance" else "BDT"
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
    for key in ("binance_enabled", "manual_enabled"):
        if key in payload:
            data[key] = bool(payload[key])
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
    return {"ok": True}


@router.post("/manual/{purchase_id}/reject", dependencies=[Depends(require_admin_key)])
async def reject_manual(purchase_id: str) -> dict:
    await update_data(f"purchases/{purchase_id}", {"status": "rejected", "verified_at": int(time.time() * 1000)})
    return {"ok": True}


@router.delete("/purchases/{purchase_id}", dependencies=[Depends(require_admin_key)])
async def delete_purchase(purchase_id: str) -> dict:
    await delete_data(f"purchases/{purchase_id}")
    return {"ok": True}


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
