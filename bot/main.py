"""Viral Zone Video — Telegram package-selling bot (aiogram 3).

Two run modes, picked automatically:
- WEBHOOK  (Render free Web Service): when PORT + RENDER_EXTERNAL_URL / WEBHOOK_URL
           exist -> aiohttp server binds $PORT, Telegram posts updates to /webhook
- POLLING  (local / Background Worker / VPS): long polling
"""
from __future__ import annotations

import asyncio
import logging
import os

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage

from bot import config
from bot import handlers_admin, handlers_deposit, handlers_user


def build_bot() -> Bot:
    return Bot(token=config.BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))


def build_dispatcher() -> Dispatcher:
    dp = Dispatcher(storage=MemoryStorage())
    # admin router FIRST so admin states win over the generic user fallback
    dp.include_router(handlers_admin.router)
    dp.include_router(handlers_deposit.router)
    dp.include_router(handlers_user.router)
    return dp


def webhook_url() -> str:
    """Explicit WEBHOOK_URL wins; else Render's own external URL."""
    explicit = os.getenv("WEBHOOK_URL", "").strip()
    if explicit:
        return explicit.rstrip("/") + "/webhook"
    ext = os.getenv("RENDER_EXTERNAL_URL", "").strip()
    if ext and os.getenv("PORT", "").strip():
        return ext.rstrip("/") + "/webhook"
    return ""


async def run_webhook(bot: Bot, dp: Dispatcher, url: str, port: int) -> None:
    from aiohttp import web
    from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application

    app = web.Application()

    async def health(_req: web.Request) -> web.Response:
        return web.Response(text="Bot is running")

    app.router.add_get("/", health)

    await bot.set_webhook(url, drop_pending_updates=True,
                          allowed_updates=["message", "callback_query"])
    logging.info("webhook set: %s", url)
    SimpleRequestHandler(dispatcher=dp, bot=bot).register(app, path="/webhook")
    setup_application(app, dp, bot=bot)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host="0.0.0.0", port=port)
    await site.start()
    logging.info("HTTP server listening on 0.0.0.0:%s (health: /)", port)
    await asyncio.Event().wait()   # run forever


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    if not config.BOT_TOKEN:
        raise SystemExit("BOT_TOKEN env var is not set! (get one from @BotFather)")

    bot = build_bot()
    dp = build_dispatcher()

    if config.ADMIN_IDS:
        logging.info("admins: %s", sorted(config.ADMIN_IDS))

    url, port = webhook_url(), int(os.getenv("PORT", "0") or 0)
    if url and port:
        await run_webhook(bot, dp, url, port)
    else:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot, allowed_updates=["message", "callback_query"])


if __name__ == "__main__":
    asyncio.run(main())
