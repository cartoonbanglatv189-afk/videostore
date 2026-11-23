# Viral Zone

Viral Zone হলো একটি Telegram WebApp + Admin Panel ভিত্তিক ভিডিও/লিংক প্ল্যাটফর্ম।
পুরনো single-file HTML প্রজেক্টটি এখন **React (frontend)** + **Python FastAPI (backend)** + **Firebase Realtime Database** দিয়ে পুনর্নির্মিত — **কোনো ফিউচার বাদ যায়নি।**

## ফিউচার লিস্ট (সম্পূর্ণ)

### User App (Telegram WebApp)
- হোম সেকশন: ভিডিও কার্ড, লাইভ সিঙ্ক (Firebase realtime)
- সার্চ + ক্যাটাগরি ফিল্টার (badge সহ count)
- লাইক / Unlike (localStorage, "পছন্দের ভিডিও" সেকশন)
- UNLOCK ফ্লো: Adsgram + Monetag মিক্সড অ্যাড সিকোয়েন্স (৩টি অ্যাড) → ৫ সেকেন্ড countdown → প্রগ্রেস বাড়ে → টার্গেট পূর্ণ হলে DOWNLOAD বাটন চালু
- ডেইলি অ্যাড লিমিট (settings থেকে)
- ভিউ কাউন্ট (unlock সম্পূর্ণ হলে Firebase transaction দিয়ে বাড়ে, lifetime ১ view/user)
- শেয়ার লিংক কপি (Bot link থাকলে `?startapp=<videoId>_<userId>`, নাহলে web link)
- Deep link: `start_param` বা `?file=<videoId>` দিয়ে সরাসরি ভিডিও খোলা
- সিঙ্গেল ভিডিও ভিউ (URL pushState সহ), "ফিরে যান" বাটন
- টিউটোরিয়াল সেকশন (YouTube/iframe embed + ৩-step গাইড)
- প্রয়োজনীয় লিংক সেকশন
- Monetag SDK auto-inject (settings এ `monetag_id` থাকলে)
- Banner ads (প্রতি ২টি কার্ডের পরে র‍্যান্ডম ব্যানার)
- Loading overlay, Toast, Bottom Navigation
- Telegram WebApp SDK (`tg.expand()`, `initDataUnsafe`, fallback random user id)

### Admin Panel (Super Admin Control)
- ভিডিও আপলোড: নাম, ছবি URL, ডাউনলোড লিংক, ক্যাটাগরি, Ads Count, লিস্ট + ডিলিট
- অ্যাড সেটআপ:
  - Monetag Zone ID (save/update)
  - Adsgram Interstitial Block ID লিস্ট (add/delete)
  - Banner Ads HTML লিস্ট (add/delete)
- ক্যাটাগরি (filters): id + name add/delete
- মেনু লিংক: title + URL add/delete
- সেটিংস: Telegram bot app link, Tutorial ID, Daily Limit save/load

### Backend (Python FastAPI)
- Firebase Realtime Database REST/admin proxy — সব read/write API
- `x-admin-key` দিয়ে admin endpoints protected
- Ads/Video stats সামনে-রাখা হয় না; frontend Firebase client দিয়ে লাইভ লিসেন করে (আগের মতো real-time behavior 100% রাখা হয়েছে), আর admin panel writes backend API দিয়ে করে (কিন্তু backend বন্ধ থাকলে fallback direct Firebase write করে — কোনো ফিউচার বন্ধ হয় না)


## Payment & Package System (নতুন)

### User side
- প্রতি ভিডিওর UNLOCK বাটনের নিচে **"⚡ অ্যাড ছাড়া কিনে নিন"** বাটন
- Bottom Navigation-এ **👑 প্রিমিয়াম** পেজ: সব প্যাকেজ, ভিডিও ক্রেডিট, মেম্বারশিপ স্ট্যাটাস
- পেমেন্ট মেথড: **Binance Pay (USDT, অটো ভেরিফাই)** + **bKash/ম্যানুয়াল (অ্যাডমিন ভেরিফাই)**
- ক্রেডিট থাকলে UNLOCK বাটন স্বয়ংক্রিয়ভাবে ক্রেডিট খরচ করে আনলক করে
- কেনা ভিডিও/মেম্বারশিপ থাকলে UNLOCK বাটন সরাসরি DOWNLOAD হয়ে যায় (অ্যাড লাগে না)

### Admin Panel নতুন ২টি সেকশন
- **📦 প্যাকেজ:** যত খুশি প্যাকেজ (নাম, বিবরণ, Binance দাম USDT, bKash দাম ৳, ভিডিও সংখ্যা, দিনের মেম্বারশিপ, benefits লিস্ট, show/hide)
- **💳 পেমেন্ট:** Binance API Key/Secret, bKash নম্বর + নির্দেশনা, ডিফল্ট ভিডিওর দাম, মেথড on/off, সব পেমেন্ট রিকুয়েস্ট + pending approve/reject

### Binance Pay অটো ভেরিফাই কীভাবে কাজ করে
1. অ্যাডমিন প্যানেলে Binance Pay Merchant API Key + Secret সেভ করুন (Binance Merchant Portal থেকে)
2. ইউজার "Binance Pay" চাপলে backend Binance Pay v3 order API দিয়ে checkout link বানায়
3. পেমেন্ট হলে frontend প্রতি ৪ সেকেন্ডে backend দিয়ে order status query করে
4. `PAID` পেলে `purchases` approved হয় + `user_entitlements` আপডেট হয় → ইউজার অটো আনলক

### Firebase নতুন nodes
| Node | বিবরণ |
|---|---|
| `packages/{key}` | প্যাকেজ (name, description, price, bkash_price, video_count, duration_days, benefits, active) |
| `purchases/{key}` | পেমেন্ট রেকর্ড (user_id, amount, method, status, transaction_ref, checkout_url...) |
| `user_entitlements/{user_id}` | video_unlock_credits, membership_until, videos_unlocked |
| `payments_config` | binance_api_key/secret, manual_phone, manual_instructions, video_price, টগল |

> নোট: Binance Pay অটো ভেরিফাই backend চালু থাকতে হবে (API secret server-side রাখা হয় — নিরাপদ)। bKash ম্যানুয়াল মেথড backend ছাড়াও কাজ করে।

## Project Structure

```
viralzone/
├── backend/                 # Python FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── firebase_client.py
│   │   ├── security.py
│   │   ├── services/
│   │   │   ├── binance.py
│   │   │   └── entitlements.py
│   │   └── routers/
│   │       ├── packages.py
│   │       ├── payments.py
│   │       ├── videos.py
│   │       ├── filters.py
│   │       ├── links.py
│   │       ├── ads.py
│   │       └── settings.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/                # React + Vite
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── styles.css
        ├── firebase.js      # Firebase client config (env based)
        ├── api.js           # Backend REST client (fallback direct FB write)
        ├── context/
        │   └── ToastContext.jsx
        ├── hooks/
        │   └── useFirebase.js
        ├── components/
        │   ├── LoadingOverlay.jsx
        │   ├── Toast.jsx
        │   ├── BottomNav.jsx
        │   ├── VideoCard.jsx
        │   └── SingleView.jsx
        ├── pages/
        │   ├── UserApp.jsx
        │   └── sections/
        │       ├── PremiumSection.jsx
        │       ├── HomeSection.jsx
        │       ├── LikedSection.jsx
        │       ├── TutorialSection.jsx
        │       └── LinksSection.jsx
        └── utils/
            └── localStorage.js
        └── admin/
            ├── AdminPanel.jsx
            └── sections/
                ├── VideoSection.jsx
                ├── AdsSection.jsx
                ├── CategorySection.jsx
                ├── LinksAdminSection.jsx
                └── SettingsSection.jsx
```

## Setup

### 1) Firebase
1. Firebase Console এ গিয়ে Realtime Database তৈরি করুন (test mode বা rules অনুযায়ী)।
2. Project settings → Web app যোগ করে config পান।
3. Service Account JSON (backend এর জন্য) নামান।

### 2) Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env এ আপনার মান বসান
uvicorn app.main:app --reload --port 8000
```

`.env` (বা Render Environment Variables):
```
FIREBASE_SERVICE_ACCOUNT_JSON={"type": "service_account", "project_id": "...", ...}   #পুরো JSON এক লাইনে
ADMIN_KEY=super-secret-admin-key
CORS_ORIGINS=http://localhost:5173
# (সুপারিশকৃত) Console → Web app → Config এর পুরো JSON:
# FIREBASE_WEB_CONFIG={"apiKey":"...","authDomain":"...","databaseURL":"...","projectId":"...","appId":"..."}
```

### 3) Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

`.env` (Firebase config লাগবে না — backend থেকে অটো আসে):
```
VITE_BACKEND_URL=http://localhost:8000
VITE_ADMIN_KEY=super-secret-admin-key
```

> Frontend চালু হতে backend এর `GET /firebase-config` থেকে Firebase config fetch করে (localStorage এ cache হয়)। চাইলে `VITE_FIREBASE_CONFIG` fallback হিসেবে দেওয়া যায়।

> `VITE_BACKEND_URL` খালি থাকলে admin panel সরাসরি Firebase এ write করবে (আগের behavior), তাই কোনো ফিউচার ভাঙবে না।

## Deployment টিপস
- **Vercel (frontend)** — মাত্র ২টা env: `VITE_BACKEND_URL`, `VITE_ADMIN_KEY` (Firebase কিছুই লাগবে না)
- **Render (backend)** — env: `FIREBASE_SERVICE_ACCOUNT_JSON`, `ADMIN_KEY`, (সুপারিশকৃত) `FIREBASE_WEB_CONFIG`, (ঐচ্ছিক) `CORS_ORIGINS`
- Telegram Bot: BotFather এ `/newapp` বা Menu button এ frontend URL দিন।
