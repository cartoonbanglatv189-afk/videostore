import { useEffect, useState } from 'react'
import VideoCard from '../../components/VideoCard'
import { isVideoEntitled } from '../../utils/entitlements'

function getLikedIds() {
  try {
    return JSON.parse(localStorage.getItem('likes') || '[]')
  } catch {
    return []
  }
}

export default function LikedSection({ allVideos, onUnlock, onLike, onShare, onOpen, onBuy, entitlements }) {
  const [likedIds, setLikedIds] = useState(() => getLikedIds())

  useEffect(() => {
    const update = () => setLikedIds(getLikedIds())
    window.addEventListener('viralzone-refresh', update)
    return () => window.removeEventListener('viralzone-refresh', update)
  }, [])

  const videos = allVideos.filter(v => likedIds.includes(v.id))

  return (
    <div className="fadeIn">
      <h3 style={{ color: '#ec4899', marginLeft: 5 }}>❤️ পছন্দের ভিডিও</h3>
      <div className="cards">
        {videos.length === 0 && (
          <p style={{ textAlign: 'center', color: 'gray', padding: 20 }}>পছন্দের ভিডিও নেই</p>
        )}
        {videos.map(v => (
          <div key={v.id}>
            <VideoCard
              video={v}
              onUnlock={onUnlock}
              onLike={onLike}
              onShare={onShare}
              onOpen={onOpen}
              onBuy={onBuy}
              entitled={isVideoEntitled(entitlements, v.id)}
              priceLabel={v.price ? `${v.price} USDT` : ''}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
