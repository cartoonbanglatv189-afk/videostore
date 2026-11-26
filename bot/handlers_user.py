from __future__ import annotations

import asyncio

from aiogram import Bot, F, Router
from aiogram.filters import CommandStart
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaPhoto, InputMediaVideo, Message

from bot import config, db
from bot.handlers_admin import _mm
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
    await message.answer("\n".join(lines), reply_markup=kb.package_kb(key, total))


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
    text = "\n".join(lines)
    kb_ = kb.package_kb(key, total)
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
                # join bonus (admin-configurable; 0 = off)
                rcfg = await db.rget(db.REFERRAL) or {}
                bonus = float(rcfg.get("bonus_join") or 0)
                if bonus > 0:
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
    me_db = await db.rget(f"{db.USERS}/{uid}") or {}
    rcfg = await db.rget(db.REFERRAL) or {}
    bonus = float(rcfg.get("bonus_join") or 0)
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
    await cb.message.answer("⬆️ উপরে সব ডেমো দেখুন 👆", reply_markup=kb.package_kb(key, len(items)))


@router.callback_query(F.data.startswith("buy:"))
async def cb_buy(cb: CallbackQuery, bot: Bot):
    key = cb.data.split(":", 1)[1]
    p = await db.get_package(key)
    name = p.get("name", "প্যাকেজ")
    lines = [f"🛒 <b>{name}</b> কিনতে চান?\n"]
    lines.append(
        "🚫 <b>পেমেন্ট সিস্টেম আপাতত বন্ধ আছে।</b>\n"
        "খুব শীঘ্রই কিনার সিস্টেম চালু হবে — ততক্ষণ এডমিনের সাথে সরাসরি কথা বলুন।"
    )
    kb_ = kb.buy_off_kb()
    if config.ADMIN_CONTACT:
        kb_ = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="👤 এডমিনের সাথে কথা বলুন", url=f"https://t.me/{config.ADMIN_CONTACT.lstrip('@')}")],
            [InlineKeyboardButton(text="⬅️ প্যাকেজে ফিরুন", callback_data=f"pkg:{key}")],
        ])
    await cb.message.answer("\n".join(lines), reply_markup=kb_)


@router.callback_query(F.data == "noop")
async def cb_noop(cb: CallbackQuery):
    await cb.answer()


@router.message()
async def fallback(message: Message):
    await message.answer("👇 নিচের মেনু থেকে বাছুন:", reply_markup=_mm(message))
