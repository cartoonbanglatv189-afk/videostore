import { useState } from 'react'
import { api, isBackendEnabled, getAdminKey, setAdminKey } from '../api'
import DashboardSection from './sections/DashboardSection'
import VideoSection from './sections/VideoSection'
import AdsSection from './sections/AdsSection'
import CategorySection from './sections/CategorySection'
import LinksAdminSection from './sections/LinksAdminSection'
import SettingsSection from './sections/SettingsSection'
import PackageSection from './sections/PackageSection'
import PaymentsSection from './sections/PaymentsSection'

const SECTIONS = {
  secDash: { title: '📊 ড্যাশবোর্ড ও নোটিশ', icon: 'fa-chart-line', label: 'ড্যাশবোর্ড' },
  secVideo: { title: '🎬 ভিডিও আপলোড', icon: 'fa-video', label: 'ভিডিও' },
  secPkg: { title: '📦 প্যাকেজ', icon: 'fa-box', label: 'প্যাকেজ' },
  secPays: { title: '💳 পেমেন্ট', icon: 'fa-credit-card', label: 'পেমেন্ট' },
  secAds: { title: '💰 অ্যাড সেটআপ', icon: 'fa-sack-dollar', label: 'অ্যাড' },
  secCat: { title: '🏷️ ক্যাটাগরি', icon: 'fa-tags', label: 'ক্যাটাগরি' },
  secLinks: { title: '🔗 মেনু লিংক', icon: 'fa-link', label: 'লিংক' },
  secSettings: { title: '⚙️ সেটিংস', icon: 'fa-cogs', label: 'সেটিংস' }
}

function AdminLogin({ onLogin }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  const login = async () => {
    if (!key.trim() || checking) return
    setChecking(true)
    setError('')
    const result = await api.verifyKey(key.trim())
    setChecking(false)
    if (result === 'ok') {
      setAdminKey(key.trim())
      onLogin()
      return
    }
    const messages = {
      'wrong-key': 'ভুল পাসওয়ার্ড! Render → Environment → ADMIN_KEY যা দিয়েছেন সেটাই হুবহু লিখুন (কোনো স্পেস/কোটেশন ছাড়া)',
      'admin-key-missing': 'Render-এ ADMIN_KEY env সেট নেই, বা সদ্য সেট করলে এখনো ডেপ্লয় হয়নি',
      'backend-down': 'ব্যাকএন্ড unreachable! Vercel-এর VITE_BACKEND_URL ঠিক আছে কিনা দেখুন',
      'backend-error': 'ব্যাকএন্ড এরর — Render-এর লগ দেখুন'
    }
    setError(messages[result] || (isBackendEnabled() ? 'ভুল পাসওয়ার্ড!' : 'ভুল পাসওয়ার্ড!'))
  }

  return (
    <div className="admin-login">
      <div className="admin-login-card fadeIn">
        <div className="admin-login-icon">👑</div>
        <h2>Viral Zone Admin</h2>
        <p className="admin-login-sub">প্যানেলে ঢুকতে এডমিন পাসওয়ার্ড দিন</p>
        <input
          type="password"
          className="admin-login-input"
          placeholder="Admin Password"
          value={key}
          onChange={e => setKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
          autoFocus
        />
        {error && <div className="admin-login-error">❌ {error}</div>}
        <button className="admin-login-btn" onClick={login} disabled={checking}>
          {checking ? 'Checking...' : '🔓 Login'}
        </button>
        <p className="admin-login-hint">
          পাসওয়ার্ড সেট করা হয় Render → Environment → <b>ADMIN_KEY</b>
        </p>
      </div>
    </div>
  )
}

export default function AdminPanel() {
  const [authed, setAuthed] = useState(() => Boolean(getAdminKey()))
  const [active, setActive] = useState('secDash')

  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />

  const s = SECTIONS[active]

  return (
    <div className="admin-shell">
      <div className="admin-topbar">
        <span className="admin-logo">👑 Viral Zone Admin</span>
        <button
          className="admin-logout-btn"
          onClick={() => {
            setAdminKey('')
            setAuthed(false)
          }}
        >
          <i className="fas fa-sign-out-alt" /> Logout
        </button>
      </div>

      <nav className="admin-menu">
        {Object.entries(SECTIONS).map(([id, item]) => (
          <button
            key={id}
            className={`admin-tab ${active === id ? 'active' : ''}`}
            onClick={() => setActive(id)}
          >
            <i className={`fas ${item.icon}`} /> {item.label}
          </button>
        ))}
      </nav>

      <div className="admin-container fadeIn">
        <h2>{s.title}</h2>
        {active === 'secDash' && <DashboardSection />}
        {active === 'secVideo' && <VideoSection />}
        {active === 'secPkg' && <PackageSection />}
        {active === 'secPays' && <PaymentsSection />}
        {active === 'secAds' && <AdsSection />}
        {active === 'secCat' && <CategorySection />}
        {active === 'secLinks' && <LinksAdminSection />}
        {active === 'secSettings' && <SettingsSection />}
      </div>
    </div>
  )
}
