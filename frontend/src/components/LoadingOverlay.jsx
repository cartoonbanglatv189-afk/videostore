export default function LoadingOverlay({ open, text = 'Processing...', sub = 'Please do not close' }) {
  if (!open) return null
  return (
    <div className="loading-overlay">
      <div className="loader" />
      <div style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>{text}</div>
      <div style={{ color: '#aaa', fontSize: 12, marginTop: 5 }}>{sub}</div>
    </div>
  )
}
