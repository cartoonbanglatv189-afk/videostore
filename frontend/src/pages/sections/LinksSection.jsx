export default function LinksSection({ menuLinks }) {
  return (
    <div className="fadeIn">
      <h3 style={{ color: 'var(--primary)', marginLeft: 5 }}>🔗 প্রয়োজনীয় লিংক</h3>
      <div className="cards">
        {menuLinks.length === 0 && (
          <p style={{ textAlign: 'center', color: 'gray', padding: 20 }}>কোনো লিংক নেই</p>
        )}
        {menuLinks.map(l => (
          <div key={l._fbKey} className="card" style={{ padding: 15, display: 'flex', alignItems: 'center', gap: 15 }}>
            <i className="fas fa-link" style={{ color: 'var(--primary)', fontSize: 20 }} />
            <div style={{ flex: 1 }}>
              <b>{l.title}</b>
            </div>
            <a
              href={l.url}
              target="_blank"
              rel="noreferrer"
              style={{ background: '#2d2d44', color: 'white', padding: '5px 15px', borderRadius: 50, textDecoration: 'none', fontSize: 12 }}
            >
              Open
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
