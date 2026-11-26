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


def package_kb(key: str, demo_count: int) -> InlineKeyboardMarkup:
    demo_label = f"🎁 সব ডেমো দেখুন ({demo_count})" if demo_count else "🎁 ডেমো শীঘ্রই আসছে"
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=demo_label, callback_data=f"demo:{key}" if demo_count else "noop")],
        [InlineKeyboardButton(text="🛒 কিনুন", callback_data=f"buy:{key}")],
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
        [InlineKeyboardButton(text="👥 ইউজার সংখ্যা", callback_data="adm:users")],
        [InlineKeyboardButton(text="💰 ডিপোজিট ম্যানেজমেন্ট", callback_data="adm:dep")],
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
