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
        created_at: Date.now()
      },
      api.createVideo,
      { name: title, image_url: image, download_link: link, category: cat, ad_watches_required: parseInt(req) || 1 }
    )
    setTitle('')
    setImage('')
    setLink('')
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
      <button className="action-btn" onClick={uploadVideo}>
        PUBLISH VIDEO
      </button>
      <div style={{ marginTop: 20 }}>
        {[...videos].reverse().map(v => (
          <div key={v._fbKey} className="list-item">
            <img src={v.image_url} width="30" alt="" />
            <span style={{ flex: 1 }}>{v.name}</span>
            <button className="del-btn" onClick={() => confirmDelete('videos', api.deleteVideo, v._fbKey)}>
              X
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
