import { useState } from 'react'
import { useFirebaseList } from '../../hooks/useFirebase'
import { api } from '../../api'
import { confirmDelete, writeWithFallback } from './shared'
import { useToast } from '../../context/ToastContext'

export default function PackageSection() {
  const { showToast } = useToast()
  const packages = useFirebaseList('packages')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [bkashPrice, setBkashPrice] = useState('')
  const [videoCount, setVideoCount] = useState('')
  const [durationDays, setDurationDays] = useState('')
  const [benefits, setBenefits] = useState('')

  const addPackage = async () => {
    if (!name || !price) {
      alert('নাম ও দাম দিন')
      return
    }
    const payload = {
      name,
      description,
      price: parseFloat(price) || 0,
      bkash_price: parseFloat(bkashPrice) || 0,
      video_count: parseInt(videoCount) || 999999,
      duration_days: parseInt(durationDays) || 0,
      benefits: benefits.split(',').map(b => b.trim()).filter(Boolean),
      active: true
    }
    await writeWithFallback('packages', { ...payload, created_at: Date.now() }, api.createPackage, payload)
    setName('')
    setDescription('')
    setPrice('')
    setBkashPrice('')
    setVideoCount('')
    setDurationDays('')
    setBenefits('')
    showToast('Package Added!')
  }

  return (
    <>
      <label className="help-text">প্যাকেজের নাম</label>
      <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Semester Package / Weekly Combo" />
      <label className="help-text">বিবরণ</label>
      <textarea value={description} onChange={e => setDescription(e.target.value)} style={{ height: 50 }} placeholder="যা যা পাবেন..." />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label className="help-text">Binance দাম (USDT)</label>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="5" />
        </div>
        <div style={{ flex: 1 }}>
          <label className="help-text">bKash দাম (৳)</label>
          <input type="number" value={bkashPrice} onChange={e => setBkashPrice(e.target.value)} placeholder="500" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label className="help-text">ভিডিও সংখ্যা (0 = আনলিমিটেড)</label>
          <input type="number" value={videoCount} onChange={e => setVideoCount(e.target.value)} placeholder="0 = unlimited" />
        </div>
        <div style={{ flex: 1 }}>
          <label className="help-text">মেম্বারশিপ দিন (0 = নেই)</label>
          <input type="number" value={durationDays} onChange={e => setDurationDays(e.target.value)} placeholder="30" />
        </div>
      </div>
      <label className="help-text">Benefits (কমা দিয়ে আলাদা করুন)</label>
      <input type="text" value={benefits} onChange={e => setBenefits(e.target.value)} placeholder="সব ভিডিও আনলক, Ad-free, VIP সাপোর্ট" />
      <button className="action-btn" onClick={addPackage}>
           ADD PACKAGE
      </button>
      <div>
        {packages.map(p => (
          <div key={p._fbKey} className="list-item">
            <div style={{ flex: 1 }}>
              <b>{p.name}</b>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>
                {p.price} USDT | {p.video_count === 999999 ? 'Unlimited' : p.video_count} videos | {p.duration_days || 0} days
              </div>
            </div>
            <button className="del-btn" onClick={() => confirmDelete('packages', api.deletePackage, p._fbKey)}>
              X
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
