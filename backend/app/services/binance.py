from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any

import httpx

BASE_URL = "https://bpay.binanceapi.com"


def _client_kwargs() -> dict:
    """Common httpx client options.

    Binance geo-blocks many datacenter IPs (Render US returns HTTP 451 on all
    sapi hosts). An optional BINANCE_PROXY env var (e.g. http://host:port)
    routes Binance traffic through an allowed relay so auto-verify keeps
    working on any host.
    """
    kwargs: dict[str, Any] = {"timeout": 20}
    proxy = (os.environ.get("BINANCE_PROXY") or "").strip()
    if proxy:
        kwargs["proxy"] = proxy
    return kwargs


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
    async with httpx.AsyncClient(**_client_kwargs()) as client:
        resp = await client.post(f"{BASE_URL}/binancepay/openapi/v3/order", headers=headers, json=body)
        return resp.json()


async def query_order(cfg: dict, trade_no: str) -> Any:
    body = {"merchantTradeNo": trade_no}
    headers, _ = _headers(cfg.get("binance_api_key", ""), cfg.get("binance_api_secret", ""), body)
    async with httpx.AsyncClient(**_client_kwargs()) as client:
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
    # Some hosts (e.g. api.binance.com) refuse datacenter IPs in certain regions;
    # try every mirror before giving up so auto-verify keeps working on Render.
    hosts = [
        "https://api.binance.com",
        "https://api1.binance.com",
        "https://api2.binance.com",
        "https://api3.binance.com",
        "https://api-gcp.binance.com",
    ]
    resp = None
    last_status = None
    try:
        async with httpx.AsyncClient(**_client_kwargs()) as client:
            for host in hosts:
                try:
                    resp = await client.get(f"{host}/sapi/v1/pay/transactions?{qs}", headers=headers)
                except Exception:
                    resp = None
                    continue
                last_status = resp.status_code
                if resp.status_code == 200:
                    break
    except Exception:
        return {"ok": False, "items": [], "gateway_error": "network"}
    if resp is None or last_status != 200:
        return {"ok": False, "items": [], "gateway_error": f"binance-http-{last_status or 'timeout'}"}
    data = resp.json() or {}
    if not isinstance(data, dict):
        return {"ok": False, "items": []}
    items = data.get("data") or []
    return {"ok": isinstance(items, list), "items": items if isinstance(items, list) else []}


async def query_deposit_history(cfg: dict, limit: int = 50) -> dict:
    """Wallet DEPOSIT history (/sapi/v1/capital/deposit/hisrec).

    Needed because on Binance, transfers between two Binance users sent to the
    wallet address are routed off-chain: the receiver's deposit history shows
    txId = "Off-chain transfer <number>" — this never appears in Pay
    transactions, only here.
    """
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
    hosts = [
        "https://api.binance.com",
        "https://api1.binance.com",
        "https://api2.binance.com",
        "https://api3.binance.com",
        "https://api-gcp.binance.com",
    ]
    resp = None
    last_status = None
    try:
        async with httpx.AsyncClient(**_client_kwargs()) as client:
            for host in hosts:
                try:
                    resp = await client.get(f"{host}/sapi/v1/capital/deposit/hisrec?{qs}", headers=headers)
                except Exception:
                    resp = None
                    continue
                last_status = resp.status_code
                if resp.status_code == 200:
                    break
    except Exception:
        return {"ok": False, "items": [], "gateway_error": "network"}
    if resp is None or last_status != 200:
        return {"ok": False, "items": [], "gateway_error": f"binance-http-{last_status or 'timeout'}"}
    data = resp.json()
    if not isinstance(data, list):
        return {"ok": False, "items": []}
    return {"ok": True, "items": data}
