from __future__ import annotations

import asyncio
import time

from aiogram import Bot, F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from bot import config, db
from bot import keyboards as kb

router = Router()


class Pkg(StatesGroup):
    name = State()
    price = State()
    description = State()

class Media(StatesGroup):
    adding = State()

class Edit(StatesGroup):
    value = State()


def admin_only(message: Message) -> bool:
    return message.from_user.id in config.ADMIN_IDS


def _mm(message: Message):
    """main menu keyboard with the admin row visible only to admins"""
    return kb.main_menu(is_admin=message.from_user.id in config.ADMIN_IDS)


def _cb_admin(c: CallbackQuery) -> bool:
    # guards EVERY callback in this router (Telgres allows forged callback_data)
    return c.from_user.id in config.ADMIN_IDS


router.callback_query.filter(_cb_admin)


@router.message(Command("admin"))
async def adm_cmd(message: Message, state: FSMContext):
    if not admin_only(message):
        return
    await state.clear()
    await message.answer("🛠 <b>এডমিন প্যানেল</b>\nকী করতে চান?", reply_markup=kb.admin_menu())


@router.message(F.text == "🗠 অ্যাডমিন")
@router.message(F.text == "🗠 অ্যাডমিন প্যানেল")
async def adm_btn(message: Message, state: FSMContext):
    await adm_cmd(message, state)


@router.callback_query(F.data == "adm:menu")
async def adm_menu(cb: CallbackQuery, state: FSMContext):
    await state.clear()
    await cb.message.edit_text("🛠 <b>এডমিন প্যানেল</b>\nকী করতে চান?", reply_markup=kb.admin_menu())


# ---------- create package wizard ----------

@router.callback_query(F.data == "adm:newpkg")
async def adm_newpkg(cb: CallbackQuery, state: FSMContext):
    await state.set_state(Pkg.name)
    await cb.message.answer("📦 নতুন প্যাকেজের <b>নাম</b> লিখুন: (বাতিল /cancel)")
    await cb.answer()


@router.message(Pkg.name, F.text)
async def pkg_name(message: Message, state: FSMContext):
    if not admin_only(message):
        return
    name = message.text.strip()
    if len(name) < 2:
        return await message.answer("নামটা আবার লিখুন: (বাতিল /cancel)")
    await state.update_data(name=name)
    await state.set_state(Pkg.price)
    await message.answer(f"✅ নাম: <b>{name}</b>\n\n💰 এবার <b>দাম</b> লিখুন (৳ ছাড়া, শুধু সংখ্যা):")


@router.message(Pkg.price, F.text)
async def pkg_price(message: Message, state: FSMContext):
    if not admin_only(message):
        return
    t = message.text.strip().replace("৳", "").strip()
    if not t.replace(".", "", 1).isdigit():
        return await message.answer("দাম অবশ্যই একটা সংখ্যা হতে হবে — আবার লিখুন:")
    await state.update_data(price=float(t))
    await state.set_state(Pkg.description)
    await message.answer("✅ দাম ঠিক আছে।\n\n📄 এবার <b>বর্ণনা</b> লিখুন (এক মেসেজে):")


@router.message(Pkg.description, F.text)
async def pkg_desc(message: Message, state: FSMContext):
    if not admin_only(message):
        return
    data = await state.get_data()
    pkg = {
        "name": data.get("name"),
        "price": data.get("price"),
        "description": message.text.strip(),
        "created_at": int(time.time()),
        "demo_media": {},
    }
    key = await db.rpush(db.PACKAGES, pkg)
    await state.clear()
    await message.answer(
        f"✅ <b>{pkg.get('name')}</b> প্যাকেজ তৈরি হয়েছে!\n\n"
        "এখন এই প্যাকেজে ➕ <b>মিডিয়া</b> যোগ করুন।",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="📦 প্যাকেজ খুলুন", callback_data=f"adm:pkg:{key}")],
            [InlineKeyboardButton(text="⬅️ এডমিন মেনু", callback_data="adm:menu")],
        ]))


@router.message(Command("cancel"))
async def cancel_any(message: Message, state: FSMContext):
    if not admin_only(message):
        return
    await state.clear()
    await message.answer("❎ বাতিল হলো।", reply_markup=kb.admin_menu())


# ---------- package list / screen ----------

@router.callback_query(F.data == "adm:pkglist")
async def adm_pkglist(cb: CallbackQuery):
    pkgs = await db.list_packages()
    if not pkgs:
        await cb.message.edit_text("কোনো প্যাকেজ নেই — ➕ নতুন প্যাকেজ বানান।", reply_markup=kb.admin_menu())
        return
    rows = [[InlineKeyboardButton(text=f"📦 {p.get('name','?')} ({len(p.get('demo_media') or {})} মিডিয়া)", callback_data=f"adm:pkg:{k}")]
            for k, p in pkgs.items()]
    rows.append([InlineKeyboardButton(text="⬅️ এডমিন মেনু", callback_data="adm:menu")])
    await cb.message.edit_text("প্যাকেজ বাছুন:", reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))


@router.callback_query(F.data.startswith("adm:pkg:"))
async def adm_pkg(cb: CallbackQuery, state: FSMContext):
    key = cb.data.split(":", 2)[2]
    await state.update_data(pkg_key=key)
    p = await db.get_package(key)
    if not p:
        await cb.answer("প্যাকেজটি মুছে গেছে", show_alert=True)
        return
    n = len(p.get("demo_media") or {})
    await cb.message.edit_text(
        f"📦 <b>{p.get('name')}</b>\n💰 {p.get('price')} ৳\n📄 {p.get('description') or '—'}\n🎁 মিডিয়া: {n}",
        reply_markup=kb.admin_package_kb(key, n),
    )


async def admin_pkg_refresh(cb: CallbackQuery, key: str, n: int):
    p = await db.get_package(key)
    if not p:
        await cb.message.edit_text("প্যাকেজটি আর নেই।", reply_markup=kb.admin_menu())
        return
    try:
        await cb.message.edit_text(
            f"📦 <b>{p.get('name', key)}</b>\n💰 {p.get('price')} ৳\n📄 {p.get('description') or '—'}\n🎁 মিডিয়া: {n}",
            reply_markup=kb.admin_package_kb(key, n),
        )
    except Exception:
        pass


# ---------- add demo media ----------

@router.callback_query(F.data.startswith("adm:addmedia:"))
async def adm_addmedia(cb: CallbackQuery, state: FSMContext):
    key = cb.data.split(":", 2)[2]
    await state.update_data(pkg_key=key)
    await state.set_state(Media.adding)
    await cb.message.answer(
        f"📤 <b>{(await db.get_package(key)).get('name')}</b>-এ মিডিয়া পাঠান ফটো / ভিডিও।\n"
        "একটার পর একটা (অ্যালবাম সহ) যত খুশি পাঠান।\n"
        "শেষ হলে ✅ <b>ব্যাস, শেষ</b> চাপুন। (বাতিল /cancel)"
    )
    await cb.answer()


async def _save_media(state: FSMContext, reply_to: Message, mtype: str, file_id: str | None, url: str | None) -> None:
    key = (await state.get_data()).get("pkg_key", "")
    if not key:
        return
    data = {"type": mtype}
    if file_id:
        data["file_id"] = file_id
    if url:
        data["url"] = url
    new_key = await db.rpush(f"{db.PACKAGES}/{key}/demo_media", data)
    # per-session added counter (for the update notification)
    d = await state.get_data()
    added = d.get("added_video", 0), d.get("added_photo", 0)
    if mtype == "video":
        await state.update_data(added_video=added[0] + 1)
    else:
        await state.update_data(added_photo=added[1] + 1)
    p = await db.get_package(key)
    n = len(p.get("demo_media") or {})
    try:
        await reply_to.answer(f"✅ যোগ হয়েছে! (মোট {n} মিডিয়া)", reply_markup=kb.media_done_kb())
    except Exception:
        pass


@router.message(Media.adding, F.photo)
async def media_photo(message: Message, state: FSMContext):
    if not admin_only(message):
        return
    await _save_media(state, message, "photo", message.photo[-1].file_id, None)


@router.message(Media.adding, F.video)
async def media_video(message: Message, state: FSMContext):
    if not admin_only(message):
        return
    await _save_media(state, message, "video", message.video.file_id, None)


@router.message(Media.adding, F.animation)
async def media_anim(message: Message, state: FSMContext):
    if not admin_only(message):
        return
    await _save_media(state, message, "video", message.animation.file_id, None)


@router.message(Media.adding, F.document)
async def media_doc(message: Message, state: FSMContext):
    if not admin_only(message):
        return
    doc = message.document
    if doc.mime_type and doc.mime_type.startswith("video/"):
        await _save_media(state, message, "video", doc.file_id, None)
    else:
        await _save_media(state, message, "photo", doc.file_id, None)


@router.message(Media.adding, F.text)
async def media_text(message: Message, state: FSMContext):
    if not admin_only(message):
        return
    url = message.text.strip()
    if not url.lower().startswith(("http://", "https://")):
        await message.answer("❌ লিংক http/https দিয়ে শুরু হতে হবে। ফটো/ভিডিও সরাসরি পাঠান অথবা সঠিক লিংক দিন।")
        return
    mtype = "video" if any(url.lower().endswith((".mp4", ".mov", ".webm", ".m4v"))) else "photo"
    await _save_media(state, message, mtype, None, url)


@router.callback_query(Media.adding, F.data == "adm:mediadone")
async def media_done(cb: CallbackQuery, state: FSMContext):
    key = (await state.get_data()).get("pkg_key", "")
    d = await state.get_data()
    nv, nph = d.get("added_video", 0), d.get("added_photo", 0)
    await state.clear()
    await state.update_data(pkg_key=key, last_added_video=nv, last_added_photo=nph)
    p = await db.get_package(key)
    n = len(p.get("demo_media") or {})
    await cb.message.answer(
        f"✅ মিডিয়া যোগ শেষ!\n🆕 নতুন: {nv} ভিডিও + {nph} ফটো\n📦 মোট: {n} মিডিয়া",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🔔 আপডেট নোটিফিকেশন পাঠাও", callback_data=f"adm:notify:{key}")],
            [InlineKeyboardButton(text="⬅️ প্যাকেজে ফিরুন", callback_data=f"adm:pkg:{key}")],
        ]))
    await cb.answer()


# ---------- media manage ----------

@router.callback_query(F.data.startswith("adm:medialist:"))
async def adm_medialist(cb: CallbackQuery, state: FSMContext):
    key = cb.data.split(":", 2)[2]
    await state.update_data(pkg_key=key)
    p = await db.get_package(key)
    media = p.get("demo_media") or {}
    if not media:
        await cb.answer("কোনো মিডিয়া নেই", show_alert=True)
        return
    rows = []
    for i, (mk, m) in enumerate(list(media.items())[:40], start=1):
        rows.append([InlineKeyboardButton(
            text=f"🗑 {i}. {'🎬' if m.get('type') == 'video' else '📷'} …{(m.get('file_id') or m.get('url') or '')[-16:]}",
            callback_data=f"adm:delmedia:{key}:{mk}"),
        ])
    rows.append([InlineKeyboardButton(text="🗑 সব মুছুন", callback_data=f"adm:delmediaall:{key}")])
    rows.append([InlineKeyboardButton(text="⬅️ প্যাকেজে ফিরুন", callback_data=f"adm:pkg:{key}")])
    await cb.message.edit_text(f"মিডিয়া ম্যানেজ ({len(media)} টা) — যেটা মুছবেন তাতে চাপুন:",
                               reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))


@router.callback_query(F.data.startswith("adm:delmedia:"))
async def adm_delmedia(cb: CallbackQuery):
    _, _, key, mk = cb.data.split(":", 3)
    await db.rdelete(f"{db.PACKAGES}/{key}/demo_media/{mk}")
    await cb.answer("✅ মুছে ফেলা হয়েছে")
    p = await db.get_package(key)
    await admin_pkg_refresh(cb, key, len(p.get("demo_media") or {}))


@router.callback_query(F.data.startswith("adm:delmediaall:"))
async def adm_delmediaall(cb: CallbackQuery):
    key = cb.data.split(":", 2)[2]
    await db.rdelete(f"{db.PACKAGES}/{key}/demo_media")
    await cb.answer("✅ সব মুছে ফেলা হয়েছে")
    await admin_pkg_refresh(cb, key, 0)


# ---------- edit name/price/desc ----------

@router.callback_query(F.data.startswith("adm:editpkg:"))
async def adm_editpkg(cb: CallbackQuery, state: FSMContext):
    key = cb.data.split(":", 2)[2]
    await state.update_data(pkg_key=key)
    rows = [
        [InlineKeyboardButton(text="📝 নাম", callback_data=f"adm:editfield:{key}:name"),
         InlineKeyboardButton(text="💰 দাম", callback_data=f"adm:editfield:{key}:price")],
        [InlineKeyboardButton(text="📄 বর্ণনা", callback_data=f"adm:editfield:{key}:description")],
        [InlineKeyboardButton(text="⬅️ প্যাকেজে ফিরুন", callback_data=f"adm:pkg:{key}")],
    ]
    await cb.message.edit_text("কী এডিট করবেন?", reply_markup=InlineKeyboardMarkup(inline_keyboard=rows))


@router.callback_query(F.data.startswith("adm:editfield:"))
async def adm_editfield(cb: CallbackQuery, state: FSMContext):
    _, _a, key, field = cb.data.split(":", 3)
    await state.update_data(pkg_key=key, edit_field=field)
    await state.set_state(Edit.value)
    labels = {"name": "নতুন নাম", "price": "নতুন দাম (শুধু সংখ্যা)", "description": "নতুন বর্ণনা"}
    await cb.message.answer(f"✍️ {labels.get(field, 'নতুন মান')} লিখুন: (বাতিল /cancel)")
    await cb.answer()


@router.message(Edit.value, F.text)
async def edit_value(message: Message, state: FSMContext):
    if not admin_only(message):
        return
    data = await state.get_data()
    key, field = data.get("pkg_key"), data.get("edit_field")
    val = message.text.strip()
    if field == "price":
        if not val.replace(".", "", 1).isdigit():
            return await message.answer("দাম একটা সংখ্যা হতে হবে — আবার লিখুন:")
        val = float(val)
    await db.rpatch(f"{db.PACKAGES}/{key}", {field: val})
    await state.clear()
    await state.update_data(pkg_key=key)
    await message.answer("✅ এডিট হয়ে গেছে!", reply_markup=kb.admin_menu())


# ---------- update notification broadcast ----------

def update_text(p: dict, n_new_video: int = 0, n_new_photo: int = 0) -> str:
    total = len(p.get("demo_media") or {})
    parts = []
    if n_new_video:
        parts.append(f"🎬 {n_new_video} টি নতুন ভিডিও")
    if n_new_photo:
        parts.append(f"📷 {n_new_photo} টি নতুন ফটো")
    extra = (" + ".join(parts) + " যোগ হয়েছে!") if parts else "🎁 নতুন ডেমো যোগ হয়েছে!"
    lines = [
        f"🔥 <b>{p.get('name', 'প্যাকেজ')}</b> আপডেট হয়েছে!",
        "",
        f"🆕 {extra}",
        f"📦 মোট ডেমো মিডিয়া: <b>{total}</b>",
        f"💰 দাম: <b>{p.get('price')} ৳</b>",
    ]
    if p.get("description"):
        lines.append(f"📄 {p.get('description')}")
    lines.append("\n👇 নিচের বাটনে চাপ দিয়ে সরাসরি প্যাকেজ দেখুন ও কিনুন!")
    return "\n".join(lines)


@router.callback_query(F.data.startswith("adm:notify:"))
async def adm_notify(cb: CallbackQuery, state: FSMContext):
    key = cb.data.split(":", 2)[2]
    d = await state.get_data()
    if d.get("pkg_key") != key:
        await state.update_data(pkg_key=key, last_added_video=0, last_added_photo=0)
    p = await db.get_package(key)
    if not p:
        await cb.answer("প্যাকেজটি আর নেই", show_alert=True)
        return
    n = len(p.get("demo_media") or {})
    video = sum(1 for m in (p.get("demo_media") or {}).values() if m.get("type") == "video")
    # prefer the session's "new" counts when admin just finished adding media
    n_new_video = min(int(d.get("last_added_video") or 0), video) if d.get("pkg_key") == key else 0
    n_new_photo = int(d.get("last_added_photo") or 0) if d.get("pkg_key") == key else 0
    if not (n_new_video or n_new_photo):
        n_new_video, n_new_photo = video, n - video
    preview = update_text(p, n_new_video, n_new_photo)
    await cb.message.answer("🔔 <b>নোটিফিকেশন প্রিভিউ</b>\n\n" + preview, reply_markup=kb.broadcast_confirm_kb())
    await cb.answer()


@router.callback_query(F.data.startswith("adm:broadcast:"))
async def adm_broadcast(cb: CallbackQuery, state: FSMContext, bot: Bot):
    mode = cb.data.split(":", 2)[2]
    if mode == "no":
        await cb.message.answer("🚫 পাঠানো হয়নি।", reply_markup=kb.admin_menu())
        return
    data = await state.get_data()
    key = data.get("pkg_key", "")
    p = await db.get_package(key)
    if not p:
        await cb.answer("প্যাকেজটি আর নেই", show_alert=True)
        return
    video = sum(1 for m in (p.get("demo_media") or {}).values() if m.get("type") == "video")
    n_new_video = min(int(data.get("last_added_video") or 0), video)
    n_new_photo = int(data.get("last_added_photo") or 0)
    text = update_text(p, n_new_video, n_new_photo)
    me = await bot.get_me()
    kb_ = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🛒 কিনুন / দেখুন", url=f"https://t.me/{me.username}?start=pkg_{key}")],
    ])
    users = await db.rget(db.USERS) or {}
    ids = [int(u) for u in users.keys() if u.lstrip("-").isdigit()]
    sent = 0
    await cb.answer(f"{len(ids)} জনকে পাঠানো হচ্ছে…")
    for i in range(0, len(ids), 25):
        for uid in ids[i:i + 25]:
            try:
                await bot.send_message(uid, text, reply_markup=kb_)
                sent += 1
            except Exception:
                pass
        await asyncio.sleep(1)
    await state.update_data(last_added_video=0, last_added_photo=0)
    await cb.message.answer(f"✅ <b>{sent}</b> জন ইউজারকে নোটিফিকেশন পাঠানো হয়েছে!", reply_markup=kb.admin_menu())


# ---------- delete package ----------

@router.callback_query(F.data.startswith("adm:delask:"))
async def adm_delask(cb: CallbackQuery):
    key = cb.data.split(":", 2)[2]
    await cb.message.answer("⚠️ সত্যিই প্যাকেজটি ডিলিট করবেন? মিডিয়াসহ সব চলে যাবে!", reply_markup=kb.delete_confirm_kb(key))
    await cb.answer()


@router.callback_query(F.data.startswith("adm:del:"))
async def adm_del(cb: CallbackQuery):
    key = cb.data.split(":", 2)[2]
    await db.rdelete(f"{db.PACKAGES}/{key}")
    await cb.answer("প্যাকেজ মুছে ফেলা হয়েছে")
    await cb.message.edit_text("🗑 প্যাকেজ মুছে ফেলা হয়েছে।", reply_markup=kb.admin_menu())


# ---------- users ----------

@router.callback_query(F.data == "adm:users")
async def adm_users(cb: CallbackQuery):
    users = await db.rget(db.USERS) or {}
    await cb.answer(f"👥 মোট ইউজার: {len(users)} জন", show_alert=True)
