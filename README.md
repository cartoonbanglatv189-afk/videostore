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
| `BINANCE_API_KEY` / `BINANCE_API_SECRET` | — | Enables deposit auto-verify (see below) |

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
vzbot/referral_config  = { bonus_join }   # 0 = off
vzbot/deposit_methods  = { <key>: { name, network, address, min_amount } }
vzbot/deposits/<key>   = { uid, method, method_name, asset, amount, txid, status,
                           created_at, bn_snapshot{kind,code,asset,address,label,offchain_ok,t0},
                           bn_state?, review_reason?, review_detail?,
                           auto_verified?, approved_by?, approved_at? }
vzbot/used_txids/<k>   = { dep_id, uid, amount, at }   # duplicate protection
```

## 💰 Deposit with Binance auto-verify (ON)

Users: 💰 ডিপোজিট → pick a method → enter amount ($) → pay to the shown address → submit TXID.
The bot calls the signed Binance API several times over ~a minute:
- **matched** (right ID/asset/amount/network/address/confirmations) → balance credited **automatically**, user notified
- **mismatch / overpaid / wrong network** → goes to the admin as Manual Review with the exact reason
- **not found after all retries** → stays pending for the admin (never an automatic rejection)
- duplicate TXIDs (approved or earlier pending) are **blocked** — a reference can never credit twice
- off-chain/internal transfers ("Off-chain transfer <id>") are verified via deposit history, Binance Pay
  via Pay history — same rules as the original engine

Admin (💰 ডিপোজিট in the admin menu): approve/reject pending deposits, manage deposit methods.

Env for auto-verify:

| Variable | Description |
|---|---|
| `BINANCE_API_KEY` / `BINANCE_API_SECRET` | Binance read-only API keys — required for auto-verify |
| `BINANCE_AUTO_VERIFY` | `0` = verification never runs (all manual) |
| `BINANCE_AUTO_CREDIT` | `0` = verified payments still need admin approval |
| `BINANCE_VERIFY_DELAYS` | seconds between checks, e.g. `5,30,60,120,300` (default) |

The "Buy" button inside packages still shows the payment-off notice until wired to wallet balance.

## 🌐 Hosting

Long polling needs a process that stays alive (Render **Background Worker**, a VPS,
PythonAnywhere, etc.). A free Render *web service* cannot long-poll — give the word and we
can switch the bot to **webhook mode** which runs fine on a free web service.
