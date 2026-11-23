import json
import logging
import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

_detected_db_url = {"url": ""}


def set_detected_db_url(url: str) -> None:
    if url:
        _detected_db_url["url"] = url.rstrip("/")


def _env_list(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [x.strip() for x in raw.split(",") if x.strip()]


@lru_cache
def get_settings() -> "Settings":
    return Settings()


class Settings:
    firebase_db_url: str = os.getenv("FIREBASE_DB_URL", "").rstrip("/")
    firebase_web_config: str = os.getenv("FIREBASE_WEB_CONFIG", "")
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    telegram_auto_notify: str = os.getenv("TELEGRAM_AUTO_NOTIFY", "1")
    firebase_service_account_path: str = os.getenv("FIREBASE_SERVICE_ACCOUNT", "")
    firebase_service_account_json: str = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")
    admin_key: str = os.getenv("ADMIN_KEY", "")
    cors_origins: list[str] = _env_list("CORS_ORIGINS", "*")

    @property
    def service_account_info(self) -> dict | None:
        if self.firebase_service_account_json:
            try:
                return json.loads(self.firebase_service_account_json)
            except json.JSONDecodeError as exc:
                raise RuntimeError(f"FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: {exc}") from exc
        if self.firebase_service_account_path and os.path.isfile(self.firebase_service_account_path):
            with open(self.firebase_service_account_path, "r") as f:
                return json.load(f)
        return None

    @property
    def resolved_db_url(self) -> str:
        if self.firebase_db_url:
            return self.firebase_db_url
        if _detected_db_url["url"]:
            return _detected_db_url["url"]
        info = self.service_account_info
        if info and info.get("project_id"):
            base = f"https://{info['project_id']}-default-rtdb.firebaseio.com"
            region = os.getenv("FIREBASE_DB_REGION", "").strip()
            if region:
                base = f"https://{info['project_id']}-default-rtdb.{region}.firebasedatabase.app"
            return base
        return ""

    @property
    def web_config(self) -> dict:
        if self.firebase_web_config:
            try:
                parsed = json.loads(self.firebase_web_config)
                if isinstance(parsed, dict) and parsed:
                    return parsed
            except json.JSONDecodeError:
                logging.warning("FIREBASE_WEB_CONFIG is not valid JSON, using fallback")
        cfg: dict = {}
        if self.resolved_db_url:
            cfg["databaseURL"] = self.resolved_db_url
        info = self.service_account_info
        if info and info.get("project_id"):
            project_id = info["project_id"]
            cfg["projectId"] = project_id
            cfg.setdefault("authDomain", f"{project_id}.firebaseapp.com")
        return cfg
