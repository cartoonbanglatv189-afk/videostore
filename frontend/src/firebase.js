import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const ENV = import.meta.env

function fromSingleJson() {
  const raw = ENV.VITE_FIREBASE_CONFIG
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const camel = {}
    for (const [k, v] of Object.entries(parsed)) {
      camel[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v
    }
    if (camel.databaseURL && (camel.apiKey || camel.projectId)) return camel
  } catch (e) {
    console.error('VITE_FIREBASE_CONFIG is not valid JSON', e)
  }
  return null
}

function fromIndividualVars() {
  const cfg = {
    apiKey: ENV.VITE_FIREBASE_API_KEY,
    authDomain: ENV.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: ENV.VITE_FIREBASE_DB_URL,
    projectId: ENV.VITE_FIREBASE_PROJECT_ID,
    storageBucket: ENV.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: ENV.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: ENV.VITE_FIREBASE_APP_ID
  }
  return cfg.databaseURL || cfg.apiKey ? cfg : null
}

export const firebaseConfig =
  fromSingleJson() ||
  fromIndividualVars() || {}

if (!firebaseConfig.databaseURL) {
  console.warn('Firebase config missing! Set VITE_FIREBASE_CONFIG (single JSON) or individual VITE_FIREBASE_* vars.')
}

const app = initializeApp(firebaseConfig)
export const db = getDatabase(app)
