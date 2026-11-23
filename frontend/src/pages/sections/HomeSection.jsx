import { useMemo, useState } from 'react'
import VideoCard from '../../components/VideoCard'
import { isVideoEntitled } from '../../utils/entitlements'

const fmtCountdown = ms => {
  const s = Math.floor(ms / 1000)
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const mins = Math.floor((s % 3600) / 60)
  if (days > 0) return `${days}দি ${hours}ঘ`
  if (hours > 0) return `${hours}ঘ ${mins}মি`
  return `${mins}মি`
}

export default function HomeSection({ allVideos, filters, bannerAds, onUnlock, onLike, onShare, onOpen, onBuy, entitlements }) {
  const [query, setQuery] = useState('')
  const [currentFilter, setCurrentFilter] = useState('all')
  const [sortMode, setSortMode] = useState('new')
  const now = Date.now()

  const released = useMemo(
    () => allVideos.filter(v => !v.publish_at || now >= Number(v.publish_at)),
    [allVideos, now]
  )
  const upcoming = useMemo(
    () =>
      allVideos
        .filter(v => v.publish_at && now < Number(v.publish_at))
        .sort((a, b) => Number(a.publish_at) - Number(b.publish_at)),
    [allVideos, now]
  )
  const trending = useMemo(
    () => [...released].sort((a, b) => (b.view_count || 0) - (a.view_count || 0)).slice(0, 5),
    [released, now]
  )

  const getCount = id => (id === 'all' ? released.length : released.filter(v => v.category === id).length)

  const visibleVideos = useMemo(() => {
    const q = query.toLowerCase()
    const list = released.filter(v => v.name.toLowerCase().includes(q) && (currentFilter === 'all' || v.category === currentFilter))
    if (sortMode === 'hot') return [...list].sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
    return list
  }, [released, query, currentFilter, sortMode])

  return (
    <div className="fadeIn">
      {upcoming.length > 0 && (
        <>
          <h4 className="strip-title">📅 শীঘ্রই আসছে</h4>
          <div className="strip-scroll">
            {upcoming.map(v => (
              <div key={v._fbKey} className="strip-card coming">
                <img src={v.image_url} alt="" />
                <div className="strip-name">{v.name}</div>
                <div className="strip-countdown">⏳ {fmtCountdown(Number(v.publish_at) - now)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {trending.length > 0 && (
        <>
          <h4 className="strip-title">🔥 ট্রেন্ডিং এখন</h4>
          <div className="strip-scroll">
            {trending.map((v, i) => (
              <div key={v._fbKey} className="strip-card" onClick={() => onOpen && onOpen(v.id)} style={{ cursor: 'pointer' }}>
                <span className="strip-rank">#{i + 1}</span>
                <img src={v.image_url} alt="" />
                <div className="strip-name">{v.name}</div>
                <div className="strip-views">👁️ {v.view_count || 0}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="search-wrapper">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="search-input"
          placeholder="ভিডিও খুঁজুন..."
        />
        <div className="search-icon">
          <i className="fas fa-search" />
        </div>
      </div>

      <div className="sort-row">
        <button className={`sort-btn ${sortMode === 'new' ? 'active' : ''}`} onClick={() => setSortMode('new')}>
          🆕 নতুন
        </button>
        <button className={`sort-btn ${sortMode === 'hot' ? 'active' : ''}`} onClick={() => setSortMode('hot')}>
          🔥 জনপ্রিয়
        </button>
      </div>

      <div className="filter-scroll">
        <button
          className={`filter-btn ${currentFilter === 'all' ? 'active' : ''}`}
          onClick={() => setCurrentFilter('all')}
        >
          All <span className="badge">{getCount('all')}</span>
        </button>
        {filters.map(f => (
          <button
            key={f._fbKey}
            className={`filter-btn ${currentFilter === f.id ? 'active' : ''}`}
            onClick={() => setCurrentFilter(f.id)}
          >
            {f.name} <span className="badge">{getCount(f.id)}</span>
          </button>
        ))}
      </div>

      <div className="cards">
        {visibleVideos.length === 0 && (
          <p style={{ textAlign: 'center', color: '#666', marginTop: 20 }}>কোনো ভিডিও পাওয়া যায়নি</p>
        )}
        {visibleVideos.map(v => (
          <div key={v._fbKey}>
            <VideoCard
              video={v}
              onUnlock={onUnlock}
              onLike={onLike}
              onShare={onShare}
              onOpen={onOpen}
              onBuy={onBuy}
              entitled={isVideoEntitled(entitlements, v._fbKey || v.id)}
              priceLabel={v.price ? `${v.price} USDT` : ''}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
