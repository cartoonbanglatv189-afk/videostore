import { useEffect, useState } from 'react'
import { ref, update, get } from 'firebase/database'
import { getDb } from '../../firebase'
import { useFirebaseList, useFirebaseObject } from '../../hooks/useFirebase'
import { api, isBackendEnabled } from '../../api'
import { useToast } from '../../context/ToastContext'
import { applyPurchaseClientSide } from './shared'

export default function PaymentsSection() {
  const { showToast } = useToast()
  const config = useFirebaseObject('payments_config') || {}
  const purchases = useFirebaseList('purchases')
  const deposits = useFirebaseList('deposits')

  const [bKey, setBKey] = useState('')
  const [bSecret, setBSecret] = useState('')
  const [bPayId, setBPayId] = useState('')
  const [mPhone, setMPhone] = useState('')
  const [mInstr, setMInstr] = useState('')
  const [videoPrice, setVideoPrice] = useState(0)
  const [binanceOn, setBinanceOn] = useState(true)
  const [manualOn, setManualOn] = useState(true)
  const [cryptoOn, setCryptoOn] = useState(true)
  const [wallets, setWallets] = useState([])
  const [uniType, setUniType] = useState('BINANCE_ID')
  const [uniVal, setUniVal] = useState('')
  const [mobiles, setMobiles] = useState([])
  const [mType, setMType] = useState('bKash')
  const [mNum, setMNum] = useState('')
  const [payIds, setPayIds] = useState([])

  useEffect(() => {
    if (config) {
      setMPhone(config.manual_phone || '')
      setMInstr(config.manual_instructions || '')
      setVideoPrice(config.video_price || 1)
      setBinanceOn(config.binance_enabled !== false)
      setManualOn(config.manual_enabled !== false)
      setCryptoOn(config.crypto_enabled !== false)
      setBPayId(config.binance_pay_id || '')
      const raw = config.crypto_wallets
      setWallets(Array.isArray(raw) ? raw : Object.values(raw || {}))
      const mraw = config.mobile_wallets
      setMobiles(Array.isArray(mraw) ? mraw : Object.values(mraw || {}))
      const praw = config.binance_pay_ids
      setPayIds(Array.isArray(praw) ? praw : Object.values(praw || {}))
    }
  }, [config])

  const addUnified = () => {
    const val = uniVal.trim()
    if (!val) {
      showToast(uniType === 'BINANCE_ID' ? 'Binance Pay ID লিখুন' : 'Wallet address লিখুন')
      return
    }
    if (uniType === 'BINANCE_ID') {
      if (payIds.some(p => p.id === val)) {
        showToast('এই Pay ID আগেই যোগ করা আছে')
        return
      }
      setPayIds([...payIds, { id: val, label: '', on: true }])
      showToast('✅ Binance Pay ID যোগ হয়েছে! এখন Save Payment Config চাপুন')
    } else {
      if (wallets.some(w => w.address === val && w.network === uniType)) {
        showToast('এই wallet আগেই যোগ করা আছে')
        return
      }
      setWallets([...wallets, { network: uniType, address: val, label: '', on: true }])
      showToast('✅ Wallet যোগ হয়েছে! এখন Save Payment Config চাপুন')
    }
    setUniVal('')
  }

  const toggleCryptoWallet = i => {
    const next = [...wallets]
    next[i] = { ...next[i], on: next[i].on === false }
    setWallets(next)
  }

  const removeCryptoWallet = i => setWallets(wallets.filter((_, idx) => idx !== i))

  const addMobileWallet = () => {
    const num = mNum.trim()
    if (!num) {
      showToast('নাম্বার লিখুন')
      return
    }
    if (mobiles.some(w => w.number === num && w.type === mType)) {
      showToast('এই নাম্বার আগেই যোগ করা আছে')
      return
    }
    setMobiles([...mobiles, { type: mType, number: num, on: true }])
    setMNum('')
    showToast('✅ নাম্বার যোগ হয়েছে! এখন Save Payment Config চাপুন')
  }

  const toggleMobileWallet = i => {
    const next = [...mobiles]
    next[i] = { ...next[i], on: next[i].on === false }
    setMobiles(next)
  }

  const removeMobileWallet = i => setMobiles(mobiles.filter((_, idx) => idx !== i))


  const togglePayId = i => {
    const next = [...payIds]
    next[i] = { ...next[i], on: next[i].on === false }
    setPayIds(next)
  }

  const removePayId = i => setPayIds(payIds.filter((_, idx) => idx !== i))

  const saveConfig = async () => {
    const payload = {
      binance_api_key: bKey || undefined,
      binance_api_secret: bSecret || undefined,
      binance_pay_id: bPayId,
      manual_phone: mPhone,
      manual_instructions: mInstr,
      video_price: parseFloat(videoPrice) || 1,
      binance_enabled: binanceOn,
      manual_enabled: manualOn,
      crypto_enabled: cryptoOn,
      crypto_wallets: wallets,
      mobile_wallets: mobiles,
      binance_pay_ids: payIds
    }
    if (isBackendEnabled()) {
      try {
        const res = await api.savePaymentsConfig(payload)
        showToast(`✅ Saved! (${(res && res.saved && res.saved.length) || 0} field)`)
        return
      } catch (e) {
        console.error('backend save failed, falling back to direct write', e)
        if (String(e && e.message).includes('403')) {
          showToast('⚠️ Admin password ভুল বা Render-এ ADMIN_KEY নেই — সরাসরি Firebase-এ সেভ হচ্ছে')
        }
      }
    }
    const clean = Object.fromEntries(Object.entries({ ...payload }).filter(([, v]) => v !== undefined))
    const db = await getDb()
    if (!db) {
      window.alert('❌ Save failed! Backend ও Firebase — কোনোটাই connected নয়। VITE_BACKEND_URL চেক করুন।')
      return
    }
    try {
      await update(ref(db, 'payments_config'), clean)
      showToast('✅ Saved! (সরাসরি Firebase)')
    } catch (e) {
      console.error('direct write failed', e)
      window.alert('❌ Save failed! Firebase Realtime Database Rules-এ write allow করতে হবে')
    }
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

  const decideDeposit = async (d, decision) => {
    if (!window.confirm(`Sure to ${decision} deposit of ${d.amount} USDT?`)) return
    if (isBackendEnabled()) {
      try {
        if (decision === 'approve') await api.approveDeposit(d._fbKey)
        else await api.rejectDeposit(d._fbKey)
        showToast(decision === 'approve' ? 'Deposit অ্যাপ্রুভ — Balance যোগ হয়েছে' : 'Rejected')
        return
      } catch (e) {
        console.error('deposit decide failed, fallback', e)
      }
    }
    const db = await getDb()
    if (!db) return
    if (decision === 'reject') {
      await update(ref(db, `deposits/${d._fbKey}`), { status: 'rejected', verified_at: Date.now() })
    } else {
      await update(ref(db, `deposits/${d._fbKey}`), { status: 'approved', verified_at: Date.now() })
      const path = `user_wallets/${d.user_id}`
      const snap = await get(ref(db, path))
      const cur = snap.val() || {}
      await update(ref(db, path), { balance: Number(cur.balance || 0) + Number(d.amount || 0), updated_at: Date.now() })
    }
    showToast(decision === 'approve' ? 'Deposit অ্যাপ্রুভ — Balance যোগ হয়েছে' : 'Rejected')
  }

  return (
    <>
      <div className="ad-card">
        <h4 style={{ color: '#d8b4fe', marginBottom: 4 }}>💳 পেমেন্ট গেটওয়ে সেটআপ (সব একসাথে)</h4>
        <p className="help-text" style={{ marginBottom: 14 }}>
          Binance ID + Crypto Address এক লিস্টে • bKash/Nagad/Rocket — নিচে সব একসাথে সেট করুন, একটাই Save বাটন।
        </p>
        {(() => {
          const ready = !!(config.binance_api_key && config.binance_api_secret)
          return (
            <div style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 12, background: ready ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${ready ? 'rgba(16,185,129,0.5)' : 'rgba(239,68,68,0.5)'}`, fontSize: 12.5, fontWeight: 700, color: ready ? '#34d399' : '#f87171' }}>
              {ready
                ? '✅ অটো ভেরিফাই চালু — Binance API Key/Secret সেভ করা আছে'
                : '🔴 অটো ভেরিফাই বন্ধ — Binance API Key ও API Secret সেভ করা নেই'}
            </div>
          )
        })()}
        <h4 style={{ color: '#ec4899' }}>🚀 Binance Pay (Auto Verify)</h4>
        <label className="help-text">API Key</label>
        <input type="password" value={bKey} onChange={e => setBKey(e.target.value)} placeholder={config.binance_api_key ? '•••• (সেভ করা আছে)' : 'API Key'} />
        <label className="help-text">API Secret</label>
        <input type="password" value={bSecret} onChange={e => setBSecret(e.target.value)} placeholder={config.binance_api_secret ? '•••• (সেভ করা আছে)' : 'API Secret'} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#ddd', marginBottom: 10 }}>
          <input type="checkbox" checked={binanceOn} onChange={e => setBinanceOn(e.target.checked)} style={{ width: 'auto' }} /> চালু রাখুন
        </label>

        <label className="help-text" style={{ marginTop: 6 }}>💱 Binance Pay ID ও Crypto Wallet — সব এক লিস্টে (অ্যাড করলেই নিচে দেখা যাবে)</label>
        {payIds.length + wallets.length > 0 ? (
          <div style={{ marginBottom: 10 }}>
            {payIds.map((p, i) => (
              <div key={`pid-${i}`} className="crypto-wallet-row" style={{ marginBottom: 6, cursor: 'default' }}>
                <span className="crypto-net" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>BINANCE ID</span>
                <span className="crypto-addr" style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{p.id}</span>
                <span style={{ display: 'flex', gap: 4 }}>
                  <button className="del-btn" style={{ background: p.on === false ? '#6b7280' : '#10b981', padding: '3px 7px' }} onClick={() => togglePayId(i)}>
                    {p.on === false ? 'OFF' : 'ON'}
                  </button>
                  <button className="del-btn" style={{ padding: '3px 7px' }} onClick={() => removePayId(i)}>✕</button>
                </span>
              </div>
            ))}
            {wallets.map((w, i) => (
              <div key={`wl-${i}`} className="crypto-wallet-row" style={{ marginBottom: 6, cursor: 'default' }}>
                <span className="crypto-net">{w.network}</span>
                <span className="crypto-addr" style={{ wordBreak: 'break-all', whiteSpace: 'normal' }}>{w.address}</span>
                <span style={{ display: 'flex', gap: 4 }}>
                  <button className="del-btn" style={{ background: w.on === false ? '#6b7280' : '#10b981', padding: '3px 7px' }} onClick={() => toggleCryptoWallet(i)} title={w.on === false ? 'চালু করুন' : 'বন্ধ করুন'}>
                    {w.on === false ? 'OFF' : 'ON'}
                  </button>
                  <button className="del-btn" style={{ padding: '3px 7px' }} onClick={() => removeCryptoWallet(i)}>✕</button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="help-text" style={{ color: '#6b7280', marginBottom: 8 }}>এখনো কিছু যোগ করা হয়নি — নিচে থেকে Binance ID বা Crypto Address যোগ করুন।</p>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select value={uniType} onChange={e => setUniType(e.target.value)} style={{ flex: 2 }}>
            <option value="BINANCE_ID">Binance Pay ID / UID</option>
            <option value="TRC20">TRC20 (Tron — অটো ভেরিফাই)</option>
            <option value="BEP20">BEP20 (BNB Chain — অটো ভেরিফাই)</option>
            <option value="ERC20">ERC20 (Ethereum)</option>
            <option value="SOL">SOL (Solana)</option>
            <option value="TON">TON</option>
            <option value="OTHER">Other</option>
          </select>
          <input type="text" value={uniVal} onChange={e => setUniVal(e.target.value)} placeholder={uniType === 'BINANCE_ID' ? 'যেমন: 123456789' : 'USDT Wallet Address'} style={{ flex: 3 }} />
        </div>
        <button className="action-btn" style={{ padding: 10, marginBottom: 10 }} onClick={addUnified}>
          + যোগ করুন
        </button>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#ddd', marginBottom: 6 }}>
          <input type="checkbox" checked={cryptoOn} onChange={e => setCryptoOn(e.target.checked)} style={{ width: 'auto' }} /> Crypto পেমেন্ট চালু রাখুন
        </label>
        <p className="help-text" style={{ color: '#fbbf24' }}>
          💸 USDT পাঠানোর নিয়ম: ইউজার Binance ID-তে পাঠাতে পারে অথবা Crypto Address-এ। TRC20/BEP20-এ TXID দিলে অটো ভেরিফাই হবে। এখানে শুধু আপনার যোগ করা ID/Address দেখাবে — কোনো ডেমো ডেটা নেই।
        </p>
      </div>

      <div className="gw-sub">
        <h4 style={{ color: '#a855f7' }}>📱 bKash / Nagad / Rocket — মোবাইল ওয়ালেট (Admin Verify)</h4>
        <p className="help-text">টাকা নিতে চাইলে নাম্বার যোগ করুন — ইউজার পেমেন্ট করার সময় এই নাম্বারগুলোই দেখাবে।</p>
        {mobiles.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {mobiles.map((w, i) => (
              <div key={i} className="crypto-wallet-row" style={{ marginBottom: 6, cursor: 'default' }}>
                <span className="crypto-net" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6' }}>{w.type}</span>
                <span className="crypto-addr">{w.number}</span>
                <span style={{ display: 'flex', gap: 4 }}>
                  <button className="del-btn" style={{ background: w.on === false ? '#6b7280' : '#10b981', padding: '3px 7px' }} onClick={() => toggleMobileWallet(i)}>
                    {w.on === false ? 'OFF' : 'ON'}
                  </button>
                  <button className="del-btn" style={{ padding: '3px 7px' }} onClick={() => removeMobileWallet(i)}>✕</button>
                </span>
              </div>
            ))}
          </div>
        )}
        <label className="help-text">নতুন নাম্বার যোগ করুন</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select value={mType} onChange={e => setMType(e.target.value)} style={{ flex: 1 }}>
            <option value="bKash">bKash</option>
            <option value="Nagad">Nagad</option>
            <option value="Rocket">Rocket</option>
            <option value="Upay">Upay</option>
          </select>
        </div>
        <input type="text" value={mNum} onChange={e => setMNum(e.target.value)} placeholder="01XXXXXXXXX" />
        <button className="action-btn" style={{ padding: 10, marginBottom: 10 }} onClick={addMobileWallet}>
          + নাম্বার যোগ করুন
        </button>
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
                User: {p.user_id} | {p.method === 'manual' ? 'bKash/Manual' : p.method === 'crypto' ? `Crypto (${p.crypto_network || '-'})` : p.method === 'binance_id' ? 'Binance ID' : 'Binance'}
                {p.transaction_ref ? ` | TXID: ${p.transaction_ref.slice(0, 20)}` : ''}
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

      <h4 style={{ color: '#14b8a6', margin: '20px 0 5px' }}>💰 Deposit Requests ({deposits.filter(d => d.status === 'pending').length} pending)</h4>
      <div>
        {deposits.length === 0 && <p style={{ color: '#666', fontSize: 13 }}>কোনো deposit নেই</p>}
        {[...deposits].reverse().map(d => (
          <div key={d._fbKey} className="list-item payable">
            <div style={{ flex: 1, fontSize: 12 }}>
              <b>{d.amount} USDT</b> — User: {d.user_id}
              <div style={{ color: '#9ca3af' }}>
                {d.method === 'binance_id' ? 'Binance ID' : d.crypto_network || 'Crypto'} | Ref: {String(d.transaction_ref || '').slice(0, 20)}
              </div>
              <div style={{ color: d.status === 'approved' ? '#10b981' : d.status === 'rejected' ? '#ef4444' : '#f59e0b', fontWeight: 700 }}>
                {d.status?.toUpperCase()}
              </div>
            </div>
            {d.status === 'pending' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="del-btn" style={{ background: '#10b981' }} onClick={() => decideDeposit(d, 'approve')}>
                  ✔
                </button>
                <button className="del-btn" onClick={() => decideDeposit(d, 'reject')}>
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
