import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const ENV = import.meta.env
const CACHE_KEY = 'vz_firebase_cfg_v2'

function normalizeKeys(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    out[String(k).replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v
  }
  return out
}

function isValid(cfg) {
  return cfg && (cfg.databaseURL || cfg.projectId || cfg.apiKey)
}

function fromLocalEnv() {
  if (ENV.VITE_FIREBASE_CONFIG) {
    try {
      const parsed = normalizeKeys(JSON.parse(ENV.VITE_FIREBASE_CONFIG))
      if (isValid(parsed)) return parsed
    } catch (e) {
      console.error('VITE_FIREBASE_CONFIG is not valid JSON', e)
    }
  }
  const cfg = {
    apiKey: ENV.VITE_FIREBASE_API_KEY,
    authDomain: ENV.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: ENV.VITE_FIREBASE_DB_URL,
    projectId: ENV.VITE_FIREBASE_PROJECT_ID,
    storageBucket: ENV.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: ENV.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: ENV.VITE_FIREBASE_APP_ID
  }
  Object.keys(cfg).forEach(k => cfg[k] === undefined && delete cfg[k])
  return isValid(cfg) ? cfg : null
}

function fromCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = normalizeKeys(JSON.parse(raw))
    return isValid(parsed) ? parsed : null
  } catch (e) {
    return null
  }
}

async function fromBackend() {
  const base = (ENV.VITE_BACKEND_URL || '').replace(/\/+$/, '')
  if (!base) return null
  try {
    const res = await fetch(`${base}/firebase-config`)
    if (!res.ok) return null
    const data = await res.json()
    const cfg = normalizeKeys(data?.config || data || {})
    if (!isValid(cfg)) return null
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cfg))
    } catch (e) {
      console.warn('Could not cache Firebase config', e)
    }
    return cfg
  } catch (e) {
    console.warn('Could not fetch Firebase config from backend', e)
    return null
  }
}

let dbInstance = null
let readyPromise = null

async function initializeFirebase() {
  const cfg = fromLocalEnv() || fromCache() || (await fromBackend())
  if (!cfg) {
    console.warn('Firebase config unavailable! Set VITE_BACKEND_URL (backend must expose /firebase-config) or VITE_FIREBASE_* env.')
    return null
  }
  const app = initializeApp(cfg)
  dbInstance = getDatabase(app)
  return dbInstance
}

export function firebaseReady() {
  if (!readyPromise) readyPromise = initializeFirebase()
  return readyPromise
}

export async function getDb() {
  await firebaseReady()
  return dbInstance
}
