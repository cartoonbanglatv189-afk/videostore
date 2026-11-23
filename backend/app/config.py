import json
import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


def _env_list(name: str, default: str = "") -> list[str]:
    raw = os.getenv(name, default)
    return [x.strip() for x in raw.split(",") if x.strip()]


@lru_cache
def get_settings() -> "Settings":
    return Settings()


class Settings:
    firebase_db_url: str = os.getenv("FIREBASE_DB_URL", "").rstrip("/")
    firebase_service_account_path: str = os.getenv("FIREBASE_SERVICE_ACCOUNT", "")
    firebase_service_account_json: str = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")
    admin_key: str = os.getenv("ADMIN_KEY", "")
    cors_origins: list[str] = _env_list("CORS_ORIGINS", "*")

    @property
    def service_account_info(self) -> dict | None:
        if self.firebase_service_account_json:
            return json.loads(self.firebase_service_account_json)
        if self.firebase_service_account_path and os.path.isfile(self.firebase_service_account_path):
            with open(self.firebase_service_account_path, "r") as f:
                return json.load(f)
        return None
