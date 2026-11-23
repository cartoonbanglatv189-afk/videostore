import { useMemo, useState } from 'react'
import VideoCard from '../../components/VideoCard'
import { isVideoEntitled } from '../../utils/entitlements'

export default function HomeSection({ allVideos, filters, bannerAds, onUnlock, onLike, onShare, onOpen, onBuy, entitlements }) {
  const [query, setQuery] = useState('')
  const [currentFilter, setCurrentFilter] = useState('all')

  const getCount = id => (id === 'all' ? allVideos.length : allVideos.filter(v => v.category === id).length)

  const visibleVideos = useMemo(() => {
    const q = query.toLowerCase()
    return allVideos.filter(v => v.name.toLowerCase().includes(q) && (currentFilter === 'all' || v.category === currentFilter))
  }, [allVideos, query, currentFilter])

  return (
    <div className="fadeIn">
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
