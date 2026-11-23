import { useEffect, useState } from 'react'
import VideoCard from './VideoCard'
import { hasCredits, membershipActive, videoPurchased } from '../utils/entitlements'
import { useFirebaseList } from '../hooks/useFirebase'
import { api } from '../api'

export default function SingleView({ video, onClose, onUnlock, onLike, onShare, onBuy, entitlements = null, priceLabel = '', userId }) {
  const [active, setActive] = useState(false)
  const ratings = useFirebaseList(video ? `ratings/${video.id}` : '__none__')
  const [myStars, setMyStars] = useState(0)

  useEffect(() => {
    if (video) {
      setActive(true)
      const newUrl = window.location.pathname + '?file=' + video.id
      window.history.pushState({ path: newUrl }, '', newUrl)
    } else {
      setActive(false)
      window.history.pushState({}, '', window.location.pathname)
    }
  }, [video])

  if (!video) return null

  const avgStars = ratings.length ? (ratings.reduce((a, r) => a + (r.stars || 0), 0) / ratings.length).toFixed(1) : null
  const req = video.ad_watches_required || 1
  const purchased = videoPurchased(entitlements, video.id)
  const member = membershipActive(entitlements)
  const credits = hasCredits(entitlements)

  return (
    <div className={`single-view fadeIn ${active ? 'active' : ''}`}>
      <button className="back-btn" onClick={onClose}>
        <i className="fas fa-arrow-left" /> ফিরে যান
      </button>
      <VideoCard
        video={video}
        onUnlock={onUnlock}
        onLike={onLike}
        onShare={onShare}
        onBuy={onBuy}
        entitled={entitled}
        priceLabel={priceLabel}
        inSingleView
      />

      <div className="rating-box">
        <span className="rating-title">⭐ রেটিং {avgStars ? `— ${avgStars} (${ratings.length})` : ''}</span>
        <div className="rating-stars">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              className="star-btn"
              onClick={async () => {
                setMyStars(star)
                try {
                  await api.rateVideo(video.id, {
                    user_id: userId,
                    stars: star,
                    first_name: window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name || ''
                  })
                } catch (e) {
                  console.error('rate failed', e)
                }
              }}
            >
              <i className={`fa-star ${(myStars || 0) >= star ? 'fas active' : 'far'}`} />
            </button>
          ))}
        </div>
      </div>

      <div className="pay-guide">
        <div className="pay-guide-title">🔒 এই ভিডিও দেখার আগে আনলক করতে হবে</div>
        {member && <div className="pay-guide-line ok">✅ আপনি নিয়মিত প্রিমিয়াম মেম্বার — সব ভিডিও আনলকড, সরাসরি Download চাপুন</div>}
        {!member && purchased && <div className="pay-guide-line ok">✅ এই ভিডিওটি আপনি কিনে রেখেছেন — Download বাটন সক্রিয়</div>}
        {!member && !purchased && credits > 0 && (
          <div className="pay-guide-line ok">🎁 আপনার {credits} টি ভিডিও ক্রেডিট আছে — UNLOCK চাপলে ১টি ক্রেডিট কাটবে, এড দেখা লাগবে না</div>
        )}
        {!member && !purchased && credits <= 0 && (
          <>
            <div className="pay-guide-line">1️⃣ <b>বিনামূল্যে:</b> UNLOCK ({req}/{req}) বাটনে চাপ দিয়ে অ্যাড দেখুন — প্রতি অ্যাডের পরে প্রগতি বাড়বে, {req} বার হলেই Download সক্রিয়। ভিডিওর প্রগতি সংরক্ষিত থাকবে।</div>
            <div className="pay-guide-line">2️⃣ <b>দ্রুত &amp; অ্যাড ছাড়া:</b> উপরের ⚡ "অ্যাড ছাড়া আনলক করুন{priceLabel ? ` — ${priceLabel}` : ''}" বাটনে চাপ দিন → Binance Pay দিয়ে পেমেন্ট করলে <b>অটো ভেরিফাই</b> হয়ে আনলক হবে, আর bKash করলে অ্যাডমিন ভেরিফাই করবে।</div>
            <div className="pay-guide-line">👑 চাইলে <b>প্রিমিয়াম প্যাকেজ</b> নিন — সব ভিডিও + নতুন সব ভিডিওতে মেম্বার সুবিধা (নিচের 👑 প্রিমিয়াম tab)।</div>
          </>
        )}
      </div>
    </div>
  )
}
