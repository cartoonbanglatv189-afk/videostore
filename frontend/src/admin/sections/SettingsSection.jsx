import { useEffect, useState } from 'react'
import { ref, update } from 'firebase/database'
import { getDb } from '../../firebase'
import { useFirebaseObject } from '../../hooks/useFirebase'
import { api, isBackendEnabled } from '../../api'
import { useToast } from '../../context/ToastContext'

export default function SettingsSection() {
  const { showToast } = useToast()
  const settings = useFirebaseObject('settings') || {}
  const refCfg = useFirebaseObject('referral_config') || {}

  const [sBot, setSBot] = useState('')
  const [sTut, setSTut] = useState('')
  const [sLimit, setSLimit] = useState('')
  const [sChannel, setSChannel] = useState('')
  const [rEnabled, setREnabled] = useState(true)
  const [rJoin, setRJoin] = useState('')
  const [rPurchase, setRPurchase] = useState('')
  const [rMode, setRMode] = useState('first')

  useEffect(() => {
    if (settings) {
      setSTut(settings.tutorial_id || '')
      setSLimit(settings.ads_limit || 20)
      setSBot(settings.bot_app_link || '')
      setSChannel(settings.telegram_channel || '')
      setREnabled(refCfg.enabled !== false)
      setRJoin(refCfg.bonus_join ?? '')
      setRPurchase(refCfg.bonus_purchase ?? '')
      setRMode(refCfg.purchase_mode || 'first')
    }
  }, [settings, refCfg])

  const saveSettings = async () => {
    const payload = {
      tutorial_id: sTut,
      ads_limit: parseInt(sLimit) || 20,
      bot_app_link: sBot,
      telegram_channel: sChannel
    }
    if (isBackendEnabled()) {
      try {
        await api.saveSettings(payload)
        showToast('Settings Saved')
        return
      } catch (e) {
        console.error('Backend save failed, falling back', e)
      }
    }
    const db = await getDb()
    if (db) await update(ref(db, 'settings'), payload)
    showToast('Settings Saved')
  }

  const saveReferral = async () => {
    const payload = {
      enabled: rEnabled,
      bonus_join: parseFloat(rJoin) || 0,
      bonus_purchase: parseFloat(rPurchase) || 0,
      purchase_mode: rMode
    }
    let saved = false
    if (isBackendEnabled()) {
      try {
        await api.saveReferralConfig(payload)
        saved = true
      } catch (e) {
        console.error('Backend save failed, falling back', e)
      }
    }
    if (!saved) {
      const db = await getDb()
      if (!db) {
        showToast('⚠️ সেভ করা যায়নি — ব্যাকএন্ড/ডেটাবেজ নেই')
        return
      }
      await update(ref(db, 'referral_config'), payload)
    }
    showToast('✅ Referral Settings Saved!')
  }

  return (
    <>
      <label className="help-text">Telegram Bot App Link (Direct Link)</label>
      <input type="text" value={sBot} onChange={e => setSBot(e.target.value)} placeholder="https://t.me/your_bot/app" />
      <label className="help-text">টেলিগ্রাম চ্যানেল (join-বাধ্যতামূলক — খালি থাকলে বন্ধ)</label>
      <input type="text" value={sChannel} onChange={e => setSChannel(e.target.value)} placeholder="@your_channel" />
      <label className="help-text">Tutorial ID (Youtube)</label>
      <input type="text" value={sTut} onChange={e => setSTut(e.target.value)} />
      <label className="help-text">Daily Limit</label>
      <input type="number" value={sLimit} onChange={e => setSLimit(e.target.value)} />
      <button className="action-btn" onClick={saveSettings}>
        Save
      </button>

      <div className="gw-sub">
        <div style={{ fontSize: 15, fontWeight: 700, color: '#60a5fa', marginBottom: 8 }}>
          🎁 রেফার সিস্টেম (বন্ধু আনলে ইনকাম)
        </div>
        <label className="help-text">রেফার সিস্টেম চালু করবেন?</label>
        <select
          value={rEnabled ? 'on' : 'off'}
          onChange={e => setREnabled(e.target.value === 'on')}
          className="modal-input"
          style={{ width: '100%' }}
        >
          <option value="on">✅ চালু</option>
          <option value="off">⛔ বন্ধ</option>
        </select>
        <label className="help-text">রেফার করা বন্ধু জয়েন করলে রেফারকারী যে টাকা পাবে (USDT)</label>
        <input type="number" step="0.01" min="0" value={rJoin} onChange={e => setRJoin(e.target.value)} placeholder="যেমন: 0.10" />
        <label className="help-text">রেফার করা বন্ধু পেমেন্ট করলে রেফারকারী যে টাকা পাবে (USDT)</label>
        <input type="number" step="0.01" min="0" value={rPurchase} onChange={e => setRPurchase(e.target.value)} placeholder="যেমন: 0.50" />
        <label className="help-text">কেনাকাটার বোনাস কতবার দিবেন?</label>
        <select value={rMode} onChange={e => setRMode(e.target.value)} className="modal-input" style={{ width: '100%' }}>
          <option value="first">প্রথম কেনাকাটায় একবার</option>
          <option value="every">প্রতি কেনাকাটাতেই</option>
        </select>
        <label className="help-text">
          রেফার লিংক তৈরি হবে উপরের <b>Telegram Bot App Link</b> দিয়ে — ইউজার প্রোফাইল থেকে লিংক Copy করে শেয়ার করবে। অ্যাডমিন টন. Bot App Link খালি রাখলে Web App লিংক ব্যবহার হবে।
        </label>
        <button className="action-btn" onClick={saveReferral}>
          🎁 Referral Save
        </button>
      </div>
    </>
  )
}
