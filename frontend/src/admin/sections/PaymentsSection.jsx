import { useEffect, useState } from 'react'
import { ref, update } from 'firebase/database'
import { getDb } from '../../firebase'
import { useFirebaseList, useFirebaseObject } from '../../hooks/useFirebase'
import { api, isBackendEnabled } from '../../api'
import { useToast } from '../../context/ToastContext'
import { applyPurchaseClientSide } from './shared'

export default function PaymentsSection() {
  const { showToast } = useToast()
  const config = useFirebaseObject('payments_config') || {}
  const purchases = useFirebaseList('purchases')

  const [bKey, setBKey] = useState('')
  const [bSecret, setBSecret] = useState('')
  const [mPhone, setMPhone] = useState('')
  const [mInstr, setMInstr] = useState('')
  const [videoPrice, setVideoPrice] = useState(0)
  const [binanceOn, setBinanceOn] = useState(true)
  const [manualOn, setManualOn] = useState(true)

  useEffect(() => {
    if (config) {
      setMPhone(config.manual_phone || '')
      setMInstr(config.manual_instructions || '')
      setVideoPrice(config.video_price || 1)
      setBinanceOn(config.binance_enabled !== false)
      setManualOn(config.manual_enabled !== false)
    }
  }, [config])

  const saveConfig = async () => {
    const payload = {
      binance_api_key: bKey || undefined,
      binance_api_secret: bSecret || undefined,
      manual_phone: mPhone,
      manual_instructions: mInstr,
      video_price: parseFloat(videoPrice) || 1,
      binance_enabled: binanceOn,
      manual_enabled: manualOn
    }
    if (isBackendEnabled()) {
      try {
        await api.savePaymentsConfig(payload)
        showToast('Payment Config Saved')
        return
      } catch (e) {
        console.error('backend save failed', e)
      }
    }
    const clean = Object.fromEntries(Object.entries({ ...payload, ...(!bKey ? {} : { binance_api_key: bKey }), ...(!bSecret ? {} : { binance_api_secret: bSecret }) }).filter(([k, v]) => k !== 'video_price' || v !== undefined))
    const db = await getDb()
    if (db) await update(ref(db, 'payments_config'), clean)
    showToast('Payment Config Saved')
  }

  const decide = async (p, decision) => {
    if (!window.confirm(`Sure to ${decision}?`)) return
    if (isBackendEnabled()) {
      try {
        if (decision === 'approve') await api.approveManual(p._fbKey)
        else await api.rejectManual(p._fbKey)
        showToast(decision === 'approve' ? 'Approved & Unlocked' : 'Rejected')
        return
      } catch (e) {
        console.error('backend decide failed, fallback', e)
      }
    }
    const db = await getDb()
    if (db) await update(ref(db, `purchases/${p._fbKey}`), { status: decision === 'approve' ? 'approved' : 'rejected', verified_at: Date.now() })
    if (decision === 'approve') await applyPurchaseClientSide(p)
    showToast(decision === 'approve' ? 'Approved & Unlocked' : 'Rejected')
  }

  return (
    <>
      <div className="ad-card">
        <h4 style={{ color: '#ec4899' }}>🚀 Binance Pay (Auto Verify)</h4>
        <label className="help-text">API Key</label>
        <input type="password" value={bKey} onChange={e => setBKey(e.target.value)} placeholder={config.binance_api_key ? '•••• (সেভ করা আছে)' : 'API Key'} />
        <label className="help-text">API Secret</label>
        <input type="password" value={bSecret} onChange={e => setBSecret(e.target.value)} placeholder={config.binance_api_secret ? '•••• (সেভ করা আছে)' : 'API Secret'} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#ddd', marginBottom: 10 }}>
          <input type="checkbox" checked={binanceOn} onChange={e => setBinanceOn(e.target.checked)} style={{ width: 'auto' }} /> চালু রাখুন
        </label>
      </div>

      <div className="ad-card">
        <h4 style={{ color: '#a855f7' }}>📱 bKash / ম্যানুয়াল (Admin Verify)</h4>
        <label className="help-text">bKash নম্বর (ইউজারকে দেখানো হবে)</label>
        <input type="text" value={mPhone} onChange={e => setMPhone(e.target.value)} placeholder="01XXXXXXXXX" />
        <label className="help-text">নির্দেশনা</label>
        <textarea value={mInstr} onChange={e => setMInstr(e.target.value)} style={{ height: 60 }} placeholder="যেকোনো অ্যামাউন্ট Send Money করে ট্রানজেকশন আইডি দিন" />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#ddd', marginBottom: 10 }}>
          <input type="checkbox" checked={manualOn} onChange={e => setManualOn(e.target.checked)} style={{ width: 'auto' }} /> চালু রাখুন
        </label>
        <label className="help-text">ডিফল্ট ভিডিওর দাম (USDT)</label>
        <input type="number" value={videoPrice} onChange={e => setVideoPrice(e.target.value)} />
        <button className="action-btn" style={{ padding: 10 }} onClick={saveConfig}>
          Save Payment Config
        </button>
      </div>

      <h4 style={{ color: '#d8b4fe', margin: '20px 0 5px' }}>🧾 পেমেন্ট রিকুয়েস্ট ({purchases.filter(p => p.status === 'pending').length} pending)</h4>
      <div>
        {purchases.length === 0 && <p style={{ color: '#666', fontSize: 13 }}>কোনো পেমেন্ট রিকুয়েস্ট নেই</p>}
        {[...purchases].reverse().map(p => (
          <div key={p._fbKey} className="list-item payable">
            <div style={{ flex: 1, fontSize: 12 }}>
              <b>{p.package_name || p.video_name || 'Item'}</b> — {p.amount} {p.currency}
              <div style={{ color: '#9ca3af' }}>
                User: {p.user_id} | {p.method === 'manual' ? 'bKash/Manual' : 'Binance'}
                {p.transaction_ref ? ` | Ref: ${p.transaction_ref}` : ''}
              </div>
              <div style={{ color: p.status === 'approved' ? '#10b981' : p.status === 'rejected' ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                {p.status?.toUpperCase()}
              </div>
            </div>
            {p.status === 'pending' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="del-btn" style={{ background: '#10b981' }} onClick={() => decide(p, 'approve')}>
                  ✔
                </button>
                <button className="del-btn" onClick={() => decide(p, 'reject')}>
                  ✖
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
