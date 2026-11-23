import { useState } from 'react'
import { useFirebaseList } from '../../hooks/useFirebase'
import { api } from '../../api'
import { confirmDelete, writeWithFallback } from './shared'
import { useToast } from '../../context/ToastContext'

export default function LinksAdminSection() {
  const { showToast } = useToast()
  const links = useFirebaseList('links')

  const [lTitle, setLTitle] = useState('')
  const [lUrl, setLUrl] = useState('')

  const addLink = async () => {
    if (!lTitle || !lUrl) return
    await writeWithFallback('links', { title: lTitle, url: lUrl }, api.addLink, { title: lTitle, url: lUrl })
    setLTitle('')
    setLUrl('')
    showToast('Added!')
  }

  return (
    <>
      <input type="text" value={lTitle} onChange={e => setLTitle(e.target.value)} placeholder="Title" />
      <input type="text" value={lUrl} onChange={e => setLUrl(e.target.value)} placeholder="URL" />
      <button className="action-btn" onClick={addLink}>
        Add
      </button>
      <div>
        {links.map(l => (
          <div key={l._fbKey} className="list-item">
            <span>{l.title}</span>
            <button className="del-btn" onClick={() => confirmDelete('links', api.deleteLink, l._fbKey)}>
              X
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
