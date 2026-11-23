import { useEffect, useState } from 'react'
import { ref, update } from 'firebase/database'
import { getDb } from '../../firebase'
import { useFirebaseObject } from '../../hooks/useFirebase'
import { api } from '../../api'
import { useToast } from '../../context/ToastContext'

export default function SettingsSection() {
  const { showToast } = useToast()
  const settings = useFirebaseObject('settings') || {}

  const [sBot, setSBot] = useState('')
  const [sTut, setSTut] = useState('')
  const [sLimit, setSLimit] = useState('')

  useEffect(() => {
    if (settings) {
      setSTut(settings.tutorial_id || '')
      setSLimit(settings.ads_limit || 20)
      setSBot(settings.bot_app_link || '')
    }
  }, [settings])

  const saveSettings = async () => {
    const payload = {
      tutorial_id: sTut,
      ads_limit: parseInt(sLimit) || 20,
      bot_app_link: sBot
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

  return (
    <>
      <label className="help-text">Telegram Bot App Link (Direct Link)</label>
      <input type="text" value={sBot} onChange={e => setSBot(e.target.value)} placeholder="https://t.me/your_bot/app" />
      <label className="help-text">Tutorial ID (Youtube)</label>
      <input type="text" value={sTut} onChange={e => setSTut(e.target.value)} />
      <label className="help-text">Daily Limit</label>
      <input type="number" value={sLimit} onChange={e => setSLimit(e.target.value)} />
      <button className="action-btn" onClick={saveSettings}>
        Save
      </button>
    </>
  )
}
