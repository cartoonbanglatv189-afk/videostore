import os

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()
ADMIN_IDS = {
    int(x)
    for x in os.getenv("ADMIN_IDS", "").replace(" ", "").split(",")
    if x.strip().lstrip("-").isdigit()
}
ADMIN_CONTACT = os.getenv("ADMIN_CONTACT", "").strip()  # e.g. @admin_username

# Same Firebase Realtime Database as the old project (data persists there).
DB_URL = os.getenv(
    "FIREBASE_DB_URL",
    "https://video-store-147cb-default-rtdb.asia-southeast1.firebasedatabase.app",
).rstrip("/")

# All bot data lives under this namespace so it never clashes with old nodes.
BASE = "vzbot"
