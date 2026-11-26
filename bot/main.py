"""Viral Zone Video — Telegram package-selling bot (aiogram 3)."""
from __future__ import annotations

import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage

from bot import config
from bot import handlers_admin, handlers_user


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    if not config.BOT_TOKEN:
        raise SystemExit("BOT_TOKEN env var is not set! (get one from @BotFather)")

    bot = Bot(
        token=config.BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=MemoryStorage())

    # admin router FIRST so admin states win over the generic user fallback
    dp.include_router(handlers_admin.router)
    dp.include_router(handlers_user.router)

    if config.ADMIN_IDS:
        logging.info("admins: %s", sorted(config.ADMIN_IDS))

    await bot.delete_webhook(drop_pending_updates=True)
    await dp.start_polling(bot, allowed_updates=["message", "callback_query"])


if __name__ == "__main__":
    asyncio.run(main())
