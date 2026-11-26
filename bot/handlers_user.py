from __future__ import annotations

import asyncio

from aiogram import Bot, F, Router
from aiogram.filters import CommandStart
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaPhoto, InputMediaVideo, Message

from bot import config, db
from bot.handlers_admin import _mm
from bot.handlers_deposit import _notify_admins
from bot import keyboards as kb

router = Router()

WELCOME = (
    "🔥 <b>Viral Zone Video</b>-তে স্বাগতম!\n\n"
    "💎 <b>এক্সক্লুসিভ প্রিমিয়াম প্যাকেজ</b>-এর বিশাল কালেকশন — ভিডিও ও ফটো এकসাথে।\n"
    "🎁 প্রতিটা প্যাকেজের <b>ফ্রি ডেমো</b> দেখে তারপর কিনতে পারবেন।\n"
    "👥 বন্ধু রেফার করে <b>টাকা</b> আয় করুন!\n\n"
    "নিচের মেনু থেকে বাছুন 👇"
)

HELP = (
    "ℹ️ <b>সাহায্য</b>\n\n"
    "📦 <b>প্যাকেজ</b> — সব প্রিমিয়াম প্যাকেজ দেখুন; প্রতিটার ফ্রি ডেমো দেখা যায়।\n"
    "🎁 <b>ডেমো</b> — প্যাকেজের সব নমুনা ভিডিও/ফটো একসাথে দেখানো হয়।\n"
    "🛒 <b>কিনুন</b> — প্যাকেজ কিনে সম্পূর্ণ কালেকশন আনলক করুন।\n"
    "👥 <b>রেফার</b> — নিজের লিংক বন্ধুদের পাঠান, রেফার করলে ব্যালেন্স বাড়বে।"
)


def _money(v) -> str:
    f = float(v or 0)
    return str(int(f)) if f == int(f) else f"{f:.2f}"


def referral_link(bot_username: str, uid: str) -> str:
    return f"https://t.me/{bot_username}?start=ref_{uid}"


async def show_package_msg(message: Message, key: str):
    """Send the package card as a NEW message (used by deep links)."""
    p = await db.get_package(key)
    if not p:
        await message.answer("\u274c \u09aa\u09cd\u09af\u09be\u0995\u09c7\u099c\u099f\u09bf \u0996\u09c1\u0981\u099c\u09c7 \u09aa\u09be\u0993\u09af\u09bc\u093e \u09af\u09be\u09af\u09bc\u09a8\u09bf\u0964")
        return
    total = len(p.get("demo_media") or {})
    lines = [f"\U0001f4e6 <b>{p.get('name', '\u09aa\u09cd\u09af\u09be\u0995\u09c7\u099c')}</b>"]
    if p.get("price"):
        lines.append(f"\U0001f4b0 \u09a6\u09be\u09ae: <b>{p.get('price')} \u09f3</b>")
    n_photo = sum(1 for m in (p.get("demo_media") or {}).values() if m.get("type") == "photo")
    n_video = total - n_photo
    demo_line = []
    if n_video:
        demo_line.append(f"\U0001f3ac {n_video} \u09ad\u09bf\u09a1\u09bf\u0993")
    if n_photo:
        demo_line.append(f"\U0001f4f7 {n_photo} \u09ab\u099f\u09cb")
    if demo_line:
        lines.append("\U0001f381 \u09ab\u09cd\u09b0\u09bf \u09a1\u09c7\u09ae\u09cb: " + " + ".join(demo_line))
    if p.get("description"):
        lines.append("\n\U0001f4c4 " + str(p.get("description")))
    uid = str(message.from_user.id)
    if await db.is_owned(uid, key):
        lines.append("\n\u2705 <b>\u0986\u09aa\u09a8\u09bf \u0987 \u09aa\u09cd\u09af\u09be\u0995\u09c7\u099c\u099f\u09bf \u0995\u09bf\u09a8\u09c7\u099b\u09c7\u09a8</b>")
        owned = True
    else:
        owned = False
    await message.answer("\n".join(lines), reply_markup=kb.package_kb(key, total, owned=owned))


async def show_package(cb_or_msg, key: str, edit: bool = False):
    p = await db.get_package(key)
    if not p:
        await cb_or_msg.answer("❌ প্যাকেজটি আর নেই", show_alert=True)
        return
    lines = [
        f"📦 <b>{p.get('name', 'প্যাকেজ')}</b>\n",
    ]
    if p.get("price"):
        lines.append(f"💰 দাম: <b>{p.get('price')} ৳</b>")
    total = len(p.get("demo_media") or {})
    n_photo = sum(1 for m in (p.get("demo_media") or {}).values() if m.get("type") == "photo")
    n_video = total - n_photo
    demo_line = []
    if n_video:
        demo_line.append(f"🎬 {n_video} ভিডিও")
    if n_photo:
        demo_line.append(f"📷 {n_photo} ফটো")
    if demo_line:
        lines.append(f"🎁 ফ্রি ডেমো: {' + '.join(demo_line)}")
    if p.get("description"):
        lines.append(f"\n📄 {p.get('description')}")
    uid = str(cb_or_msg.from_user.id)
    if await db.is_owned(uid, key):
        lines.append("\n✅ <b>আপনি ই প্যাকেজটি কিনেছেন</b>")
        owned = True
    else:
        owned = False
        bal = await db.rget(f"{db.USERS}/{uid}") or {}
        if bal.get("balance"):
            lines.append(f"💰 আপনার ব্যালেন্স: <b>{bal.get('balance')} ৳</b>")
    text = "\n".join(lines)
    kb_ = kb.package_kb(key, total, owned=owned)
    if isinstance(cb_or_msg, CallbackQuery):
        await cb_or_msg.message.edit_text(text, reply_markup=kb_)
    else:
        await cb_or_msg.answer(text, reply_markup=kb_)


@router.message(CommandStart())
async def cmd_start(message: Message, bot: Bot):
    me = await bot.get_me()
    uid = str(message.from_user.id)
    payload = (message.text or "").split(maxsplit=1)
    payload = payload[1].strip() if len(payload) > 1 else ""

    user, is_new = await db.register_user(message.from_user)

    if payload.startswith("ref_"):
        ref_id = payload[4:]
        if is_new or not user.get("referred_by"):
            if ref_id != uid and await db.rget(f"{db.USERS}/{ref_id}"):
                await db.rput(f"{db.USERS}/{uid}/referred_by", ref_id)
                count = await db.rget(f"{db.USERS}/{ref_id}/ref_count") or 0
                await db.rput(f"{db.USERS}/{ref_id}/ref_count", int(count) + 1)
                # join bonus (admin settings; 0 = off)
                st = await db.get_settings()
                rcfg = await db.rget(db.REFERRAL) or {}
                bonus = float(st.get("referral_bonus") or rcfg.get("bonus_join") or 0)
                if st.get("referral_on", True) and bonus > 0:
                    await db.credit_balance(ref_id, bonus)
                try:
                    await bot.send_message(
                        int(ref_id),
                        f"🎉 নতুন রেফার! <b>{message.from_user.first_name}</b> আপনার লিংকে জয়েন করেছে।"
                        + (f"\n💰 <b>+{bonus}</b> ব্যালেন্স যোগ হয়েছে!" if bonus > 0 else ""),
                    )
                except Exception:
                    pass

    # deep-link straight into a package (from update notification button)
    if payload.startswith("pkg_"):
        await show_package_msg(message, payload[4:])
        return

    await message.answer(WELCOME, reply_markup=_mm(message))


@router.message(F.text == "📦 প্যাকেজ")
@router.message(F.text == "📦 প্যাকেজের তালিকা")
async def show_packages(message: Message):
    pkgs = await db.list_packages()
    if not pkgs:
        await message.answer("⏳ এখনো কোনো প্যাকেজ যোগ হয়নি — খুব শীঘ্রই আসছে!", reply_markup=_mm(message))
        return
    await message.answer("📦 <b>সব প্যাকেজ</b> — যেটা দেখতে/কিনতে চান বাছুন:", reply_markup=kb.packages_kb(pkgs))


@router.message(F.text == "ℹ️ হেল্প")
async def show_help(message: Message):
    await message.answer(HELP, reply_markup=_mm(message))


@router.message(F.text == "👥 রেফার")
async def show_referral(message: Message, bot: Bot):
    me = await bot.get_me()
    uid = str(message.from_user.id)
    st = await db.get_settings()
    if not st.get("referral_on", True):
        await message.answer("⛔ <b>রেফার সিস্টেম এখন বন্ধ আছে।</b>", reply_markup=_mm(message))
        return
    me_db = await db.rget(f"{db.USERS}/{uid}") or {}
    rcfg = await db.rget(db.REFERRAL) or {}
    bonus = float(st.get("referral_bonus") or rcfg.get("bonus_join") or 0)
    earn = me_db.get("balance") or 0
    count = me_db.get("ref_count") or 0
    link = referral_link(me.username, uid)
    lines = [
        "👥 <b>রেফার সিস্টেম</b>\n",
        f"🔗 আপনার লিংক:\n<code>{link}</code>\n",
        f"👨‍👩‍👧 রেফার হয়েছে: <b>{count} জন</b>",
        f"💰 রেফার আয়: <b>{earn} ৳</b>",
    ]
    if bonus > 0:
        lines.append(f"\n🎁 প্রতি রেফারে <b>+{bonus} ৳</b> ব্যালেন্স পাবেন!")
    await message.answer("\n".join(lines), reply_markup=kb.referral_kb(link))


@router.callback_query(F.data == "pkgs")
async def cb_packages(cb: CallbackQuery):
    pkgs = await db.list_packages()
    if not pkgs:
        await cb.answer("এখনো কোনো প্যাকেজ নেই", show_alert=True)
        return
    await cb.message.edit_text("📦 <b>সব প্যাকেজ</b> — যেটা দেখতে/কিনতে চান বাছুন:", reply_markup=kb.packages_kb(pkgs))


@router.callback_query(F.data.startswith("pkg:"))
async def cb_package(cb: CallbackQuery):
    await cb.answer()
    await show_package(cb, cb.data.split(":", 1)[1])


@router.callback_query(F.data.startswith("demo:"))
async def cb_demo(cb: CallbackQuery, bot: Bot):
    key = cb.data.split(":", 1)[1]
    await cb.answer("ডেমো পাঠানো হচ্ছে…")
    p = await db.get_package(key)
    media = list((p.get("demo_media") or {}).items())
    if not media:
        await cb.answer("এই প্যাকেজে এখনো ডেমো নেই", show_alert=True)
        return

    # show ALL demos together, max 10 per media album
    def mk(m):
        if m.get("type") == "video":
            return InputMediaVideo(media=m.get("file_id") or m.get("url"))
        if m.get("url") and not m.get("file_id"):
            return InputMediaPhoto(media=m["url"])
        return InputMediaPhoto(media=m["file_id"])

    items = [m for _, m in media]
    caption = f"🎁 <b>{p.get('name', 'প্যাকেজ')}</b> — ফ্রি ডেমো ({len(items)} টা)"
    first = mk(items[0])
    first.caption = caption
    batch = [first] + [mk(m) for m in items[1:10]]
    await bot.send_media_group(cb.from_user.id, batch)
    for i in range(10, len(items), 10):
        await asyncio.sleep(1)
        await bot.send_media_group(cb.from_user.id, [mk(m) for m in items[i:i + 10]])
    owned = await db.is_owned(str(cb.from_user.id), key)
    await cb.message.answer("⬆️ উপরে সব ডেমো দেখুন 👆", reply_markup=kb.package_kb(key, len(items), owned=owned))


@router.callback_query(F.data.startswith("buy:"))
async def cb_buy(cb: CallbackQuery, bot: Bot):
    key = cb.data.split(":", 1)[1]
    uid = str(cb.from_user.id)
    p = await db.get_package(key)
    if not p:
        await cb.answer("\u274c \u09aa\u09cd\u09af\u09be\u0995\u09c7\u099c\u099f\u09bf \u0986\u09b0 \u09a8\u09c7\u0987", show_alert=True)
        return
    if await db.is_owned(uid, key):
        await cb.answer("\u2705 \u0986\u09aa\u09a8\u09bf \u0987 \u09aa\u09cd\u09af\u09be\u0995\u09c7\u099c\u099f\u09bf \u0995\u09bf\u09a8\u09c7\u099b\u09c7\u09a8", show_alert=True)
        return
    st = await db.get_settings()
    u0 = await db.rget(f"{db.USERS}/{uid}") or {}
    if u0.get("banned"):
        await cb.answer("\U0001f6ab \u0986\u09aa\u09a8\u09be\u0995\u09c7 \u09ac\u09cd\u09af\u09be\u09a8 \u0995\u09b0\u09be \u09b9\u09af\u09bc\u09c7\u099b\u09c7!", show_alert=True)
        return
    if not st.get("buy_on", True):
        await cb.answer()
        rows = [[InlineKeyboardButton(text="\U0001f5e0 \u098f\u09a1\u09ae\u09bf\u09a8\u09c7\u09b0 \u09b8\u09be\u09a5\u09c7 \u0995\u09a5\u09be \u09ac\u09b2\u09c1\u09a8", url=f"https://t.me/{config.ADMIN_CONTACT.lstrip('@')}")]] if config.ADMIN_CONTACT else []
        rows.append([InlineKeyboardButton(text="\u2b05\ufe0f \u09ab\u09bf\u09b0\u09c1\u09a8", callback_data=f"pkg:{key}")])
        await cb.message.answer("\u26d4 <b>\u0995\u09c7\u09a8\u09be\u09b0 \u09b8\u09bf\u09b8\u09cd\u099f\u09c7\u09ae \u098f\u0996\u09a8 \u09ac\u09a8\u09cd\u09a7 \u0986\u099b\u09c7\u0964</b>",
                                reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))
        return
    name = p.get("name", "\u09aa\u09cd\u09af\u09be\u0995\u09c7\u099c")
    price = float(p.get("price") or 0)
    u = await db.rget(f"{db.USERS}/{uid}") or {}
    balance = float(u.get("balance") or 0)
    if balance >= price and price >= 0:
        await cb.answer()
        await cb.message.answer(
            f"\U0001f6d2 <b>{name}</b> \u0995\u09bf\u09a8\u09ac\u09c7\u09a8?\n\n"
            f"\U0001f4b0 \u09aa\u09cd\u09af\u09be\u0995\u09c7\u099c\u09c7\u09b0 \u09a6\u09be\u09ae: <b>{_money(price)} \u09f3</b>\n"
            f"\U0001f4b0 \u0986\u09aa\u09a8\u09be\u09b0 \u09ac\u09cd\u09af\u09be\u09b2\u09c7\u09a8\u09cd\u09b8: <b>{_money(balance)} \u09f3</b>\n"
            f"\U0001f4b0 \u0995\u09c7\u09a8\u09be\u09b0 \u09aa\u09b0\u09c7 \u09ac\u09cd\u09af\u09be\u09b2\u09c7\u09a8\u09cd\u09b8: <b>{_money(balance - price)} \u09f3</b>\n\n"
            "\u26a0\ufe0f \u0995\u09a8\u09ab\u09be\u09b0\u09cd\u09ae \u0995\u09b0\u09b2\u09c7 \u09ac\u09cd\u09af\u09be\u09b2\u09c7\u09a8\u09cd\u09b8 \u09a5\u09c7\u0995\u09c7 \u099f\u09be\u0995\u09be \u0995\u099f\u09be \u09b9\u09ac\u09c7\u0964",
            reply_markup=InlineKeyboardMarkup(inline_keyboard=[
                [InlineKeyboardButton(text=f"\u2705 \u0995\u09bf\u09a8\u09c1\u09a8 ({_money(price)} \u09f3)", callback_data=f"buyok:{key}")],
                [InlineKeyboardButton(text="\u274c \u09ac\u09be\u09a4\u09bf\u09b2", callback_data=f"pkg:{key}")],
            ]))
        return
    short = price - balance
    await cb.answer()
    rows = [[InlineKeyboardButton(text="\U0001f4b0 \u09a1\u09bf\u09aa\u09cb\u099c\u09bf\u099f \u0995\u09b0\u09c1\u09a8", callback_data="dep:menu")]]
    if config.ADMIN_CONTACT:
        rows.append([InlineKeyboardButton(text="\U0001f465 \u098f\u09a1\u09ae\u09bf\u09a8\u09c7\u09b0 \u09b8\u09be\u09a5\u09c7 \u0995\u09a5\u09be \u09ac\u09b2\u09c1\u09a8",
                       url=f"https://t.me/{config.ADMIN_CONTACT.lstrip('@')}")])
    rows.append([InlineKeyboardButton(text="\u2b05\ufe0f \u09aa\u09cd\u09af\u09be\u0995\u09c7\u099c\u09c7 \u09ab\u09bf\u09b0\u09c1\u09a8", callback_data=f"pkg:{key}")])
    await cb.message.answer(
        f"\U0001f6d2 <b>{name}</b>\n\n"
        f"\U0001f4b0 \u09aa\u09cd\u09af\u09be\u0995\u09c7\u099c\u09c7\u09b0 \u09a6\u09be\u09ae: <b>{_money(price)} \u09f3</b>\n"
        f"\U0001f4b0 \u0986\u09aa\u09a8\u09be\u09b0 \u09ac\u09cd\u09af\u09be\u09b2\u09c7\u09a8\u09cd\u09b8: <b>{_money(balance)} \u09f3</b>\n"
        f"\u274c \u09ac\u09cd\u09af\u09be\u09b2\u09c7\u09a8\u09cd\u09b8 \u0985\u09aa\u09b0\u09cd\u09af\u09be\u09aa\u09cd\u09a4 \u2014 \u0986\u09b0 <b>{_money(short)} \u09f3</b> \u09a6\u09b0\u0995\u09be\u09b0\u0964\n\n"
        "\U0001f4b0 \u09a1\u09bf\u09aa\u09cb\u099c\u09bf\u099f \u0995\u09b0\u09c7 \u09ac\u09cd\u09af\u09be\u09b2\u09c7\u09a8\u09cd\u09b8 \u09ac\u09be\u09dc\u09bf\u09af\u09bc\u09c7 \u09a8\u09bf\u09a8, \u09a4\u09be\u09b0\u09aa\u09b0 \u09b8\u09b9\u099c\u09c7\u0987 \u0995\u09bf\u09a8\u09a4\u09c7 \u09aa\u09be\u09b0\u09ac\u09c7\u09a8\u0964\n"
        "\u2705 Binance \u09a1\u09bf\u09aa\u09cb\u099c\u09bf\u099f \u0985\u09be\u099f\u09cb-\u09ad\u09c7\u09b0\u09bf\u09ab\u09be\u0987 \u09b9\u09af\u09bc \u2014 \u0995\u09bf\u099b\u09c1 \u09b8\u09c7\u0995\u09c7\u09a8\u09cd\u09a1\u09c7\u09b0 \u09ae\u09a7\u09cd\u09af\u09c7\u0964",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))


@router.callback_query(F.data.startswith("buyok:"))
async def cb_buyok(cb: CallbackQuery, bot: Bot):
    key = cb.data.split(":", 1)[1]
    uid = str(cb.from_user.id)
    p = await db.get_package(key)
    if not p:
        await cb.answer("\u274c \u09aa\u09cd\u09af\u09be\u0995\u09c7\u099c\u099f\u09bf \u0986\u09b0 \u09a8\u09c7\u0987", show_alert=True)
        return
    if await db.is_owned(uid, key):
        await cb.answer("\u2705 \u0986\u0997\u09c7\u0987 \u0995\u09bf\u09a8\u09be \u09b9\u09af\u09bc\u09c7\u099b\u09c7", show_alert=True)
        return
    u = await db.rget(f"{db.USERS}/{uid}") or {}
    if u.get("banned"):
        await cb.answer("\U0001f6ab \u0986\u09aa\u09a8\u09be\u0995\u09c7 \u09ac\u09cd\u09af\u09be\u09a8 \u0995\u09b0\u09be \u09b9\u09af\u09bc\u09c7\u099b\u09c7!", show_alert=True)
        return
    price = float(p.get("price") or 0)
    balance = float(u.get("balance") or 0)
    if balance < price:
        await cb.answer("\u274c \u09ac\u09cd\u09af\u09be\u09b2\u09c7\u09a8\u09cd\u09b8 \u0985\u09aa\u09b0\u09cd\u09af\u09be\u09aa\u09cd\u09a4 \u2014 \u09a1\u09bf\u09aa\u09cb\u099c\u09bf\u099f \u0995\u09b0\u09c1\u09a8", show_alert=True)
        return
    # deduct + record
    await db.rpatch(f"{db.USERS}/{uid}", {"balance": balance - price})
    await db.record_purchase(uid, key, p)
    total = len(p.get("demo_media") or {})
    await cb.answer()
    await cb.message.answer(
        f"\u2705 \u0995\u09c7\u09a8\u09be \u09b8\u09ab\u09b2 \u09b9\u09af\u09bc\u09c7\u099b\u09c7!\n\n"
        f"\U0001f4e6 <b>{p.get('name', '')}</b> \u098f\u0996\u09a8 \u0986\u09aa\u09a8\u09be\u09b0\u0964\n"
        f"\U0001f4b0 \u0995\u099f\u09be \u09b9\u09b2\u09cb: {_money(price)} \u09f3 \u2014 \u09a8\u09a4\u09c1\u09a8 \u09ac\u09cd\u09af\u09be\u09b2\u09c7\u09a8\u09cd\u09b8: <b>{_money(balance - price)} \u09f3</b>",
        reply_markup=kb.package_kb(key, total, owned=True))
    await _notify_admins(bot,
        f"\U0001f6d2 <b>\u09a8\u09a4\u09c1\u09a8 \u0995\u09c7\u09a8\u09be</b>\n"
        f"\U0001f465 <a href=\"tg://user?id={uid}\">{u.get('first_name') or uid}</a> (<code>{uid}</code>)\n"
        f"\U0001f4e6 {p.get('name', '')}\n"
        f"\U0001f4b0 {_money(price)} \u09f3 \u2014 \u0985\u09ac\u09b6\u09bf\u09b7\u09cd\u099f \u09ac\u09cd\u09af\u09be\u09b2\u09c7\u09a8\u09cd\u09b8: {_money(balance - price)} \u09f3")


@router.callback_query(F.data == "noop")
async def cb_noop(cb: CallbackQuery):
    await cb.answer()


@router.message()
async def fallback(message: Message):
    await message.answer("👇 নিচের মেনু থেকে বাছুন:", reply_markup=_mm(message))
