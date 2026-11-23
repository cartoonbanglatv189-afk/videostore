import { useEffect, useState } from 'react'
import { useFirebaseList } from '../../hooks/useFirebase'
import useEntitlements from '../../hooks/useEntitlements'
import { hasCredits, membershipActive } from '../../utils/entitlements'
import PurchaseModal from '../../components/PurchaseModal'
import { useToast } from '../../context/ToastContext'

export default function PremiumSection({ userId }) {
  const { showToast } = useToast()
  const packages = useFirebaseList('packages')
  const entitlements = useEntitlements(userId)
  const [buying, setBuying] = useState(null)
  const [nowTs, setNowTs] = useState(Date.now())

  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  const fmtCountdown = ms => {
    const sec = Math.floor(ms / 1000)
    const d = Math.floor(sec / 86400)
    const h = Math.floor((sec % 86400) / 3600)
    const m = Math.floor((sec % 3600) / 60)
    if (d > 0) return `${d} দিন ${h} ঘণ্টা`
    if (h > 0) return `${h} ঘণ্টা ${m} মিনিট`
    return `${m} মিনিট`
  }

  const active = packages.filter(p => p.active !== false)
  const credits = hasCredits(entitlements)
  const isMember = membershipActive(entitlements)
  const msLeft = entitlements?.membership_until ? Number(entitlements.membership_until) - Date.now() : 0
  const expiringSoon = isMember && msLeft > 0 && msLeft < 3 * 86400000
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86400000))

  return (
    <div className="fadeIn">
      {expiringSoon && (
        <div className="expire-banner">
          ⚠️ মেম্বারশিপ প্রায় শেষ! বাকি {daysLeft} দিন — এখনই নবায়ন করুন 👇
        </div>
      )}
      <h3 style={{ color: '#a855f7', marginLeft: 5 }}>👑 প্রিমিয়াম প্যাকেজ</h3>

      <div className="info-box" style={{ display: 'flex', gap: 15, justifyContent: 'space-around' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#ec4899' }}>{credits}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>ভিডিও ক্রেডিট</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>{isMember ? '✅' : '❌'}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>
            {isMember && entitlements.membership_until
              ? `মেম্বার: ${new Date(Number(entitlements.membership_until)).toLocaleDateString()}`
              : 'মেম্বারশিপ নেই'}
          </div>
        </div>
      </div>

      <div className="cards">
        {active.length === 0 && (
          <p style={{ textAlign: 'center', color: 'gray', padding: 20 }}>এখনো কোনো প্যাকেজ নেই</p>
        )}
        {active.map(pkg => (
          <div key={pkg._fbKey} className="card package-card">
            {(() => {
              const saleActive = pkg.sale_until && nowTs <= Number(pkg.sale_until) && (pkg.sale_price || pkg.sale_bkash_price)
              return saleActive ? (
                <div className="sale-banner">
                  ⚡ ফ্ল্যাশ সেল! ⏳ {fmtCountdown(Number(pkg.sale_until) - nowTs)} বাকি
                </div>
              ) : null
            })()}
            <div className="package-head">
              <span className="package-name">{pkg.name}</span>
              <span className="package-price">
                {(() => {
                  const saleActive = pkg.sale_until && nowTs <= Number(pkg.sale_until) && (pkg.sale_price || pkg.sale_bkash_price)
                  const orig = (
                    <>
                      {pkg.price ? <s style={{ color: '#6b7280', fontSize: 11 }}>{pkg.price} USDT</s> : ''}{' '}
                      {pkg.bkash_price ? <s style={{ color: '#6b7280', fontSize: 11 }}>{pkg.bkash_price}৳</s> : ''}{' '}
                    </>
                  )
                  const sale = (
                    <>
                      {pkg.sale_price ? <b style={{ color: '#10b981' }}>{pkg.sale_price} USDT</b> : ''}{' '}
                      {pkg.sale_bkash_price ? <b style={{ color: '#10b981' }}>{pkg.sale_bkash_price}৳</b> : ''}
                    </>
                  )
                  return saleActive ? (
                    <>{orig}{sale}</>
                  ) : (
                    <>{pkg.price ? `${pkg.price} USDT` : ''} {pkg.bkash_price ? `/ ${pkg.bkash_price}৳` : ''}</>
                  )
                })()}
              </span>
            </div>
            {pkg.description && <p className="package-desc">{pkg.description}</p>}
            {(pkg.duration_days > 0 || pkg.video_count > 0) && (
              <div className="package-badges">
                {pkg.duration_days > 0 && <span className="pkg-badge">⏳ {pkg.duration_days} দিন</span>}
                {pkg.video_count > 0 ? (
                  <span className="pkg-badge">🎬 {pkg.video_count === 999999 ? 'আনলিমিটেড ভিডিও' : `${pkg.video_count} ভিডিও`}</span>
                ) : (
                  <span className="pkg-badge">🎬 আনলিমিটেড ভিডিও</span>
                )}
              </div>
            )}
            {(pkg.benefits || []).length > 0 && (
              <ul className="benefit-list">
                {pkg.benefits.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
            <button className="unlock-btn" style={{ width: '100%' }} onClick={() => setBuying({ mode: 'package', pkg })}>
              <i className="fas fa-crown" /> কিনুন
            </button>
          </div>
        ))}
      </div>

      <PurchaseModal
        mode={buying?.mode}
        target={buying?.pkg}
        userId={userId}
        onClose={() => setBuying(null)}
        onSuccess={() => showToast('প্যাকেজ চালু হয়েছে!')}
      />
    </div>
  )
}
