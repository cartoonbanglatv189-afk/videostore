import { useState } from 'react'
import { useFirebaseList, useFirebaseObject } from '../../hooks/useFirebase'
import { api } from '../../api'
import { confirmDelete, writeWithFallback } from './shared'
import { useToast } from '../../context/ToastContext'

export default function VideoSection() {
  const { showToast } = useToast()
  const videos = useFirebaseList('videos')
  const filters = useFirebaseList('filters')

  const [title, setTitle] = useState('')
  const [image, setImage] = useState('')
  const [link, setLink] = useState('')
  const [cat, setCat] = useState('all')
  const [req, setReq] = useState(1)
  const [price, setPrice] = useState('')

  const uploadVideo = async () => {
    if (!title || !image || !link) {
      alert('সব ফিল্ড পূরণ করুন')
      return
    }
    await writeWithFallback(
      'videos',
      {
        name: title,
        image_url: image,
        download_link: link,
        category: cat,
        ad_watches_required: parseInt(req) || 1,
        price: parseFloat(price) || 0,
        created_at: Date.now()
      },
      api.createVideo,
      { name: title, image_url: image, download_link: link, category: cat, ad_watches_required: parseInt(req) || 1, price: parseFloat(price) || 0 }
    )
    setTitle('')
    setImage('')
    setLink('')
    setPrice('')
    showToast('Done!')
  }

  return (
    <>
      <label className="help-text">নাম</label>
      <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Video Title" />
      <label className="help-text">ছবি (Direct URL)</label>
      <input type="text" value={image} onChange={e => setImage(e.target.value)} placeholder="https://..." />
      <label className="help-text">লিংক</label>
      <input type="text" value={link} onChange={e => setLink(e.target.value)} placeholder="Download link..." />
      <div style={{ display: 'flex', gap: 10 }}>
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ flex: 1 }}>
          <option value="all">Category</option>
          {filters.map(f => (
            <option key={f._fbKey} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <input type="number" value={req} onChange={e => setReq(e.target.value)} style={{ flex: 1 }} placeholder="Ads Count" />
      </div>
      <label className="help-text">এই ভিডিওর নিজস্ব দাম (USDT) — খালি রাখলে default price ব্যবহার হবে</label>
      <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="Per-video price (USDT)" />
      <button className="action-btn" onClick={uploadVideo}>
        PUBLISH VIDEO
      </button>
      <div style={{ marginTop: 20 }}>
        {[...videos].reverse().map(v => (
          <div key={v._fbKey} className="list-item">
            <img src={v.image_url} width="30" alt="" />
            <span style={{ flex: 1 }}>{v.name}{v.price ? ` — ${v.price} USDT` : ''}</span>
            <button className="del-btn" onClick={() => confirmDelete('videos', api.deleteVideo, v._fbKey)}>
              X
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
