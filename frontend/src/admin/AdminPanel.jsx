import { useState } from 'react'
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
  secVideo: { title: '🎬 ভিডিও আপলোড', icon: 'fa-video', label: 'ভিডিও আপলোড' },
  secAds: { title: '💰 অ্যাড সেটআপ', icon: 'fa-sack-dollar', label: 'অ্যাড সেটআপ' },
  secCat: { title: '🏷️ ক্যাটাগরি', icon: 'fa-tags', label: 'ক্যাটাগরি' },
  secLinks: { title: '🔗 লিংক', icon: 'fa-link', label: 'মেনু লিংক' },
  secSettings: { title: '⚙️ সেটিংস', icon: 'fa-cogs', label: 'সেটিংস' },
  secPkg: { title: '📦 প্যাকেজ', icon: 'fa-box', label: 'প্যাকেজ' },
  secPays: { title: '💳 পেমেন্ট', icon: 'fa-credit-card', label: 'পেমেন্ট' }
}

export default function AdminPanel() {
  const [active, setActive] = useState(null)

  if (!active) {
    return (
      <div className="admin-container">
        <h2>👑 Admin Control</h2>
        <div className="dashboard-grid">
          {Object.entries(SECTIONS).map(([id, s]) => (
            <button key={id} className="dash-btn" onClick={() => setActive(id)}>
              <i className={`fas ${s.icon}`} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const s = SECTIONS[active]

  return (
    <div className="admin-container">
      <div className="header-section fadeIn">
        <div className="header-row">
          <button className="arrow-back-btn" onClick={() => setActive(null)}>
            <i className="fas fa-arrow-left" />
          </button>
          <h3 style={{ margin: 0 }}>{s.title}</h3>
          <div />
        </div>
      </div>
      {active === 'secDash' && <DashboardSection />}
      {active === 'secVideo' && <VideoSection />}
      {active === 'secAds' && <AdsSection />}
      {active === 'secCat' && <CategorySection />}
      {active === 'secLinks' && <LinksAdminSection />}
      {active === 'secSettings' && <SettingsSection />}
      {active === 'secPkg' && <PackageSection />}
      {active === 'secPays' && <PaymentsSection />}
    </div>
  )
}
