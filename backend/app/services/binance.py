from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from typing import Any

import httpx

BASE_URL = "https://bpay.binanceapi.com"


def _sign(secret: str, payload: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha512).hexdigest().upper()


def _headers(api_key: str, api_secret: str, body: dict) -> tuple[dict, str]:
    timestamp = str(int(time.time() * 1000))
    nonce = secrets.token_hex(16)
    body_str = json.dumps(body)
    signature_payload = f"{timestamp}\n{nonce}\n{body_str}\n"
    headers = {
        "Content-Type": "application/json",
        "BinancePay-Timestamp": timestamp,
        "BinancePay-Nonce": nonce,
        "BinancePay-Certificate-SN": api_key,
        "BinancePay-Signature": _sign(api_secret, signature_payload),
    }
    return headers, body_str


async def create_order(cfg: dict, amount: float, trade_no: str, goods_name: str, goods_id: str) -> Any:
    body = {
        "env": {"terminalType": "WEB"},
        "merchantTradeNo": trade_no,
        "orderAmount": amount,
        "currency": "USDT",
        "goods": {
            "goodsType": "02",
            "goodsCategory": "Z000",
            "referenceGoodsId": goods_id,
            "goodsName": goods_name[:128],
        },
    }
    headers, _ = _headers(cfg.get("binance_api_key", ""), cfg.get("binance_api_secret", ""), body)
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(f"{BASE_URL}/binancepay/openapi/v3/order", headers=headers, json=body)
        return resp.json()


async def query_order(cfg: dict, trade_no: str) -> Any:
    body = {"merchantTradeNo": trade_no}
    headers, _ = _headers(cfg.get("binance_api_key", ""), cfg.get("binance_api_secret", ""), body)
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(f"{BASE_URL}/binancepay/openapi/v2/order/query", headers=headers, json=body)
        return resp.json()


def _sapi_query_params(secret: str, params: dict) -> str:
    from urllib.parse import urlencode

    qs = urlencode(params)
    signature = hmac.new(secret.encode(), qs.encode(), hashlib.sha256).hexdigest()
    return f"{qs}&signature={signature}"


async def query_pay_transactions(cfg: dict, limit: int = 50) -> dict:
    params = {
        "limit": limit,
        "recvWindow": 10000,
        "timestamp": str(int(time.time() * 1000)),
    }
    secret = cfg.get("binance_api_secret", "")
    key = cfg.get("binance_api_key", "")
    if not (key and secret):
        return {"ok": False, "items": []}
    qs = _sapi_query_params(secret, params)
    headers = {"X-MBX-APIKEY": key}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(f"https://api.binance.com/sapi/v1/pay/transactions?{qs}", headers=headers)
    except Exception:
        return {"ok": False, "items": []}
    if resp.status_code != 200:
        return {"ok": False, "items": []}
    data = resp.json() or {}
    if not isinstance(data, dict):
        return {"ok": False, "items": []}
    items = data.get("data") or []
    return {"ok": isinstance(items, list), "items": items if isinstance(items, list) else []}
