import { useEffect, useState } from 'react'
import VideoCard from './VideoCard'

export default function SingleView({ video, onClose, onUnlock, onLike, onShare }) {
  const [active, setActive] = useState(false)

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

  return (
    <div className={`single-view fadeIn ${active ? 'active' : ''}`}>
      <button className="back-btn" onClick={onClose}>
        <i className="fas fa-arrow-left" /> ফিরে যান
      </button>
      <VideoCard video={video} onUnlock={onUnlock} onLike={onLike} onShare={onShare} inSingleView />
    </div>
  )
}
