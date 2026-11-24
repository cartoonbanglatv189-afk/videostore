const NAV_ITEMS = [
  { id: 'homeSec', icon: 'fa-house', label: 'হোম' },
  { id: 'premiumSec', icon: 'fa-crown', label: 'প্রিমিয়াম' },
  { id: 'likedSec', icon: 'fa-heart', label: 'পছন্দ' },
  { id: 'profileSec', icon: 'fa-user', label: 'প্রোফাইল' },
  { id: 'tutSec', icon: 'fa-book-open', label: 'টিউটোরিয়ল' },
  { id: 'linkSec', icon: 'fa-link', label: 'লিংক' }
]

export default function BottomNav({ active, onChange }) {
  return (
    <div className="bottom-nav">
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          className={`nav-item ${active === item.id ? 'active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          <i className={`fas ${item.icon}`} />
          <span className="nav-text">{item.label}</span>
        </button>
      ))}
    </div>
  )
}
