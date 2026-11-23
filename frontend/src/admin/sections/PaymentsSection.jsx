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
  const [bPayId, setBPayId] = useState('')
  const [mPhone, setMPhone] = useState('')
  const [mInstr, setMInstr] = useState('')
  const [videoPrice, setVideoPrice] = useState(0)
  const [binanceOn, setBinanceOn] = useState(true)
  const [manualOn, setManualOn] = useState(true)
  const [cryptoOn, setCryptoOn] = useState(true)
  const [wallets, setWallets] = useState([])
  const [wNet, setWNet] = useState('TRC20')
  const [wAddr, setWAddr] = useState('')
  const [mobiles, setMobiles] = useState([])
  const [mType, setMType] = useState('bKash')
  const [mNum, setMNum] = useState('')

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
    }
  }, [config])

  const addCryptoWallet = () => {
    const addr = wAddr.trim()
    if (!addr) {
      showToast('Wallet address লিখুন')
      return
    }
    if (wallets.some(w => w.address === addr && w.network === wNet)) {
      showToast('এই wallet আগেই যোগ করা আছে')
      return
    }
    setWallets([...wallets, { network: wNet, address: addr, label: '', on: true }])
    setWAddr('')
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
  }

  const toggleMobileWallet = i => {
    const next = [...mobiles]
    next[i] = { ...next[i], on: next[i].on === false }
    setMobiles(next)
  }

  const removeMobileWallet = i => setMobiles(mobiles.filter((_, idx) => idx !== i))

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
      mobile_wallets: mobiles
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
        <label className="help-text">Binance Pay ID (অটো পেমেন্ট রিসিভ আইডি — ইউজারকে দেখানো হবে)</label>
        <input type="text" value={bPayId} onChange={e => setBPayId(e.target.value)} placeholder="যেমন: 123456789" />
      </div>

      <div className="ad-card">
        <h4 style={{ color: '#10b981' }}>🪙 Crypto Wallet — TRC20 / BEP20 (Auto Verify)</h4>
        <p className="help-text">USDT নিতে চাইলে wallet address যোগ করুন। TRC20 ও BEP20-এ TXID <b>অটো ভেরিফাই</b> হবে।</p>
        {wallets.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {wallets.map((w, i) => (
              <div key={i} className="crypto-wallet-row" style={{ marginBottom: 6, cursor: 'default' }}>
                <span className="crypto-net">{w.network}</span>
                <span className="crypto-addr" style={{ wordBreak: 'break-all', whiteSpace: 'normal' }}>{w.address}</span>
                <span style={{ display: 'flex', gap: 4 }}>
                  <button className={`del-btn ${w.on === false ? '' : ''}`} style={{ background: w.on === false ? '#6b7280' : '#10b981', padding: '3px 7px' }} onClick={() => toggleCryptoWallet(i)} title={w.on === false ? 'চালু করুন' : 'বন্ধ করুন'}>
                    {w.on === false ? 'OFF' : 'ON'}
                  </button>
                  <button className="del-btn" style={{ padding: '3px 7px' }} onClick={() => removeCryptoWallet(i)}>✕</button>
                </span>
              </div>
            ))}
          </div>
        )}
        <label className="help-text">নতুন wallet যোগ করুন</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select value={wNet} onChange={e => setWNet(e.target.value)} style={{ flex: 1 }}>
            <option value="TRC20">TRC20 (Tron — অটো ভেরিফাই)</option>
            <option value="BEP20">BEP20 (BNB Chain — অটো ভেরিফাই)</option>
            <option value="ERC20">ERC20 (Ethereum)</option>
            <option value="SOL">SOL (Solana)</option>
            <option value="TON">TON</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <input type="text" value={wAddr} onChange={e => setWAddr(e.target.value)} placeholder="USDT Wallet Address" />
        <button className="action-btn" style={{ padding: 10, marginBottom: 10 }} onClick={addCryptoWallet}>
          + Wallet যোগ করুন
        </button>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: '#ddd', marginBottom: 10 }}>
          <input type="checkbox" checked={cryptoOn} onChange={e => setCryptoOn(e.target.checked)} style={{ width: 'auto' }} /> Crypto পেমেন্ট চালু রাখুন
        </label>
      </div>

      <div className="ad-card">
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
                User: {p.user_id} | {p.method === 'manual' ? 'bKash/Manual' : p.method === 'crypto' ? `Crypto (${p.crypto_network || '-'})` : 'Binance'}
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
    </>
  )
}
