import { useEffect, useState } from 'react'
import { useFirebaseList, useFirebaseObject } from '../../hooks/useFirebase'
import { api, isBackendEnabled } from '../../api'
import { confirmDelete, writeWithFallback } from './shared'
import { useToast } from '../../context/ToastContext'

export default function DashboardSection() {
  const { showToast } = useToast()
  const [stats, setStats] = useState(null)
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')

  const videos = useFirebaseList('videos')
  const notices = useFirebaseList('notices')
  const commentsRoot = useFirebaseObject('comments') || {}
  const purchases = useFirebaseObject('purchases') || {}

  useEffect(() => {
    api
      .getStats()
      .then(setStats)
      .catch(e => console.error('stats failed', e))
  }, [])

  const topVideos = [...videos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 5)

  const allComments = Object.entries(commentsRoot).flatMap(([vk, list]) =>
    Object.entries(list || {}).map(([ck, c]) => ({ ...c, _ck: ck, _vk: vk }))
  ).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 20)

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

  const postNotice = () => {
    if (!notice.trim()) return
    writeWithFallback('notices', { text: notice.trim(), active: true, ts: Date.now() })
    setNotice('')
    showToast('নোটিশ পোস্ট হয়েছে!')
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

      <label className="help-text">🏆 লিডারবোর্ড — সবচেয়ে দেখা ভিডিও (Top 5)</label>
      {topVideos.map((v, i) => (
        <div key={v._fbKey} className="list-item">
          <span style={{ width: 26, fontWeight: 800, color: i === 0 ? '#f59e0b' : i === 1 ? '#ccc' : '#cd7f32' }}>
            #{i + 1}
          </span>
          <div style={{ flex: 1 }}>
            <span>{v.name}</span>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>👁️ {v.view_count || 0} দেখা</div>
          </div>
        </div>
      ))}

      <label className="help-text">💬 সর্বশেষ কমেন্ট (moderation — X চাপলে ডিলিট)</label>
      {allComments.map(c => (
        <div key={c._vk + '_' + c._ck} className="list-item">
          <div style={{ flex: 1 }}>
            <b style={{ fontSize: 12 }}>{c.name || 'user'}:</b> {c.text}
          </div>
          <button className="del-btn" onClick={() => confirmDelete(`comments/${c._vk}`, null, c._ck)}>
            X
          </button>
        </div>
      ))}
      {allComments.length === 0 && <p className="help-text">এখনো কোনো কমেন্ট নেই</p>}

      <label className="help-text">🔔 সাইটের ভেতরে নোটিশ (banner — সব user দেখবে)</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={notice}
          onChange={e => setNotice(e.target.value)}
          placeholder="যেমন: আজ রাত ৯টায় নতুন ভিডিও! 🔥"
          style={{ flex: 1 }}
        />
        <button className="action-btn" style={{ width: 'auto', padding: '0 16px' }} onClick={postNotice}>
          পোস্ট
        </button>
      </div>
      {notices.map(n => (
        <div key={n._fbKey} className="list-item">
          <div style={{ flex: 1, fontSize: 12 }}>📌 {n.text}</div>
          <button className="del-btn" onClick={() => confirmDelete('notices', null, n._fbKey)}>
            X
          </button>
        </div>
      ))}

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
