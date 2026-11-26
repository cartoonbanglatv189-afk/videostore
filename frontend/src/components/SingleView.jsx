import { useEffect, useState } from 'react'
import VideoCard from './VideoCard'
import { hasCredits, membershipActive, videoPurchased } from '../utils/entitlements'
import { useFirebaseList } from '../hooks/useFirebase'
import { api, isBackendEnabled } from '../api'
import { getDb } from '../firebase'

export default function SingleView({ video, onClose, onUnlock, onLike, onShare, onBuy, entitlements = null, priceLabel = '', userId }) {
  const [active, setActive] = useState(false)
  const ratings = useFirebaseList(video ? `ratings/${video.id}` : '__none__')
  const comments = useFirebaseList(video ? `comments/${video.id}` : '__none__')
  const [myStars, setMyStars] = useState(0)
  const [cText, setCText] = useState('')
  const [sending, setSending] = useState(false)

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
        entitled={member || purchased}
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
        <div className="pay-guide-title">🔒 You need to unlock this video before watching</div>
        {member && <div className="pay-guide-line ok">✅ You are an active Premium member — all videos unlocked, tap Download directly</div>}
        {!member && purchased && <div className="pay-guide-line ok">✅ You already own this video — the Download button is active</div>}
        {!member && !purchased && credits > 0 && (
          <div className="pay-guide-line ok">🎁 You have {credits} video credits — tapping Unlock uses 1 credit, no ads needed</div>
        )}
        {!member && !purchased && credits <= 0 && (
          <>
            <div className="pay-guide-line">1️⃣ <b>For free:</b> Tap the Unlock ({req}/{req}) button and watch ads — progress increases after each ad, and after {req} the Download button activates. Your progress is saved.</div>
            <div className="pay-guide-line">2️⃣ <b>Fast &amp; ad-free:</b> Tap the ⚡ "Unlock without Ads{priceLabel ? ` — ${priceLabel}` : ''}" button above → pay with Binance for <b>automatic verification</b> and instant unlock, or pay with bKash and the admin will verify it.</div>
            <div className="pay-guide-line">👑 Or get a <b>Premium package</b> — access to all videos + member perks on every new video (see the 👑 Premium tab below).</div>
          </>
        )}
      </div>

      <div className="comments-box">
        <div className="comments-title">💬 কমেন্ট ({comments.length})</div>
        <div className="comments-list">
          {[...comments].reverse().map(c => (
            <div key={c._fbKey} className="comment-item">
              <b>{c.name || 'user'}</b>
              <span>{c.text}</span>
            </div>
          ))}
          {comments.length === 0 && <div className="comment-item muted">এখনো কোনো কমেন্ট নেই — প্রথম কমেন্টটি আপনিই দিন!</div>}
        </div>
        <div className="comment-form">
          <input
            type="text"
            value={cText}
            onChange={e => setCText(e.target.value)}
            placeholder="কমেন্ট লিখুন..."
            maxLength={300}
          />
          <button
            disabled={sending || !cText.trim()}
            onClick={async () => {
              const text = cText.trim()
              if (!text) return
              setSending(true)
              const u = window.Telegram?.WebApp?.initDataUnsafe?.user
              const payload = { user_id: userId, text, first_name: u?.first_name || 'user' }
              try {
                if (isBackendEnabled()) {
                  await api.commentVideo(video.id, payload)
                } else {
                  const db = await getDb()
                  if (db) {
                    const { push, ref } = await import('firebase/database')
                    await push(ref(db, `comments/${video.id}`), { ...payload, ts: Date.now() })
                  }
                }
                setCText('')
              } catch (e) {
                console.error('comment failed', e)
              }
              setSending(false)
            }}
          >
            <i className="fas fa-paper-plane" />
          </button>
        </div>
      </div>
    </div>
  )
}
