from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx
import firebase_admin
from firebase_admin import credentials, db

from .config import get_settings

_initialized = False


def init_firebase() -> None:
    global _initialized
    if _initialized:
        return
    settings = get_settings()
    if not settings.resolved_db_url:
        raise RuntimeError("Firebase config missing: set FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_DB_URL)")
    cred_info = settings.service_account_info
    if cred_info:
        cred = credentials.Certificate(cred_info)
        try:
            firebase_admin.initialize_app(cred, {"databaseURL": settings.resolved_db_url})
        except ValueError:
            pass
        _initialized = True


def is_admin_mode() -> bool:
    settings = get_settings()
    return bool(settings.service_account_info) and _initialized


async def _rest(method: str, path: str, payload: Any = None) -> Any:
    settings = get_settings()
    if not settings.resolved_db_url:
        raise RuntimeError("Firebase config missing")
    url = f"{settings.resolved_db_url}{path}.json"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.request(method.upper(), url, json=payload)
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logging.warning("Firebase REST %s %s failed: %s", method, path, exc)
        return None


async def read_data(path: str) -> Any:
    if is_admin_mode():
        return await asyncio.to_thread(lambda: db.reference(path).get())
    return await _rest("GET", path)


async def write_data(path: str, value: Any) -> Any:
    if is_admin_mode():
        await asyncio.to_thread(lambda: db.reference(path).set(value))
        return value
    return await _rest("PUT", path, value)


async def update_data(path: str, value: dict) -> Any:
    if is_admin_mode():
        await asyncio.to_thread(lambda: db.reference(path).update(value))
        return value
    return await _rest("PATCH", path, value)


async def delete_data(path: str) -> None:
    if is_admin_mode():
        await asyncio.to_thread(lambda: db.reference(path).delete())
        return
    await _rest("DELETE", path)


async def push_data(path: str, value: Any) -> str | None:
    if is_admin_mode():
        result = await asyncio.to_thread(lambda: db.reference(path).push(value))
        return result.key
    result = await _rest("POST", path, value)
    if isinstance(result, dict) and result.get("name"):
        return str(result["name"])
    return None
