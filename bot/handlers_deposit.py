"""Deposit system with Binance auto-verification (ported from the proven build)."""
from __future__ import annotations

import asyncio
import os
import time

from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from bot import config, db
from bot import keyboards as kb
from bot import binance_verify as bnv

router = Router()


def _mm_x(message):
    return kb.main_menu(is_admin=message.from_user.id in config.ADMIN_IDS)


def _adm_guard(c: CallbackQuery) -> bool:
    """adm:* callbacks are admin-only; everything else passes"""
    if c.data and c.data.startswith("adm:"):
        return c.from_user.id in config.ADMIN_IDS
    return True


router.callback_query.filter(_adm_guard)

# user's earlier requirement: first check after a few seconds, whole cycle stays quick
def _verify_delays():
    raw = os.environ.get("BINANCE_VERIFY_DELAYS", "")
    if raw:
        try:
            return tuple(max(3, int(x)) for x in raw.replace(" ", "").split(",") if x)
        except Exception:
            pass
    return (5, 30, 60, 120, 300)   # seconds before each check

_BN_ACTIVE: set[str] = set()


class Dep(StatesGroup):
    amount = State()
    txid = State()


class DepM(StatesGroup):          # admin: add deposit method
    name = State()
    network = State()
    address = State()


DEP_HELP = (
    "💰 <b>ডিপোজিট (ব্যালেন্স যোগ করুন)</b>\n\n"
    "1️⃣ নিচ থেকে একটা <b>পেমেন্ট মেথড</b> বাছুন\n"
    "2️⃣ <b>কত টাকা</b> ($ এক্সট্রা টাকাসহ যত চান) লিখে দিন\n"
    "3️⃣ দেখানো <b>অ্যাড্রেসে</b> ঠিক ওই পরিমাণ পাঠান\n"
    "4️⃣ <b>Transaction ID (TXID)</b> পাঠান\n\n"
    "🔍 <b>অটো-ভেরিফাই:</b> বট কয়েক সেকেন্ডে গোপন উপায়ে Binance API দিয়ে যাচাই করে — সব মিললে "
    "ব্যালেন্স <b>সাথে সাথে যোগ</b> হয়ে যায়! ✅\n\n"
    "⚠️ সঠিক নেটওয়ার্কে পাঠাতে হবে, ভুল হলে টাকা হারাতে পারেন।"
)


def _fmt(money) -> str:
    try:
        f = float(money)
        return f"{f:,.4f}".rstrip("0").rstrip(".")
    except Exception:
        return str(money)


def _kind_from_network(network: str) -> str:
    """Same network-label rules as the original engine: TRC20/TRON -> onchain TRX, BEP20/BSC -> onchain BSC,
    ERC20/Ethereum -> onchain ETH, binance/pay-id -> pay."""
    label = str(network or "").strip().lower()
    if any(k in label for k in ("trc20", "tron", "trx")):
        return "onchain", "TRX"
    if any(k in label for k in ("bep20", "bsc", "bnb smart", "bnb chain")):
        return "onchain", "BSC"
    if any(k in label for k in ("erc20", "ethereum")):
        return "onchain", "ETH"
    if "binance" in label or "pay id" in label:
        return "pay", ""
    return "", ""


def dep_methods_kb(methods: dict) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text=f"💳 {m.get('name', k)} ({m.get('network') or '—'})",
                                  callback_data=f"dep:method:{k}")] for k, m in methods.items()]
    rows.append([InlineKeyboardButton(text="📜 ডিপোজিট ইতিহাস", callback_data="dep:hist")])
    rows.append([InlineKeyboardButton(text="🏠 হোম", callback_data="noop")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


@router.message(F.text == "💰 ডিপোজিট")
async def deposit_menu(message: Message, state: FSMContext):
    st = await db.get_settings()
    if not st.get("deposit_on", True):
        await message.answer("⛔ <b>ডিপোজিট সিস্টেম এখন বন্ধ আছে।</b>", reply_markup=_mm_x(message))
        return
    um = await db.rget(f"{db.USERS}/{message.from_user.id}") or {}
    if um.get("banned"):
        await message.answer("🚫 আপনাকে ব্যান করা হয়েছে!", reply_markup=_mm_x(message))
        return
    await state.clear()
    bal = await db.rget(f"{db.USERS}/{message.from_user.id}/balance") or 0
    methods = await db.rget(db.DEPOSIT_METHODS) or {}
    methods = {k: v for k, v in methods.items() if isinstance(v, dict) and v.get("address")}
    if not methods:
        await message.answer("⏳ এখন কোনো ডিপোজিট মেথড চালু নেই — কিছুক্ষণ পর আবার চেষ্টা করুন।",
                             reply_markup=_mm_x(message))
        return
    auto = "✅ অটো-ভেরিফাই চালু" if bnv.bn_creds_ok() else "⏳ ভেরিফাই এডমিন দেখবে"
    await message.answer(f"{DEP_HELP}\n💰 আপনার ব্যালেন্স: <b>${_fmt(bal)}</b>\n🔍 {auto}",
                         reply_markup=dep_methods_kb(methods))


@router.callback_query(F.data == "dep:menu")
async def cb_dep_menu(cb: CallbackQuery, state: FSMContext):
    st = await db.get_settings()
    if not st.get("deposit_on", True):
        await cb.answer("⛔ ডিপোজিট সিস্টেম বন্ধ আছে", show_alert=True)
        return
    u = await db.rget(f"{db.USERS}/{cb.from_user.id}") or {}
    if u.get("banned"):
        await cb.answer("🚫 আপনাকে ব্যান করা হয়েছে!", show_alert=True)
        return
    await state.clear()
    methods = await db.rget(db.DEPOSIT_METHODS) or {}
    methods = {k: v for k, v in methods.items() if isinstance(v, dict) and v.get("address")}
    if not methods:
        await cb.answer("কোনো মেথড নেই", show_alert=True)
        return
    try:
        await cb.message.edit_text("💰 <b>ডিপোজিট</b> — মেথড বাছুন:", reply_markup=dep_methods_kb(methods))
    except Exception:
        await cb.message.answer("💰 <b>ডিপোজিট</b> — মেথড বাছুন:", reply_markup=dep_methods_kb(methods))
    await cb.answer()


@router.callback_query(F.data.startswith("dep:method:"))
async def cb_dep_method(cb: CallbackQuery, state: FSMContext):
    key = cb.data.split(":", 2)[2]
    m = await db.rget(f"{db.DEPOSIT_METHODS}/{key}") or {}
    if not m.get("address"):
        await cb.answer("মেথডটি আর নেই", show_alert=True)
        return
    await state.update_data(dep_method=key)
    await state.set_state(Dep.amount)
    await cb.message.edit_text(
        f"💳 <b>{m.get('name', key)}</b> ({m.get('network') or '—'})\n\n"
        "💵 <b>কত $ ডিপোজিট করবেন?</b>\n"
        "শুধু সংখ্যাটা লিখুন (যেমন: <code>10</code>)"
        + (f"\n⚠️ সর্বনিম্ন: ${_fmt(m.get('min_amount'))}" if float(m.get("min_amount") or 0) > 0 else ""),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="⬅️ মেথড বাছাই", callback_data="dep:menu")]]))
    await cb.answer()


@router.message(Dep.amount, F.text)
async def dep_amount(message: Message, state: FSMContext):
    t = message.text.strip().replace("$", "").replace("৳", "").strip()
    if not t.replace(".", "", 1).isdigit():
        await message.answer("❌ শুধু সংখ্যা লিখুন (যেমন: <code>10</code>):")
        return
    amount = float(t)
    if amount <= 0:
        await message.answer("❌ পরিমাণ অবশ্যই ০-এর বেশি হবে:")
        return
    d = await state.get_data()
    key = d.get("dep_method")
    m = await db.rget(f"{db.DEPOSIT_METHODS}/{key}") or {}
    if not m.get("address"):
        await state.clear()
        await message.answer("❌ মেথডটি আর নেই — আবার শুরু করুন।", reply_markup=_mm_x(message))
        return
    mn = float(m.get("min_amount") or 0)
    if mn > 0 and amount < mn:
        await message.answer(f"❌ সর্বনিম্ন ${_fmt(mn)}। আবার লিখুন:")
        return
    kind, code = _kind_from_network(m.get("network"))
    shown_at = int(time.time() * 1000)          # time gate: payment must be NEWER than this
    await state.update_data(dep_amount=amount, shown_at=shown_at)
    await state.set_state(Dep.txid)
    ref_line = ("Binance Pay ID" if kind == "pay" else f"{m.get('network')} ({code})")
    await message.answer(
        f"💳 <b>{m.get('name')} </b> — পরিমাণ: <b>${_fmt(amount)}</b>\n\n"
        f"📤 এই <b>{ref_line}</b> অ্যাড্রেসে ঠিক <b>${_fmt(amount)}</b> পাঠান:\n\n"
        f"<code>{m.get('address')}</code>\n\n"
        "✅ পাঠানো হয়ে গেলে wallet/exchange-এর ইতিহাস থেকে <b>Transaction ID (TXID)</b> কপি করে "
        "এখানে পাঠান।\n\n"
        "⚠️ ভুল নেটওয়ার্কে পাঠালে টাকা হারাতে পারেন!")


async def _dup_owner(txid: str, dep_id: str) -> str:
    """Deposit ID that already OWNS this normalized reference (approved, or pending earlier), else ''."""
    n = bnv.bn_norm_tx(txid)
    if not n:
        return ""
    deps = await db.rget(db.DEPOSITS) or {}
    best = None
    for k, v in deps.items():
        if k == dep_id or not isinstance(v, dict):
            continue
        if bnv.bn_norm_tx(v.get("txid")) != n:
            continue
        st = str(v.get("status") or "")
        if st == "approved":
            rank = 0
        elif st == "pending" and v.get("credit_claim"):
            rank = 1
        elif st == "pending":
            rank = 2
        else:
            continue                    # rejected deposits never own the reference
        cand = (rank, str(v.get("created_at") or ""), str(k))
        if best is None or cand < best:
            best = cand
    return best[2] if best else ""


@router.message(Dep.txid, F.text)
async def dep_txid(message: Message, state: FSMContext, bot: Bot):
    txid = message.text.strip()
    d = await state.get_data()
    key, amount, shown_at = d.get("dep_method"), d.get("dep_amount"), d.get("shown_at")
    m = await db.rget(f"{db.DEPOSIT_METHODS}/{key}") or {}
    if not m.get("address"):
        await state.clear()
        await message.answer("❌ মেথডটি আর নেই।", reply_markup=_mm_x(message))
        return
    kind, code = _kind_from_network(m.get("network"))
    asset = (str(m.get("asset") or "USDT").strip().upper()) or "USDT"
    offchain_ok = bool(kind == "onchain" and len(str(m.get("address"))) >= 20
                       and not str(m.get("address")).isdigit() and asset in bnv.BN_STABLE)

    if kind == "onchain" and not bnv.bn_offchain_id(txid, kind) and not bnv.bn_valid_tx(kind, txid):
        await message.answer(
            "🚫 INVALID TXID — এটা সঠিক Transaction ID মনে হচ্ছে না।\n"
            "অন-চেইন ট্রানজেকশনের TXID হলো 64 অক্ষরের লম্বা কোড — wallet/exchange ইতিহাস থেকে "
            "পুরোটা কপি করে পাঠান।\n\n"
            "আবার TXID পাঠান (বাতিল: /cancel):")
        return
    if kind == "pay" and not bnv.bn_valid_tx("pay", txid):
        await message.answer("❌ এটা সঠিক Binance Pay Order/Transaction ID মনে হচ্ছে না। আবার পাঠান (বাতিল: /cancel):")
        return

    # duplicate protection: the same reference can never credit twice
    prev = await _dup_owner(txid, "")
    if prev:
        await message.answer(
            "🔁 <b>এই TxID আগেই ব্যবহৃত হয়েছে!</b>\n"
            f"আগের ডিপোজিট: <code>{prev}</code>\n\n"
            "একই TXID দিয়ে দ্বিতীয়বার ব্যালেন্স যোগ হয় না। টাকাটা সত্যিই পাঠিয়ে থাকলে "
            "এডমিনের সাথে যোগাযোগ করুন।", reply_markup=_mm_x(message))
        await state.clear()
        return

    dep = {
        "uid": message.from_user.id,
        "method": key,
        "method_name": m.get("name", ""),
        "asset": asset,
        "amount": round(float(amount), 6),
        "txid": txid,
        "status": "pending",
        "created_at": int(time.time()),
        "bn_snapshot": {"kind": kind, "code": code, "asset": asset,
                        "address": str(m.get("address") or ""), "label": str(m.get("network") or ""),
                        "offchain_ok": offchain_ok, "t0": int(shown_at or time.time() * 1000)},
    }
    dep_id = await db.rpush(db.DEPOSITS, dep)
    await state.clear()
    if not dep_id:
        await message.answer("❌ সাময়িক সমস্যা — কিছুক্ষণ পর আবার চেষ্টা করুন।")
        return
    await message.answer(
        f"⏳ <b>Verifying Payment…</b>\n\n"
        f"💰 পরিমাণ: <b>${_fmt(amount)}</b> | ID: <code>{dep_id}</code>\n"
        "🔍 Binance API দিয়ে যাচাই চলছে — একদম সঠিক হলে সাথে সাথেই ব্যালেন্স যোগ হবে!",
        reply_markup=_mm_x(message))
    _start_verify(bot, dep_id, str(message.from_user.id), txid)


def _start_verify(bot: Bot, dep_id: str, uid: str, txid: str) -> bool:
    if dep_id in _BN_ACTIVE:
        return False
    if not bnv.bn_creds_ok():
        return True                    # manual review path; admin can still approve
    _BN_ACTIVE.add(dep_id)
    try:
        asyncio.get_running_loop().create_task(
            _auto_verify_task(bot, dep_id, uid, txid, None))
        return True
    except RuntimeError:               # no running loop (safety)
        _BN_ACTIVE.discard(dep_id)
        return True


async def _notify_admins(bot: Bot, text: str):
    for aid in config.ADMIN_IDS:
        try:
            await bot.send_message(aid, text)
        except Exception:
            pass


async def _approve_deposit(bot: Bot, dep_id: str, dep: dict, by: str = "auto") -> tuple[str, float]:
    """Credit the balance exactly once (status gate before crediting). -> (code, new_balance)"""
    if str(dep.get("status") or "") != "pending":
        return dep.get("status") or "gone", 0.0
    uid = str(dep.get("uid"))
    amount = float(dep.get("amount") or 0)
    if amount <= 0:
        return "bad_amount", 0.0
    upd = await db.rpatch(f"{db.DEPOSITS}/{dep_id}",
                          {"status": "approved", "auto_verified": by == "auto",
                           "approved_by": by, "approved_at": int(time.time())})
    if upd is None:
        return "read_error", 0.0
    cur = await db.rget(f"{db.USERS}/{uid}/balance") or 0
    new_bal = round(float(cur) + amount, 6)
    await db.rput(f"{db.USERS}/{uid}/balance", new_bal)
    await db.rput(f"{db.USERS}/{uid}/last_deposit", amount)
    await db.rput(f"{db.BASE}/used_txids/{bnv.txc_key(dep.get('txid') or '')}",
                  {"dep_id": dep_id, "uid": uid, "amount": amount, "at": int(time.time())})
    try:
        await bot.send_message(
            int(uid),
            f"✅ <b>ডিপোজিট অনুমোদিত!</b>\n\n"
            f"💰 যোগ হলো: <b>${_fmt(amount)}</b>\n"
            f"👛 আপনার ব্যালেন্স: <b>${_fmt(new_bal)}</b>",
            reply_markup=_mm_x(message))
    except Exception:
        pass
    return "ok", new_bal


async def _auto_verify_task(bot: Bot, dep_id: str, uid: str, txid: str, delay_override):
    """Checks the deposit on Binance a few times (same engine + same verdict rules as the original).
    ok -> auto credit; review -> pending for the admin with the reason; retries exhausted -> pending
    for the admin too (never an automatic rejection)."""
    try:
        last = {"status": "retry", "code": "not_found", "detail": ""}
        for delay in (delay_override or _verify_delays()):
            await asyncio.sleep(delay)
            cur = await db.rget(f"{db.DEPOSITS}/{dep_id}")
            if not isinstance(cur, dict) or not cur:
                last = {"status": "retry", "code": "read_error", "detail": "deposit unreadable"}
                continue
            if cur.get("status") != "pending":
                return                                  # an admin already handled it
            snap = cur.get("bn_snapshot") if isinstance(cur.get("bn_snapshot"), dict) else None
            if not snap:
                await db.rpatch(f"{db.DEPOSITS}/{dep_id}",
                                {"review_reason": "incomplete_data", "bn_state": "review"})
                await _notify_admins(bot, f"⚠️ ডিপোজিট <code>{dep_id}</code> — snapshot নেই, ম্যানুয়াল দেখুন।")
                return
            try:
                exp = float(cur.get("amount"))
            except Exception:
                exp = 0.0
            try:
                res = await asyncio.to_thread(bnv.bn_lookup_v2, snap, txid, exp)
            except Exception as e:
                res = {"status": "retry", "code": "api_error", "detail": f"{type(e).__name__}: {e}"}
            last = res
            st = res.get("status")
            if st == "ok" and not bnv.bn_auto_credit_ok():
                await db.rpatch(f"{db.DEPOSITS}/{dep_id}",
                                {"review_reason": "ownership_unverified", "bn_state": "review",
                                 "bn_found": {k: str(v)[:80] for k, v in res.items() if k != "status"}})
                await _notify_admins(bot,
                                     f"🔍 <b>অটো-ভেরিফাই সফল — কিন্তু অটো-ক্রেডিট বন্ধ</b>\n"
                                     f"ডিপোজিট <code>{dep_id}</code> | ইউজার <code>{uid}</code> | ${_fmt(exp)}\n"
                                     "ম্যানুয়ালি অনুমোদন করুন (💰 ডিপোজিট মেনু)।")
                return
            if st == "ok":
                code, _nb = await _approve_deposit(bot, dep_id, cur, by="auto")
                if code == "ok":
                    await _notify_admins(bot,
                        f"✅ <b>অটো-ভেরিফাই সফল!</b>\n"
                        f"💰 ${_fmt(exp)} ({res.get('coin') or ''} {res.get('network') or ''})\n"
                        f"👤 ইউজার: <code>{uid}</code> | ID: <code>{dep_id}</code>")
                    return
                if code in ("approved",):
                    return
                last = {"status": "retry", "code": code, "detail": "credit failed - retrying"}
                continue
            if st == "review":
                await db.rpatch(f"{db.DEPOSITS}/{dep_id}",
                                {"review_reason": str(res.get("code") or "incomplete_data"),
                                 "review_detail": bnv.bn_redact(str(res.get("detail") or ""))[:300],
                                 "bn_state": "review"})
                await _notify_admins(bot,
                    f"⚠️ <b>ডিপোজিট ম্যানুয়াল রিভিউতে গেছে</b>\n"
                    f"👤 <code>{uid}</code> | ID: <code>{dep_id}</code> | ${_fmt(exp)}\n"
                    f"❓ কারণ: <b>{res.get('code')}</b>\n"
                    f"<i>{bnv.bn_redact(str(res.get('detail') or ''))[:200]}</i>")
                return
            # still "retry" -> remember and try again
            await db.rpatch(f"{db.DEPOSITS}/{dep_id}",
                            {"bn_state": "verifying", "review_reason": res.get("code"),
                             "review_detail": bnv.bn_redact(str(res.get("detail") or ""))[:300]})
        # retries exhausted -> stays pending for the admin
        await db.rpatch(f"{db.DEPOSITS}/{dep_id}", {"bn_state": "review",
                                                    "review_reason": last.get("code") or "not_found"})
        await _notify_admins(bot,
            f"⌛ <b>ভেরিফাই শেষ হলো — ম্যানুয়াল রিভিউ দরকার</b>\n"
            f"👤 <code>{uid}</code> | ID: <code>{dep_id}</code>\n"
            f"❓ শেষ অবস্থা: <b>{last.get('code')}</b>")
    except Exception as e:
        try:
            await db.rpatch(f"{db.DEPOSITS}/{dep_id}", {"bn_state": "review",
                                                        "review_reason": "api_error",
                                                        "review_detail": f"{type(e).__name__}"[:200]})
            await _notify_admins(bot, f"❌ ভেরিফাই টাস্ক ত্রুটি (<code>{dep_id}</code>): {type(e).__name__}: {e}")
        except Exception:
            pass
    finally:
        _BN_ACTIVE.discard(dep_id)


@router.callback_query(F.data == "dep:hist")
async def cb_dep_hist(cb: CallbackQuery):
    deps = await db.rget(db.DEPOSITS) or {}
    mine = sorted(((k, v) for k, v in deps.items() if isinstance(v, dict) and str(v.get("uid")) == str(cb.from_user.id)),
                  key=lambda kv: kv[1].get("created_at") or 0, reverse=True)[:10]
    if not mine:
        await cb.answer("এখনো কোনো ডিপোজিট নেই", show_alert=True)
        return
    ico = {"approved": "✅", "pending": "⏳", "rejected": "❌"}
    lines = ["📜 <b>ডিপোজিট ইতিহাস</b>\n"]
    for k, v in mine:
        lines.append(f"{ico.get(v.get('status'), '❓')} ${_fmt(v.get('amount'))} — {v.get('method_name') or ''} "
                     f"<code>{k[:8]}</code>")
    await cb.message.answer("\n".join(lines), reply_markup=kb.main_menu(is_admin=cb.from_user.id in config.ADMIN_IDS))
    await cb.answer()


# ---------------- admin: deposit management ----------------

@router.callback_query(F.data == "adm:dep")
async def adm_dep(cb: CallbackQuery):
    deps = await db.rget(db.DEPOSITS) or {}
    pending = sorted(((k, v) for k, v in deps.items() if isinstance(v, dict) and v.get("status") == "pending"),
                     key=lambda kv: kv[1].get("created_at") or 0, reverse=True)
    rows = [[InlineKeyboardButton(text=f"⏳ ${_fmt(v.get('amount'))} — {str(v.get('uid'))[-6:]} ({k[:8]})",
                                  callback_data=f"adm:depview:{k}")] for k, v in pending[:20]]
    rows.append([InlineKeyboardButton(text="💳 মেথড ম্যানেজ", callback_data="adm:depmeth")])
    rows.append([InlineKeyboardButton(text="⬅️ এডমিন মেনু", callback_data="adm:menu")])
    head = f"💰 <b>ডিপোজিট ম্যানেজমেন্ট</b>\n⏳ পেন্ডিং: {len(pending)} টা\n\n"
    if not pending:
        head += "কোনো পেন্ডিং ডিপোজিট নেই।"
    try:
        await cb.message.edit_text(head, reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))
    except Exception:
        await cb.message.answer(head, reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))
    await cb.answer()


@router.callback_query(F.data.startswith("adm:depview:"))
async def adm_depview(cb: CallbackQuery):
    dep_id = cb.data.split(":", 2)[2]
    d = await db.rget(f"{db.DEPOSITS}/{dep_id}") or {}
    if not d:
        await cb.answer("ডিপোজিট নেই", show_alert=True)
        return
    snap = d.get("bn_snapshot") if isinstance(d.get("bn_snapshot"), dict) else {}
    rows = []
    if d.get("status") == "pending":
        rows.append([InlineKeyboardButton(text="✅ অনুমোদন", callback_data=f"adm:depok:{dep_id}"),
                     InlineKeyboardButton(text="❌ রিজেক্ট", callback_data=f"adm:depno:{dep_id}")])
    rows.append([InlineKeyboardButton(text="⬅️ ডিপোজিট তালিকা", callback_data="adm:dep")])
    await cb.message.edit_text(
        f"💰 <b>{d.get('method_name') or dep_id}</b>\n"
        f"👤 ইউজার: <code>{d.get('uid')}</code>\n"
        f"💵 পরিমাণ: <b>${_fmt(d.get('amount'))}</b>\n"
        f"🔖 স্ট্যাটাস: <b>{d.get('status')}</b> | অটো: {d.get('auto_verified')}\n"
        f"💳 নেটওয়ার্ক: {snap.get('label') or snap.get('code') or '—'} ({snap.get('kind') or '—'})\n"
        f"🏦 অ্যাড্রেস: <code>{snap.get('address') or '—'}</code>\n"
        f"🔖 TxID: <code>{d.get('txid') or '—'}</code>\n"
        f"❓ রিভিউ কারণ: {d.get('review_reason') or '—'}"
        + (f"\n<i>{bnv.bn_redact(str(d.get('review_detail') or ''))[:200]}</i>" if d.get("review_detail") else ""),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))
    await cb.answer()


@router.callback_query(F.data.startswith("adm:depok:"))
async def adm_depok(cb: CallbackQuery, bot: Bot):
    dep_id = cb.data.split(":", 2)[2]
    d = await db.rget(f"{db.DEPOSITS}/{dep_id}") or {}
    if not d or d.get("status") != "pending":
        await cb.answer("আর পেন্ডিং নেই", show_alert=True)
        return
    # duplicate protection also applies to the admin approve
    prev = await _dup_owner(d.get("txid") or "", dep_id)
    if prev:
        await cb.answer(f"🔁 এই TxID আগেই ব্যবহৃত ({prev}) — আগের ডিপোজিট দেখে রিজেক্ট করুন", show_alert=True)
        return
    code, _nb = await _approve_deposit(bot, dep_id, d, by="admin")
    if code == "ok":
        await cb.answer("✅ অনুমোদিত, ব্যালেন্স যোগ হয়েছে", show_alert=True)
        await adm_dep(cb)
    else:
        await cb.answer(f"ক্রেডিট হয়নি: {code}", show_alert=True)


@router.callback_query(F.data.startswith("adm:depno:"))
async def adm_depno(cb: CallbackQuery, bot: Bot):
    dep_id = cb.data.split(":", 2)[2]
    d = await db.rget(f"{db.DEPOSITS}/{dep_id}") or {}
    if not d or d.get("status") != "pending":
        await cb.answer("আর পেন্ডিং নেই", show_alert=True)
        return
    await db.rpatch(f"{db.DEPOSITS}/{dep_id}", {"status": "rejected", "approved_by": "admin",
                                                "approved_at": int(time.time())})
    try:
        await bot.send_message(int(d.get("uid")),
                               f"❌ ডিপোজিট <code>{dep_id}</code> রিজেক্ট করা হয়েছে। বিস্তারিত জানতে এডমিনের সাথে কথা বলুন।")
    except Exception:
        pass
    await cb.answer("❌ রিজেক্ট হয়েছে")
    await adm_dep(cb)


# ---------------- admin: deposit methods ----------------

@router.callback_query(F.data == "adm:depmeth")
async def adm_depmeth(cb: CallbackQuery):
    methods = await db.rget(db.DEPOSIT_METHODS) or {}
    rows = [[InlineKeyboardButton(text=f"💳 {m.get('name', k)} — 🗑", callback_data=f"adm:depdel:{k}")]
            for k, m in methods.items() if isinstance(m, dict)]
    rows.append([InlineKeyboardButton(text="➕ নতুন মেথড", callback_data="adm:depadd")])
    rows.append([InlineKeyboardButton(text="⬅️ ডিপোজিট মেনু", callback_data="adm:dep")])
    note = "" if bnv.bn_creds_ok() else "\n\n⚠️ <b>BINANCE_API_KEY/SECRET নেই</b> — Render env-এ দিলে অটো-ভেরিফাই চালু হবে।"
    try:
        await cb.message.edit_text(f"💳 <b>ডিপোজিট মেথড</b> ({len(methods)} টা)\n"
                                   "নেটওয়ার্কে অবশ্যই লিখুন: TRC20 / BEP20 / ERC20 / Binance Pay" + note,
                                   reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))
    except Exception:
        await cb.message.answer("💳 ডিপোজিট মেথড", reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))
    await cb.answer()


@router.callback_query(F.data == "adm:depadd")
async def adm_depadd(cb: CallbackQuery, state: FSMContext):
    await state.set_state(DepM.name)
    await cb.message.answer("💳 মেথডের <b>নাম</b> লিখুন (যেমন: USDT TRC20): (বাতিল /cancel)")
    await cb.answer()


@router.message(DepM.name, F.text)
async def depm_name(message: Message, state: FSMContext):
    if message.from_user.id not in config.ADMIN_IDS:
        return
    await state.update_data(dep_m_name=message.text.strip())
    await state.set_state(DepM.network)
    await message.answer("🌐 <b>নেটওয়ার্ক</b> লিখুন:\n"
                         "<code>TRC20</code> / <code>BEP20</code> / <code>ERC20</code> / <code>Binance Pay</code>")


@router.message(DepM.network, F.text)
async def depm_network(message: Message, state: FSMContext):
    if message.from_user.id not in config.ADMIN_IDS:
        return
    await state.update_data(dep_m_network=message.text.strip())
    await state.set_state(DepM.address)
    kind, _ = _kind_from_network(message.text.strip())
    if kind == "pay":
        await message.answer("🔢 <b>Binance Pay ID</b> লিখুন:")
    else:
        await message.answer("🏦 ওই নেটওয়ার্কের <b>ওয়ালেট অ্যাড্রেস</b> লিখুন:")


@router.message(DepM.address, F.text)
async def depm_address(message: Message, state: FSMContext):
    if message.from_user.id not in config.ADMIN_IDS:
        return
    d = await state.get_data()
    await state.clear()
    m = {"name": d.get("dep_m_name", "?"),
         "network": d.get("dep_m_network", ""),
         "address": message.text.strip(),
         "min_amount": 0}
    key = await db.rpush(db.DEPOSIT_METHODS, m)
    kind, _ = _kind_from_network(m.get("network"))
    ok = "✅ অটো-ভেরিফাই সমর্থিত!" if kind else "⚠️ অটো-ভেরিফাই নয় (ম্যানুয়াল রিভিউ হবে)"
    await message.answer(f"✅ মেথড যোগ হয়েছে (ID: {key})\n{ok}", reply_markup=kb.admin_menu())


@router.callback_query(F.data.startswith("adm:depdel:"))
async def adm_depdel(cb: CallbackQuery):
    key = cb.data.split(":", 2)[2]
    await db.rdelete(f"{db.DEPOSIT_METHODS}/{key}")
    await cb.answer("🗑 মেথড মুছে ফেলা হয়েছে")
    await adm_depmeth(cb)


@router.message(F.text == "/cancel")
async def dep_cancel(message: Message, state: FSMContext):
    st = await state.get_state()
    if st is not None and str(st).split(":")[0] in ("Dep", "DepM"):
        if message.from_user.id in config.ADMIN_IDS or str(st).startswith("Dep:"):
            await state.clear()
            await message.answer("❎ বাতিল হলো।", reply_markup=_mm_x(message))
