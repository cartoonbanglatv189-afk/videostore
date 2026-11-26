from __future__ import annotations

from aiogram.types import ForceReply, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton


def main_menu(is_admin: bool = False) -> ReplyKeyboardMarkup:
    rows = [
        [KeyboardButton(text="📦 প্যাকেজ"), KeyboardButton(text="👥 রেফার")],
        [KeyboardButton(text="💰 ডিপোজিট")],
        [KeyboardButton(text="ℹ️ হেল্প")],
    ]
    if is_admin:
        rows.append([KeyboardButton(text="🗠 অ্যাডমিন")])
    return ReplyKeyboardMarkup(keyboard=rows, resize_keyboard=True)


def packages_kb(pkgs: dict) -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text=f"📦 {p.get('name', 'প্যাকেজ')} — ৳/{p.get('price', '?')}", callback_data=f"pkg:{k}")]
        for k, p in pkgs.items()
    ]
    rows.append([InlineKeyboardButton(text="🏠 হোম", callback_data="noop")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def package_kb(key: str, demo_count: int, owned: bool = False) -> InlineKeyboardMarkup:
    demo_label = f"🎁 সব ডেমো দেখুন ({demo_count})" if demo_count else "🎁 ডেমো শীঘ্রই আসছে"
    buy_row = ([InlineKeyboardButton(text="✅ কেনা হয়েছে", callback_data="noop")]
               if owned else
               [InlineKeyboardButton(text="🛒 কিনুন", callback_data=f"buy:{key}")])
    if demo_count:
        demo_row = [InlineKeyboardButton(text=demo_label, callback_data=f"demo:{key}")]
    else:
        demo_row = [InlineKeyboardButton(text=demo_label, callback_data="noop")]
    return InlineKeyboardMarkup(inline_keyboard=[
        demo_row,
        buy_row,
        [InlineKeyboardButton(text="⬅️ প্যাকেজের তালিকা", callback_data="pkgs")],
    ])


def back_to_packages_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="⬅️ প্যাকেজের তালিকা", callback_data="pkgs")]])


def buy_off_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="⬅️ প্যাকেজে ফিরুন", callback_data="pkgs")]])


def referral_kb(link: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔗 বন্ধুদের সাথে শেয়ার করুন", url=f"https://t.me/share/url?url={link}")],
    ])


# ---------- admin ----------

def admin_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="➕ নতুন প্যাকেজ", callback_data="adm:newpkg")],
        [InlineKeyboardButton(text="📦 প্যাকেজ তালিকা", callback_data="adm:pkglist")],
        [InlineKeyboardButton(text="👥 ইউজার", callback_data="adm:uslist"),
         InlineKeyboardButton(text="📢 ব্রডকাস্ট", callback_data="adm:bcast")],
        [InlineKeyboardButton(text="💰 ডিপোজিট ম্যানেজমেন্ট", callback_data="adm:dep")],
        [InlineKeyboardButton(text="⚙️ সেটিংস", callback_data="adm:settings")],
    ])


def admin_package_kb(key: str, demo_count: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="➕ মিডিয়া যোগ করুন", callback_data=f"adm:addmedia:{key}")],
        [InlineKeyboardButton(text=f"🗑 মিডিয়া ম্যানেজ ({demo_count})", callback_data=f"adm:medialist:{key}")],
        [InlineKeyboardButton(text="📝 নাম/দাম/বর্ণনা এডিট", callback_data=f"adm:editpkg:{key}")],
        [InlineKeyboardButton(text="🔔 আপডেট নোটিফিকেশন পাঠাও", callback_data=f"adm:notify:{key}")],
        [InlineKeyboardButton(text="🗑 প্যাকেজ ডিলিট", callback_data=f"adm:delask:{key}")],
        [InlineKeyboardButton(text="⬅️ এডমিন মেনু", callback_data="adm:menu")],
    ])


def edit_pkg_kb(key: str, field: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="❌ বাতিল", callback_data=f"adm:pkg:{key}")]])


def media_done_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="✅ ব্যাস, শেষ", callback_data="adm:mediadone")]])


def broadcast_confirm_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🔔 হ্যাঁ, সবাইকে পাঠাও", callback_data="adm:broadcast:yes")],
        [InlineKeyboardButton(text="🚫 না, পাঠিও না", callback_data="adm:broadcast:no")],
    ])


def delete_confirm_kb(key: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🗑 হ্যাঁ, ডিলিট করো", callback_data=f"adm:del:{key}")],
        [InlineKeyboardButton(text="↩️ না", callback_data=f"adm:pkg:{key}")],
    ])


remove_kb = ForceReply


def settings_kb(s: dict) -> InlineKeyboardMarkup:
    def tog(label, on):
        return f"{label}: {'✅ ON' if on else '❌ OFF'}"
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=tog("🛒 কেনা", s.get("buy_on")), callback_data="adm:tgl:buy_on")],
        [InlineKeyboardButton(text=tog("💰 ডিপোজিট", s.get("deposit_on")), callback_data="adm:tgl:deposit_on")],
        [InlineKeyboardButton(text=tog("👥 রেফার", s.get("referral_on")), callback_data="adm:tgl:referral_on")],
        [InlineKeyboardButton(text=f"🎁 রেফার বোনাস: {s.get('referral_bonus', 0)} ৳ — সেট", callback_data="adm:setbonus")],
        [InlineKeyboardButton(text="⬅️ এডমিন মেনু", callback_data="adm:menu")],
    ])


def user_list_kb(users: dict) -> InlineKeyboardMarkup:
    rows = []
    for uid, u in list(users.items())[-20:]:
        nm = (u.get("first_name") or "?")[:14]
        rows.append([InlineKeyboardButton(text=f"👥 {nm} (…{str(uid)[-4:]})", callback_data=f"adm:usr:{uid}")])
    rows.append([InlineKeyboardButton(text="⬅️ এডমিন মেনু", callback_data="adm:menu")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def user_manage_kb(uid: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="➕ ব্যালেন্স জোগ", callback_data=f"adm:baladd:{uid}"),
         InlineKeyboardButton(text="➖ ব্যালেন্স কাটা", callback_data=f"adm:balsub:{uid}")],
        [InlineKeyboardButton(text="🚫 ব্যান/অব্যান", callback_data=f"adm:ban:{uid}")],
        [InlineKeyboardButton(text="⬅️ ইউজার লিস্ট", callback_data="adm:uslist")],
    ])
