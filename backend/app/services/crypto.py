from __future__ import annotations

import httpx

TRON_TX_API = "https://apilist.tronscanapi.com/api/transaction-info"
BSC_RPC = "https://bsc-dataseed.bnbchain.org"
USDT_BEP20_CONTRACT = "0x55d398326f99059fF775485246999027B3197955"


def _fail(reason: str) -> dict:
    return {"ok": False, "reason": reason}


def _matches(to_addr: str | None, amount: float, symbol: str, want_addr: str, min_amount: float) -> dict:
    if not to_addr:
        return _fail("not-a-token-transfer")
    if symbol and symbol.upper() != "USDT":
        return _fail("wrong-token")
    if str(to_addr).strip().lower() != str(want_addr).strip().lower():
        return _fail("wrong-address")
    if float(amount) < min_amount:
        return _fail("amount-too-low")
    return {"ok": True, "amount": float(amount)}


async def verify_trc20(txid: str, to_address: str, min_amount: float) -> dict:
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await client.get(TRON_TX_API, params={"hash": txid})
    except Exception:
        return _fail("network-error")
    if resp.status_code != 200:
        return _fail("tx-not-found")
    data = resp.json() or {}
    if data.get("confirmed") is False or not data:
        return _fail("tx-not-found")

    info = data.get("tokenTransferInfo") or {}
    if info:
        decimals = float(info.get("decimals") or 6)
        raw = float(info.get("amount_str") or info.get("amount") or 0)
        amount = raw / (10**decimals) if raw > 10**6 else raw
        return _matches(info.get("to_address"), amount, info.get("symbol"), to_address, min_amount)

    return _fail("tx-not-found")


async def verify_bep20(txid: str, to_address: str, min_amount: float) -> dict:
    async def rpc(method: str, params: list) -> dict | None:
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                resp = await client.post(
                    BSC_RPC,
                    json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
                )
            return resp.json() or {}
        except Exception:
            return {}

    tx = (await rpc("eth_getTransactionByHash", [txid])).get("result")
    if not tx or not tx.get("input") or tx["input"] == "0x":
        return _fail("tx-not-found")
    if str(tx.get("to") or "").lower() != USDT_BEP20_CONTRACT.lower():
        return _fail("not-a-token-transfer")

    inp: str = tx["input"][2:]
    if len(inp) < 136 or not inp.lower().startswith("a9059cbb"):
        return _fail("not-a-token-transfer")
    recipient = "0x" + inp[8:72][-40:]
    amount_raw = int(inp[72:136], 16) / 1e18

    match = _matches(recipient, amount_raw, "USDT", to_address, min_amount)
    if not match.get("ok"):
        return match

    receipt = (await rpc("eth_getTransactionReceipt", [txid])).get("result")
    if not receipt or receipt.get("status") != "0x1":
        return _fail("unconfirmed")
    return {"ok": True}
