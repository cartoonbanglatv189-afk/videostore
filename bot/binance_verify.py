"""Binance deposit auto-verification engine.

Faithful port of the proven deposit auto-verify system (signed Binance API,
on-chain txId check, off-chain/internal transfer check, Binance Pay check,
amount tolerance, time gate, redaction-blocking answer codes).

Blocking stdlib code — run from async with run_in_executor / to_thread.

Env:
  BINANCE_API_KEY / BINANCE_API_SECRET   (required)
  BINANCE_AUTO_VERIFY=1                  (0 = verification never runs -> manual)
  BINANCE_AUTO_CREDIT=1                  (1 = verified deposits credit automatically)
  BINANCE_API_BASE                       (default https://api.binance.com)
  BINANCE_PAY_LOOKBACK_DAYS=3 / BINANCE_PAY_MIN_INTERVAL=30 / BINANCE_OFFCHAIN_LOOKBACK_DAYS=7
"""
import os
import re
import hashlib
import hmac
import json
import threading
import time
import urllib.request
import urllib.parse
import urllib.error
from decimal import Decimal

BN_STABLE = {"USDT", "USDC", "BUSD", "FDUSD"}
BN_AMT_TOL = 0.005                      # received may be this much below the requested amount
BN_TIME_SKEW_MS = 2000                  # clock difference tolerated between this server and Binance


class BnApiError(Exception):
    def __init__(self, kind, msg):
        super().__init__(msg)
        self.kind = kind                # 'api_config' (retrying cannot help) | 'api_error' (may work later)


def bn_base() -> str:
    b = (os.environ.get("BINANCE_API_BASE") or "https://api.binance.com").strip().rstrip("/")
    return b if b.startswith("https://") else "https://api.binance.com"


def bn_creds_ok() -> bool:
    return bool(os.environ.get("BINANCE_API_KEY", "").strip()
                and os.environ.get("BINANCE_API_SECRET", "").strip()
                and os.environ.get("BINANCE_AUTO_VERIFY", "1").strip() != "0")


def bn_auto_credit_ok() -> bool:
    return os.environ.get("BINANCE_AUTO_CREDIT", "1").strip() != "0"


def bn_redact(text: str) -> str:
    """Removes anything that looks like an API key/secret/token from user-visible text."""
    s = str(text or "")
    for pat in (r"(api[^\s]{0,8}key\"?'?\s*[=:]\s*\"?)[0-9a-zA-Z]{16,}",
                r"(key\"?'?\s*[=:]\s*\"?)[0-9a-zA-Z]{32,}",
                r"(secret\"?'?\s*[=:]\s*\"?)[0-9a-zA-Z]{16,}",
                r"(signature\"?'?\s*[=:]\s*\"?)[0-9a-fA-F]{16,}"):
        s = re.sub(pat, r"\1***", s, flags=re.I)
    return s


def bn_signed_get(path, params=None):
    key = os.environ.get("BINANCE_API_KEY", "").strip()
    sec = os.environ.get("BINANCE_API_SECRET", "").strip()
    if not key or not sec:
        raise BnApiError("api_config", "BINANCE_API_KEY / BINANCE_API_SECRET missing")
    p = dict(params or {})
    p["timestamp"] = int(time.time() * 1000)
    p["recvWindow"] = 10000
    # Binance (since 2026-01-15) requires the payload to be PERCENT-ENCODED *before* the HMAC is
    # computed, and the very same string sent on the wire.  urlencode()'s default turns a space
    # into '+' (quote_plus), which Binance rejects with -1022 for values such as
    # txId='Off-chain transfer 425363575640'.  quote() gives RFC 3986 (%20).
    qs = urllib.parse.urlencode(p, quote_via=urllib.parse.quote, safe="")
    sig = hmac.new(sec.encode(), qs.encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(f"{bn_base()}{path}?{qs}&signature={sig}",
                                 headers={"X-MBX-APIKEY": key})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8")[:300]
        except Exception:
            pass
        bcode = None
        try:
            bcode = json.loads(body).get("code")
        except Exception:
            pass
        cfg_err = (e.code in (401, 403, 451)) or (bcode in (-2014, -2015, -1022, -2008))
        raise BnApiError("api_config" if cfg_err else "api_error", f"HTTP {e.code} code={bcode} {body}")
    except (urllib.error.URLError, OSError, TimeoutError) as e:
        raise BnApiError("api_error", f"network: {type(e).__name__}: {e}")
    try:
        return json.loads(raw)
    except Exception:
        raise BnApiError("api_error", "Binance returned a non-JSON answer")


# ---------------- Binance Pay history (rate-limited, cached) ----------------

PAY_STATE = {"at": 0.0, "call_at": 0.0, "rows": None, "days": 0}
PAY_LOCK = threading.Lock()


def bn_pay_interval() -> float:
    try:
        return max(0.0, float(os.environ.get("BINANCE_PAY_MIN_INTERVAL", "30")))
    except Exception:
        return 30.0


def bn_pay_fetch(start_ms, end_ms, depth=0):
    """One window of the Binance Pay history. A full page (100 rows) may be cut off -> halve the window."""
    r = bn_signed_get("/sapi/v1/pay/transactions",
                      {"startTimestamp": int(start_ms), "endTimestamp": int(end_ms), "limit": 100})
    if not isinstance(r, dict):
        raise BnApiError("api_error", "unexpected Pay history answer")
    if r.get("success") is False or str(r.get("code", "000000")) not in ("000000", "0"):
        msg = str(r.get("message") or r.get("code"))
        low = msg.lower()
        raise BnApiError("api_config" if ("permission" in low or "not authorized" in low or "ip" in low.split()) else "api_error",
                         f"pay history: {msg}"[:250])
    payload = r.get("data")
    if isinstance(payload, list):
        raw_rows = payload
    elif isinstance(payload, dict):
        raw_rows = None
        for _k in ("data", "list", "rows", "transactions", "transactionList", "orders", "records"):
            _v = payload.get(_k)
            if isinstance(_v, list):
                raw_rows = _v
                break
        if raw_rows is None and any(_k in payload for _k in (
                "transactionId", "orderId", "transaction_id", "order_id", "merchantTradeNo", "prepayId")):
            raw_rows = [payload]
        if raw_rows is None:
            raise BnApiError("api_error", "Pay history response had an unknown data shape")
    else:
        raise BnApiError("api_error", "Pay history response data was not a list/object")
    rows = [t for t in raw_rows if isinstance(t, dict)]
    if len(rows) >= 100 and depth < 5 and (end_ms - start_ms) > 60000:
        mid = int((start_ms + end_ms) // 2)
        a = bn_pay_fetch(start_ms, mid, depth + 1)
        time.sleep(bn_pay_interval())
        b = bn_pay_fetch(mid + 1, end_ms, depth + 1)
        return a + b
    return rows


def bn_pay_rows():
    """Recent Binance Pay history, shared/cached for 25s and rate-limited."""
    try:
        days = max(1, min(30, int(os.environ.get("BINANCE_PAY_LOOKBACK_DAYS", "3"))))
    except Exception:
        days = 3
    with PAY_LOCK:
        now = time.time()
        if (PAY_STATE["rows"] is not None and PAY_STATE["days"] == days
                and now - PAY_STATE["at"] < 25):
            return PAY_STATE["rows"]
        wait = bn_pay_interval() - (now - PAY_STATE["call_at"])
        if wait > 0:
            time.sleep(min(wait, 60))
        PAY_STATE["call_at"] = time.time()
        end_ms = int(time.time() * 1000)
        rows = bn_pay_fetch(end_ms - days * 86400 * 1000, end_ms)
        PAY_STATE.update(at=time.time(), rows=rows, days=days)
        return rows


# ---------------- reference normalisation ----------------

BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")     # Bengali digits -> ASCII
BN_INVIS_RE = re.compile(r"[\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u2060\u3000\ufeff]")
# "Off-chain transfer 425346342153" / "Internal transfer #425346342153" / "txid Off-chain transfer ..."
BN_OFFCHAIN_RE = re.compile(
    r"^(?:(?:tx\s*id|txid|transaction(?:\s*id)?|ref(?:erence)?(?:\s*(?:no|id))?)\s*[:#\-\-]?\s*)?"
    r"(?:off[\s\-_]*chain|binance[\s\-_]*internal|internal)(?:[\s\-_]*transfer)?(?:\s*(?:id|no\.?|number))?[\s:#\-\-]*(\d{6,20})$")
BN_NUM_REF_RE = re.compile(r"^#?(\d{6,20})$")


def bn_clean_ref(raw) -> str:
    s = str(raw or "").translate(BN_DIGITS)
    s = BN_INVIS_RE.sub(" ", s)
    s = s.strip().strip("`'\"").strip().lower()
    return re.sub(r"\s+", " ", s)


def bn_norm_tx(raw) -> str:
    """Canonical form of a TxID / Order ID for every comparison. 'Off-chain transfer 424...' -> just the number."""
    s = bn_clean_ref(raw)
    m = BN_OFFCHAIN_RE.match(s)
    if m:
        return m.group(1)
    m = BN_NUM_REF_RE.match(s)
    if m:
        return m.group(1)
    s = s.replace(" ", "")
    return s[2:] if s.startswith("0x") else s


def bn_offchain_id(raw, kind="") -> str:
    """The numeric off-chain/internal transfer ID the user meant, or ''."""
    s = bn_clean_ref(raw)
    if not s:
        return ""
    m = BN_OFFCHAIN_RE.match(s)
    if m:
        return m.group(1)
    if kind != "pay":
        m = BN_NUM_REF_RE.match(s)
        if m:
            return m.group(1)
    return ""


def bn_valid_tx(kind, raw) -> bool:
    if bn_offchain_id(raw, kind):
        return True
    n = bn_norm_tx(raw)
    if kind == "onchain":
        return bool(re.fullmatch(r"[0-9a-f]{64}", n))
    if kind == "pay":
        return bool(re.fullmatch(r"[a-z0-9_\-]{6,64}", n))
    return False


def txc_key(ref) -> str:
    return re.sub(r"[^a-z0-9_\-]", "_", bn_norm_tx(ref))[:120]


def bn_addr_eq(code, a, b) -> bool:
    a, b = str(a or "").strip(), str(b or "").strip()
    return (a == b) if code == "TRX" else (a.lower() == b.lower())


# ---------------- verdict helpers ----------------

def bn_amount_verdict(got, exp, info):
    try:
        got_d, exp_d = Decimal(str(got).strip()), Decimal(str(exp).strip())
        if not (got_d.is_finite() and exp_d.is_finite()):
            raise ValueError("non-finite amount")
        got, exp = float(got_d), float(exp_d)
    except Exception:
        return {"status": "review", "code": "incomplete_data", "detail": "amount unreadable", **info}
    if not (got_d > 0) or not (exp_d > 0):
        return {"status": "review", "code": "incomplete_data", "detail": f"amount {got} / requested {exp}", **info}
    if got_d + Decimal(str(BN_AMT_TOL)) < exp_d:
        return {"status": "review", "code": "mismatch_amount",
                "detail": f"received {got} < requested {exp}", **info}
    if got_d - exp_d > max(Decimal("0.01"), exp_d * Decimal("0.01")):
        return {"status": "review", "code": "overpaid",
                "detail": f"received {got} > requested {exp}", **info}
    return {"status": "ok", "code": "ok", "detail": "", **info}


def bn_time_gate(snap, pay_ms, info):
    """A payment may only settle a deposit if it happened AFTER the address was shown for that deposit (snap['t0'])."""
    try:
        t0 = int(snap.get("t0") or 0)
    except Exception:
        t0 = 0
    if t0 <= 0:
        return {"status": "review", "code": "no_time_ref", "detail": "deposit start time not stored", **info}
    try:
        ts = int(float(pay_ms or 0))
    except Exception:
        ts = 0
    if ts <= 0:
        return {"status": "review", "code": "time_unknown", "detail": "Binance gave no payment time", **info}
    info["pay_ms"] = ts
    if ts + BN_TIME_SKEW_MS < t0:
        return {"status": "review", "code": "payment_too_old",
                "detail": f"payment time {ts} is before the deposit request {t0}", **info}
    return None


def bn_hisrec(params) -> list:
    """GET /sapi/v1/capital/deposit/hisrec (read-only) -> list of rows."""
    r = bn_signed_get("/sapi/v1/capital/deposit/hisrec", params)
    if isinstance(r, dict):
        raise BnApiError("api_error", f"deposit history: {str(r)[:200]}")
    return [d for d in (r or []) if isinstance(d, dict)]


def bn_row_offchain_id(d) -> str:
    """Numeric ID of a deposit-history row that IS a Binance internal/off-chain transfer, else ''."""
    tid = bn_clean_ref(d.get("txId"))
    m = BN_OFFCHAIN_RE.match(tid)
    if m:
        return m.group(1)
    if str(d.get("transferType", 0)) == "1" and not re.fullmatch(r"[0-9a-f]{64}", tid):
        m = BN_NUM_REF_RE.match(tid) or re.search(r"(\d{6,20})$", tid)
        if m:
            return m.group(1)
    return ""


def bn_offchain_lookback_days() -> int:
    try:
        return max(1, min(90, int(os.environ.get("BINANCE_OFFCHAIN_LOOKBACK_DAYS", "7"))))
    except Exception:
        return 7


# ---------------- checkers ----------------

def bn_check_onchain(snap, raw_tx, tx_n, exp):
    code = str(snap.get("code") or "")
    cands = []
    for c in (str(raw_tx or "").strip(), tx_n, ("0x" + tx_n) if code in ("BSC", "ETH") else ""):
        if c and c not in cands:
            cands.append(c)
    found = []
    for c in cands:
        r = bn_signed_get("/sapi/v1/capital/deposit/hisrec", {"txId": c, "limit": 100})
        if isinstance(r, dict):
            raise BnApiError("api_error", f"deposit history: {str(r)[:200]}")
        found = [d for d in (r or []) if isinstance(d, dict) and bn_norm_tx(d.get("txId")) == tx_n]
        if found:
            break
    if not found:
        return {"status": "retry", "code": "not_found", "detail": "txId not in the Binance deposit history"}
    d = next((x for x in found if bn_addr_eq(code, x.get("address"), snap.get("address"))), found[0])
    coin = str(d.get("coin", "")).upper()
    net = str(d.get("network", "")).upper()
    addr = str(d.get("address", ""))
    try:
        amt = float(d.get("amount") or 0)
    except Exception:
        amt = 0.0
    info = {"amount": amt, "coin": coin, "network": net, "address": addr, "source": "deposit", "ref": tx_n,
            "bstatus": d.get("status"), "confirm": str(d.get("confirmTimes", ""))}
    if str(d.get("transferType", 0)) == "1":
        return {"status": "review", "code": "internal_transfer", "detail": "transferType=1", **info}
    if coin != str(snap.get("asset") or "USDT").upper():
        return {"status": "review", "code": "mismatch_asset", "detail": f"received {coin}, expected {snap.get('asset')}", **info}
    if net != code:
        return {"status": "review", "code": "mismatch_network", "detail": f"received {net}, expected {code}", **info}
    if not bn_addr_eq(code, addr, snap.get("address")):
        return {"status": "review", "code": "mismatch_address",
                "detail": f"paid to {addr[:12]}..., expected {str(snap.get('address'))[:12]}...", **info}
    tg = bn_time_gate(snap, d.get("insertTime"), info)
    if tg:
        return tg
    st = d.get("status")
    if st in (1, 6):            # 1 = success, 6 = credited (cannot withdraw yet): money is in the account
        return bn_amount_verdict(amt, exp, info)
    if st in (0, 8):            # 0 = pending confirmations, 8 = waiting for the user to confirm
        return {"status": "retry", "code": "pending_confirm",
                "detail": f"status {st}, confirmations {d.get('confirmTimes', '?')}", **info}
    return {"status": "review", "code": "binance_rejected", "detail": f"status {st}", **info}


def bn_check_offchain(snap, oc_id, exp):
    """Verifies a Binance internal/off-chain transfer through the deposit history (transferType=1)."""
    asset = str(snap.get("asset") or "USDT").upper()
    code = str(snap.get("code") or "")
    want_addr = str(snap.get("address") or "").strip()
    rows = []
    # 1) direct lookup by the txId Binance shows for internal transfers ('Off-chain transfer <id>')
    for c in (f"Off-chain transfer {oc_id}", oc_id):
        rows = [d for d in bn_hisrec({"txId": c, "limit": 100}) if bn_row_offchain_id(d) == oc_id]
        if rows:
            break
    # 2) fallback: recent history of this asset, matched on the numeric ID
    if not rows:
        now = int(time.time() * 1000)
        start = now - bn_offchain_lookback_days() * 86400 * 1000
        off = 0
        for _page in range(5):
            page = bn_hisrec({"coin": asset, "startTime": start, "endTime": now, "limit": 1000, "offset": off})
            rows = [d for d in page if bn_row_offchain_id(d) == oc_id]
            if rows or len(page) < 1000:
                break
            off += 1000
    if not rows:
        return {"status": "retry", "code": "not_found",
                "detail": f"internal/off-chain transfer {oc_id} not in the Binance deposit history"}

    def _addr_match(x):
        c = code or ("ETH" if str(want_addr).lower().startswith("0x") else "TRX")
        return bn_addr_eq(c, x.get("address"), want_addr)

    d = (next((x for x in rows if str(x.get("coin", "")).upper() == asset and _addr_match(x)), None)
         or next((x for x in rows if str(x.get("coin", "")).upper() == asset), None) or rows[0])
    coin = str(d.get("coin", "")).upper()
    net = str(d.get("network", "")).upper()
    addr = str(d.get("address") or "").strip()
    try:
        amt = float(d.get("amount") or 0)
    except Exception:
        amt = 0.0
    info = {"amount": amt, "coin": coin, "network": net or "INTERNAL", "address": addr, "source": "deposit",
            "ref": oc_id, "bstatus": d.get("status"), "confirm": str(d.get("confirmTimes", "")),
            "internal": True, "transfer_type": d.get("transferType")}
    if str(d.get("transferType", 0)) != "1":
        return {"status": "review", "code": "not_internal", "detail": f"transferType={d.get('transferType')}", **info}
    if coin != asset:
        return {"status": "review", "code": "mismatch_asset", "detail": f"received {coin}, expected {asset}", **info}
    if code and net and net != code:
        return {"status": "review", "code": "mismatch_network", "detail": f"received {net}, expected {code}", **info}
    if not addr:
        return {"status": "review", "code": "no_recipient", "detail": "Binance gave no destination address", **info}
    if not _addr_match(d):
        return {"status": "review", "code": "mismatch_address",
                "detail": f"paid to {addr[:12]}..., expected {want_addr[:12]}...", **info}
    tg = bn_time_gate(snap, d.get("insertTime"), info)
    if tg:
        return tg
    st = d.get("status")
    if st in (1, 6):
        return bn_amount_verdict(amt, exp, info)
    if st in (0, 8):
        return {"status": "retry", "code": "pending_confirm", "detail": f"status {st}", **info}
    return {"status": "review", "code": "binance_rejected", "detail": f"status {st}", **info}


def bn_check_pay(snap, tx_n, exp):
    rows = bn_pay_rows()
    for t in rows:
        ids = {bn_norm_tx(t.get("transactionId", "")), bn_norm_tx(t.get("orderId", ""))}
        ids.discard("")
        # Binance may report the id with a prefix (e.g. "M_P_71505104267788288"); accept the exact
        # id OR the same id without the prefix - never a partial match.
        ids |= {m.group(1) for m in (re.fullmatch(r"m_[a-z]{1,2}_(\d{6,})", i) for i in ids) if m}
        if tx_n not in ids:
            continue
        cur = str(t.get("currency", "")).upper()
        try:
            amt = float(t.get("amount") or 0)
        except Exception:
            amt = 0.0
        pi = t.get("payerInfo") if isinstance(t.get("payerInfo"), dict) else {}
        info = {"amount": amt, "coin": cur, "network": "PAY", "address": "", "source": "pay",
                "ref": txc_key(t.get("transactionId") or t.get("orderId") or ""),
                "payer": f"{pi.get('name', '')} / {pi.get('binanceId', '')}".strip(" /"),
                "payer_id": str(pi.get("binanceId") or "").strip(),
                "tx_ms": t.get("transactionTime")}
        if amt <= 0:
            return {"status": "review", "code": "not_incoming", "detail": f"amount {amt}", **info}
        if cur != str(snap.get("asset") or "USDT").upper():
            return {"status": "review", "code": "mismatch_asset",
                    "detail": f"received {cur}, expected {snap.get('asset')}", **info}
        return bn_amount_verdict(amt, exp, info)
    return {"status": "retry", "code": "not_found", "detail": f"not in the last Binance Pay history ({len(rows)} rows)"}


def bn_lookup_v2(snap, txid, expected_usd) -> dict:
    """Blocking, READ-ONLY. -> {'status': 'ok' | 'retry' | 'review', 'code', 'detail', + found data}.
    'ok' only when the Binance data itself proves: right ID, asset, amount, (network + address for
    on-chain), confirmed.  Anything else is never a success."""
    snap = snap if isinstance(snap, dict) else {}
    kind = snap.get("kind")
    tx_n = bn_norm_tx(txid)
    oc = bn_offchain_id(txid, kind or "")
    if oc and kind != "pay" and bool(snap.get("offchain_ok")):
        try:
            exp_oc = float(expected_usd)
        except Exception:
            return {"status": "review", "code": "incomplete_data", "detail": "requested amount unreadable", "ref": oc}
        try:
            return bn_check_offchain(snap, oc, exp_oc)
        except BnApiError as e:
            return {"status": "retry" if e.kind != "api_config" else "review",
                    "code": "api_config" if e.kind == "api_config" else "api_error",
                    "detail": bn_redact(str(e))[:250]}
        except Exception as e:
            return {"status": "retry", "code": "api_error", "detail": f"{type(e).__name__}: {e}"}
    try:
        if kind == "pay":
            return bn_check_pay(snap, tx_n, float(expected_usd))
        if kind == "onchain":
            return bn_check_onchain(snap, str(txid or "").strip(), tx_n, float(expected_usd))
        return {"status": "review", "code": "unsupported_method", "detail": "gateway cannot be auto-verified"}
    except BnApiError as e:
        return {"status": "retry" if e.kind != "api_config" else "review",
                "code": "api_config" if e.kind == "api_config" else "api_error",
                "detail": bn_redact(str(e))[:250]}
    except Exception as e:
        return {"status": "retry", "code": "api_error", "detail": f"{type(e).__name__}: {e}"}
