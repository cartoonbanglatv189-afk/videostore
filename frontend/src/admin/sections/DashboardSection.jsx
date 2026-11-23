import { useEffect, useState } from 'react'
import { api, isBackendEnabled } from '../../api'
import { useToast } from '../../context/ToastContext'

export default function DashboardSection() {
  const { showToast } = useToast()
  const [stats, setStats] = useState(null)
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    api
      .getStats()
      .then(setStats)
      .catch(e => console.error('stats failed', e))
  }, [])

  const send = async () => {
    if (!msg.trim()) return
    setSending(true)
    try {
      const res = await api.sendBroadcast(msg.trim())
      if (res.ok) showToast(`পাঠানো হয়েছে — ${res.sent} জনকে 🎉`)
      else if (res.reason === 'bot-not-configured') showToast('Render-এ TELEGRAM_BOT_TOKEN দিন!')
      else showToast('পাঠানো যায়নি')
    } catch (e) {
      console.error(e)
      showToast('Broadcast failed!')
    }
    setSending(false)
  }

  return (
    <>
      {!isBackendEnabled() && <p className="help-text">⚠️ Backend ছাড়া stats/broadcast কাজ করবে না</p>}
      <div className="stat-grid">
        {[
          ['ব্যবহারকারী', stats?.users, '👤'],
          ['ভিডিও', stats?.videos, '🎬'],
          ['মোট দেখা', stats?.total_views, '👁️'],
          ['প্যাকেজ', stats?.packages, '📦'],
          ['কেনা হয়েছে', stats?.purchases, '💳'],
          ['অপেক্ষমাণ', stats?.pending_purchases, '⏳'],
          ['আয় (USDT)', stats?.revenue, '💰']
        ].map(([label, value, icon]) => (
          <div key={label} className="stat-box">
            <div className="stat-icon">{icon}</div>
            <div className="stat-value">{value ?? '—'}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>
      <div className="stat-note">
        {stats?.bot_connected ? '✅ Telegram bot connected' : '❌ Bot সংযুক্ত না — Render-এ TELEGRAM_BOT_TOKEN দিন'}
      </div>

      <label className="help-text">📢 সব ব্যবহারকারীকে Telegram bot দিয়ে নোটিশ পাঠান</label>
      <textarea
        rows={4}
        value={msg}
        onChange={e => setMsg(e.target.value)}
        placeholder="নোটিশ লিখুন... যেমন: আজ রাত ৯টায় নতুন ভিডিও! 🔥"
      />
      <button className="action-btn" onClick={send} disabled={sending}>
        {sending ? 'পাঠানো হচ্ছে...' : '📢 নোটিশ পাঠান'}
      </button>
      <p className="help-text">ℹ️ নতুন ভিডিও add করলে এই bot নির্দিষ্টভাবে সবাইকে অটো-জানাবে।</p>
    </>
  )
}
