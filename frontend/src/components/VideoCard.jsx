import { useEffect, useState } from 'react'
import { getLiked, getProgress } from '../utils/localStorage'

const PLACEHOLDER =
  'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="225"%3E%3Crect width="400" height="225" fill="%23232336"/%3E%3C/svg%3E'

export default function VideoCard({ video, onUnlock, onLike, onShare, onOpen, onBuy, entitled = false, priceLabel = '', inSingleView = false }) {
  const [liked, setLiked] = useState(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const update = () => {
      setLiked(getLiked().includes(video.id))
      setProgress(getProgress(video.id))
    }
    update()
    window.addEventListener('viralzone-refresh', update)
    return () => window.removeEventListener('viralzone-refresh', update)
  }, [video.id])

  const req = video.ad_watches_required || 1
  const isUnlocked = progress >= req || entitled
  const views = video.view_count || 0
  const isNew = video.created_at && Date.now() - Number(video.created_at) < 86400000

  return (
    <div
      className="card"
      onClick={() => {
        if (!inSingleView && onOpen) onOpen(video.id)
      }}
      style={{ cursor: !inSingleView && onOpen ? 'pointer' : 'default' }}
    >
      <div className="media">
        <img
          src={video.image_url || PLACEHOLDER}
          onError={e => {
            e.currentTarget.src = PLACEHOLDER
          }}
          alt={video.name}
        />
        {priceLabel && (
          <div className="price-pill">
            <i className="fas fa-bolt" aria-hidden="true" /> {priceLabel}
          </div>
        )}
        <button
          className="heart-btn"
          onClick={e => {
            e.stopPropagation()
            onLike && onLike(video.id)
          }}
        >
          <i className={`${liked ? 'fas' : 'far'} fa-heart`} style={{ color: liked ? 'var(--primary)' : 'white' }} />
        </button>
        {isNew && (
          <span className="new-badge">
            <i className="fas fa-fire" /> NEW
          </span>
        )}
      </div>
      <div className="meta">
        <div className="meta-header">
          <h3>{video.name}</h3>
          <div className="view-count-badge">
            <i className="fas fa-eye" /> {views}
          </div>
        </div>
        <div className="actions">
          <button
            className={`unlock-btn ${isUnlocked ? 'done' : ''}`}
            onClick={e => {
              e.stopPropagation()
              onUnlock && onUnlock(video)
            }}
          >
            {isUnlocked ? (
              <>
                <i className="fas fa-download" aria-hidden="true" /> Download
              </>
            ) : (
              <>
                <i className="fas fa-play" aria-hidden="true" /> Unlock ({progress}/{req})
              </>
            )}
          </button>
          <button
            className="link-btn"
            onClick={e => {
              e.stopPropagation()
              onShare && onShare(video.id)
            }}
          >
            <i className="fas fa-link" />
          </button>
        </div>
        {!isUnlocked && onBuy && (
          <button
            className="buy-btn"
            onClick={e => {
              e.stopPropagation()
              if (!inSingleView && onOpen) onOpen(video.id)
              else if (onBuy) onBuy(video)
            }}
          >
            <i className="fas fa-bolt" /> Unlock without Ads {priceLabel ? `— ${priceLabel}` : ''}
          </button>
        )}
      </div>
    </div>
  )
}
