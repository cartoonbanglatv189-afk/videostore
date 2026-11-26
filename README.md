# Viral Zone Video — Telegram Package-Selling Bot

An official Telegram bot (Python + aiogram 3) that sells premium video **packages**.
Everything — including the admin panel — lives inside the bot itself.

## ✨ Features

- 📦 **Packages** — admin creates packages (name, price ৳, description) right inside the bot; users browse and open them
- 🎁 **Demo with ALL media together** — admin adds many videos + photos per package (Telegram uploads **and** pasted links both work); users press one button and see every demo as Telegram albums
- 🛒 **Buy** — buy button on every package (payment/deposit system currently **OFF**; shows a notice + admin contact)
- 👥 **Referral system** — every user gets a `?start=ref_<id>` link, referrer count + balance, optional join bonus
- 🔔 **Update notifications** — after adding media, admin sends a broadcast to ALL users: which package, how many new videos/photos, with a **Buy/View** button that deep-links straight into the package (`?start=pkg_<key>`)
- 🛠 **In-bot admin panel** — `/admin`: create/edit/delete packages, add/manage demo media, user count, broadcast

## 🚀 Run

```bash
pip install -r requirements.txt
```

Env vars:

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | ✅ | Bot token from @BotFather |
| `ADMIN_IDS` | ✅ | Comma-separated Telegram numeric IDs, e.g. `123456789,987654321` |
| `ADMIN_CONTACT` | — | Admin @username shown on the "payment off" notice |
| `FIREBASE_DB_URL` | — | Defaults to the project's live RTDB (asia-southeast1) |

Local run (long polling):

```bash
BOT_TOKEN=123:xyz ADMIN_IDS=111,222 python -m bot.main
```

## 🗄 Database (Firebase RTDB)

All bot data lives under the `vzbot/` namespace (old project nodes are untouched):

```
vzbot/packages/<key>  = { name, price, description, created_at,
                          demo_media: { <pushkey>: { type: "photo"|"video", file_id?, url? } } }
vzbot/users/<uid>     = { joined_at, first_name, username, referred_by?, ref_count?, balance? }
vzbot/referral_config = { bonus_join }   # 0 = off
```

## 🔌 Deposit / Payment

**Currently OFF by design.** The `buy:` button shows a "payment coming soon" message with an
admin-contact button. The structure is ready to plug in Binance Pay / ID / TRC20/BEP20
auto-verify later — deposit matching and idempotency patterns are already proven from the
previous build and can be re-introduced on request.

## 🌐 Hosting

Long polling needs a process that stays alive (Render **Background Worker**, a VPS,
PythonAnywhere, etc.). A free Render *web service* cannot long-poll — give the word and we
can switch the bot to **webhook mode** which runs fine on a free web service.
