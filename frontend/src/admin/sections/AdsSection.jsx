import { useState } from 'react'
import { ref, update } from 'firebase/database'
import { getDb } from '../../firebase'
import { useFirebaseList, useFirebaseObject } from '../../hooks/useFirebase'
import { api, isBackendEnabled } from '../../api'
import { confirmDelete, writeWithFallback } from './shared'
import { useToast } from '../../context/ToastContext'

export default function AdsSection() {
  const { showToast } = useToast()
  const settings = useFirebaseObject('settings') || {}
  const adsgramIds = useFirebaseList('ads_config/interstitial_ids')
  const banners = useFirebaseList('ads_config/banners')

  const [monetagId, setMonetagId] = useState('')
  const [adsgramId, setAdsgramId] = useState('')
  const [bannerCode, setBannerCode] = useState('')

  const currentMonetag = monetagId !== '' ? monetagId : settings.monetag_id || ''

  const saveMonetag = async () => {
    if (isBackendEnabled()) {
      try {
        await api.saveMonetag(monetagId)
        showToast('Monetag ID Saved!')
        return
      } catch (e) {
        console.error('Backend save failed, falling back', e)
      }
    }
    const db = await getDb()
    if (!db) {
      showToast('Firebase unavailable!')
      return
    }
    await update(ref(db, 'settings'), { monetag_id: monetagId })
    showToast('Monetag ID Saved!')
  }

  const addAdsgramId = async () => {
    if (!adsgramId) return
    await writeWithFallback('ads_config/interstitial_ids', adsgramId, api.addAdsgramId, { id: adsgramId })
    setAdsgramId('')
  }

  const addBanner = async () => {
    if (!bannerCode) return
    await writeWithFallback('ads_config/banners', bannerCode, api.addBanner, { html: bannerCode })
    setBannerCode('')
  }

  return (
    <>
      <div style={{ background: '#252538', padding: 10, borderRadius: 10, marginBottom: 15, border: '1px solid #ec4899' }}>
        <h4 style={{ margin: '0 0 10px', color: '#ec4899' }}>🚀 Monetag (2nd Ad)</h4>
        <label className="help-text">Zone ID (Example: 10110498)</label>
        <input type="number" value={currentMonetag} onChange={e => setMonetagId(e.target.value)} placeholder="10110498" />
        <button className="action-btn" style={{ padding: 8 }} onClick={saveMonetag}>
          Save Monetag ID
        </button>
      </div>

      <div style={{ background: '#252538', padding: 10, borderRadius: 10, marginBottom: 15 }}>
        <h4 style={{ margin: '0 0 10px', color: '#fff' }}>Adsgram Block ID</h4>
        <input type="text" value={adsgramId} onChange={e => setAdsgramId(e.target.value)} placeholder="Example: 12345" />
        <button className="action-btn" style={{ padding: 8 }} onClick={addAdsgramId}>
          Add ID
        </button>
        <div>
          {adsgramIds.map(item => (
            <div key={item._fbKey} className="list-item">
              <span>{String(item.value ?? '')}</span>
              <button
                className="del-btn"
                onClick={() => confirmDelete('ads_config/interstitial_ids', api.deleteAdsgramId, item._fbKey)}
              >
                X
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: '#252538', padding: 10, borderRadius: 10 }}>
        <h4 style={{ margin: '0 0 10px', color: '#a855f7' }}>Banner Ads (HTML)</h4>
        <textarea value={bannerCode} onChange={e => setBannerCode(e.target.value)} style={{ height: 60 }} placeholder='<a href="..."><img src="..."></a>' />
        <button className="action-btn" style={{ padding: 8 }} onClick={addBanner}>
          Add Banner
        </button>
        <div>
          {banners.map(item => (
            <div key={item._fbKey} className="list-item">
              <small>{String(item.value ?? '').substring(0, 20)}...</small>
              <button className="del-btn" onClick={() => confirmDelete('ads_config/banners', api.deleteBanner, item._fbKey)}>
                X
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
