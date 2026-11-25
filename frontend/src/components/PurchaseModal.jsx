import { useEffect, useRef, useState } from 'react'
import { push, ref } from 'firebase/database'
import { getDb } from '../firebase'
import { api, isBackendEnabled } from '../api'
import { useFirebaseObject } from '../hooks/useFirebase'
import { useToast } from '../context/ToastContext'

export default function PurchaseModal({ mode, target, userId, onClose, onSuccess }) {
  const { showToast } = useToast()
  const payConfig = useFirebaseObject('payments_config') || {}
  const wallet = useFirebaseObject(userId ? `user_wallets/${userId}` : '__none__') || {}
  const balance = Number(wallet.balance || 0)
  const [step, setStep] = useState('method')
  const [method, setMethod] = useState('')
  const [dropOpen, setDropOpen] = useState(false)
  const [purchaseId, setPurchaseId] = useState(null)
  const [checkoutUrl, setCheckoutUrl] = useState('')
  const [txnRef, setTxnRef] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [selectedWallet, setSelectedWallet] = useState(null)
  const pollRef = useRef(null)

  const purchase = useFirebaseObject(purchaseId ? `purchases/${purchaseId}` : '__none__')
  const binancePayConfigured = !!(payConfig.binance_api_key && payConfig.binance_api_secret)

  const amount =
    mode === 'package'
      ? target?.price
      : (target?.price ?? payConfig.video_price) || payConfig.video_price || 0
  const manualAmount = mode === 'package' ? (target?.bkash_price || target?.price) : amount
  const cryptoWallets = (() => {
    const raw = payConfig.crypto_wallets
    const list = Array.isArray(raw) ? raw : Object.values(raw || {})
    return list.filter(w => w && w.address && w.on !== false)
  })()
  const mobileWallets = (() => {
    const raw = payConfig.mobile_wallets
    const list = Array.isArray(raw) ? raw : Object.values(raw || {})
    const active = list.filter(w => w && w.number && w.on !== false)
    if (active.length) return active
    return payConfig.manual_phone ? [{ type: 'bKash', number: payConfig.manual_phone, on: true }] : []
  })()
  const binanceIds = (() => {
    const raw = payConfig.binance_pay_ids
    const list = Array.isArray(raw) ? raw : Object.values(raw || {})
    const active = list.filter(w => w && w.id && w.on !== false)
    if (active.length) return active
    return payConfig.binance_pay_id ? [{ id: payConfig.binance_pay_id, on: true }] : []
  })()

  useEffect(() => {
    if (purchase && purchase.status === 'approved') {
      cleanup()
      showToast('Payment Verified! Unlocked 🎉')
      onSuccess && onSuccess()
      onClose()
    }
    return undefined
  }, [purchase && purchase.status])

  useEffect(() => () => cleanup(), [])

  function cleanup() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const itemLabel = target?.name

  async function payWithBalance() {
    if (!isBackendEnabled()) {
      setError('পেমেন্ট এখনো চালু নেই — একটু পরে চেষ্টা করুন')
      return
    }
    setError('')
    try {
      const payload =
        mode === 'package' ? { user_id: userId, package_key: target._fbKey } : { user_id: userId, video_id: target._fbKey || target.id }
      const res = await api.walletPay(payload)
      if (res.ok) {
        cleanup()
        showToast('Balance দিয়ে কেনা সম্পন্ন! Unlocked 🎉')
        onSuccess && onSuccess()
        onClose()
        return
      }
      setError(res.reason === 'insufficient' ? `Balance যথেষ্ট নয় (আছে: ${res.balance} USDT)` : 'কেনা সম্ভব হয়নি')
    } catch (e) {
      setError('সার্ভারে সংযোগ করা যায়নি')
    }
  }

  async function payWithBinance() {
    if (!isBackendEnabled()) {
      setError('পেমেন্ট এখনো চালু নেই — একটু পরে চেষ্টা করুন')
      return
    }
    setError('')
    try {
      const payload =
        mode === 'package' ? { user_id: userId, package_key: target._fbKey } : { user_id: userId, video_id: target._fbKey || target.id }
      const res = await api.binanceCreate(payload)
      if (!res.ok) {
        setError(res.reason === 'binance-not-configured' ? 'অ্যাডমিন এখনো Binance Pay কনফিগার করেননি' : 'Order তৈরি হয়নি')
        return
      }
      setPurchaseId(res.purchase_id)
      setCheckoutUrl(res.checkout_url)
      setStep('binance')
      const tg = window.Telegram?.WebApp
      if (res.checkout_url) {
        if (tg?.openLink) tg.openLink(res.checkout_url)
        else window.open(res.checkout_url, '_blank')
      }
      pollRef.current = setInterval(async () => {
        try {
          const check = await api.binanceCheck(res.purchase_id)
          if (check.status === 'approved') cleanup()
        } catch {
          /* keep polling */
        }
      }, 4000)
    } catch (e) {
      setError('সার্ভারে সংযোগ করা যায়নি')
    }
  }

  async function payWithBinanceId() {
    if (!isBackendEnabled()) {
      setError('পেমেন্ট এখনো চালু নেই — একটু পরে চেষ্টা করুন')
      return
    }
    if (!txnRef.trim()) {
      setError('Transfer ID লিখুন')
      return
    }
    setError('')
    try {
      const ref0 =
        mode === 'package' ? { user_id: userId, package_key: target._fbKey } : { user_id: userId, video_id: target._fbKey || target.id }
      const res = await api.binanceIdSubmit({ ...ref0, transfer_id: txnRef.trim() })
      if (!res.ok) {
        setError('Submit হয়নি — আবার চেষ্টা করুন')
        return
      }
      setPurchaseId(res.purchase_id)
      setStep('crypto-waiting')
      pollRef.current = setInterval(async () => {
        try {
          const check = await api.binanceIdCheck(res.purchase_id)
          if (check.status === 'approved') cleanup()
        } catch {
          /* keep polling */
        }
      }, 5000)
    } catch (e) {
      setError('সার্ভারে সংযোগ করা যায়নি')
    }
  }

  async function payWithCrypto() {
    if (!isBackendEnabled()) {
      setError('পেমেন্ট এখনো চালু নেই — একটু পরে চেষ্টা করুন')
      return
    }
    if (!selectedWallet) {
      setError('প্রথমে নেটওয়ার্ক সিলেক্ট করুন')
      return
    }
    if (!txnRef.trim()) {
      setError('TXID লিখুন')
      return
    }
    setError('')
    try {
      const ref0 =
        mode === 'package' ? { user_id: userId, package_key: target._fbKey } : { user_id: userId, video_id: target._fbKey || target.id }
      const res = await api.cryptoSubmit({ ...ref0, network: selectedWallet.network, txid: txnRef.trim() })
      if (!res.ok) {
        setError('Submit হয়নি — আবার চেষ্টা করুন')
        return
      }
      setPurchaseId(res.purchase_id)
      setStep('crypto-waiting')
      pollRef.current = setInterval(async () => {
        try {
          const check = await api.cryptoCheck(res.purchase_id)
          if (check.status === 'approved') cleanup()
        } catch {
          /* keep polling */
        }
      }, 5000)
    } catch (e) {
      setError('সার্ভারে সংযোগ করা যায়নি')
    }
  }

  async function payManual() {
    setError('')
    const ref0 =
      mode === 'package' ? { user_id: userId, package_key: target._fbKey } : { user_id: userId, video_id: target._fbKey || target.id }
    const payload = { ...ref0, transaction_ref: txnRef }
    let purchase_id = null
    if (isBackendEnabled()) {
      try {
        const res = await api.manualCreate(payload)
        if (res.ok) purchase_id = res.purchase_id
      } catch (e) {
        /* fallback below */
      }
    }
    if (!purchase_id) {
      const db = await getDb()
      if (!db) {
        showToast('সংযোগ সমস্যা — আবার চেষ্টা করুন')
        return
      }
      const node = await push(ref(db, 'purchases'), {
        user_id: userId,
        package_key: mode === 'package' ? target._fbKey : null,
        package_name: mode === 'package' ? target.name : null,
        video_id: mode === 'video' ? (target._fbKey || target.id) : null,
        video_name: mode === 'video' ? target.name : null,
        amount: manualAmount,
        currency: 'BDT',
        method: 'manual',
        status: 'pending',
        transaction_ref: txnRef,
        created_at: Date.now()
      })
      purchase_id = node.key
    }
    setPurchaseId(purchase_id)
    setStep('manual-waiting')
  }

  if (!mode || !target) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header-row">
          <h3 style={{ margin: 0 }}>💳 {itemLabel}</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {step === 'method' && (() => {
          const methods = [
            ...(isBackendEnabled()
              ? [{ key: 'balance', icon: 'fas fa-wallet', ico: 'balance', title: 'Balance দিয়ে কিনুন', sub: `${balance} USDT ${balance < amount ? '— অপর্যাপ্ত ব্যালেন্স, প্রথমে Deposit করুন' : 'আছে'}` }]
              : []),
            ...(payConfig.binance_enabled !== false && binancePayConfigured
              ? [
                  { key: 'binance-pay', icon: 'fas fa-bolt', ico: 'binance', title: 'Binance Pay', sub: 'চেকআউট পেজে পেমেন্ট — সম্পূর্ণ অটো ভেরিফাই' },
                  ...(binanceIds.length > 0 ? [{ key: 'binance-id', icon: 'fas fa-id-badge', ico: 'binance', title: 'Binance ID (Pay ID)', sub: 'Pay ID-তে USDT পাঠিয়ে Transfer ID দিন — অটো ভেরিফাই' }] : []),
                  ...(payConfig.crypto_enabled !== false && cryptoWallets.length > 0 ? [{ key: 'crypto', icon: 'fas fa-coins', ico: 'crypto', title: 'Crypto Wallet — TRC20/BEP20', sub: 'ঠিকানায় USDT পাঠিয়ে TXID দিন — অটো ভেরিফাই' }] : [])
                ]
              : []),
            ...(payConfig.manual_enabled !== false && mobileWallets.length > 0 ? [{ key: 'mobile', icon: 'fas fa-mobile-screen', ico: 'mobile', title: 'মোবাইল ওয়ালেট', sub: 'bKash / নগদ / রকেট — অ্যাডমিন ভেরিফাই' }] : [])
          ]
          const sel = methods.find(m => m.key === method)
          function selectMethod(key) {
            setMethod(key)
            setDropOpen(false)
            setError('')
            if (key === 'binance-id') { setTxnRef(''); setStep('binance-id') }
            else if (key === 'crypto') { setTxnRef(''); setSelectedWallet(null); setStep('crypto') }
            else if (key === 'mobile') { setTxnRef(''); setStep('manual') }
          }
          return (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {mode === 'package' ? 'প্রিমিয়াম প্যাকেজ' : 'এই ভিডিও'} কিনুন — অ্যাড দেখার দরকার নেই
              </p>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary)', marginBottom: 14 }}>
                {manualAmount ? `${manualAmount} ৳` : `${amount} USDT`}
              </div>
              {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
              {methods.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '14px 0' }}>
                  পেমেন্ট এখনো চালু নেই — একটু পরে চেষ্টা করুন
                </div>
              ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                মেথড — ফিল্ডে ক্লিক করে লিস্ট থেকে সিলেক্ট করুন
              </div>
              )}
              <div className="method-wrap">
                <button type="button" className="method-trigger" aria-expanded={dropOpen} onClick={() => setDropOpen(o => !o)}>
                  {sel ? (
                    <>
                      <span className={`p-ico ${sel.ico}`}><i className={sel.icon} aria-hidden="true" /></span>
                      <span className="m-body"><span className="m-t">{sel.title}</span><span className="m-s">{sel.sub}</span></span>
                    </>
                  ) : (
                    <span className="m-body"><span className="m-t" style={{ color: 'var(--text-muted)' }}>মেথড বাছুন</span></span>
                  )}
                  <i className={`fas fa-chevron-${dropOpen ? 'up' : 'down'} m-chev`} aria-hidden="true" />
                </button>
                {dropOpen && (
                  <div className="method-drop">
                    {methods.map(m => (
                      <button key={m.key} type="button" className={`m-row ${method === m.key ? 'sel' : ''}`} onClick={() => selectMethod(m.key)}>
                        <span className={`p-ico ${m.ico}`}><i className={m.icon} aria-hidden="true" /></span>
                        <span className="m-body"><span className="m-t">{m.title}</span><span className="m-s">{m.sub}</span></span>
                        {method === m.key && <i className="fas fa-check-circle m-check" aria-hidden="true" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {(method === 'balance' || method === 'binance-pay') && (
                <button
                  className="pay-method-btn"
                  style={{ marginTop: 12, opacity: method === 'balance' && balance < amount ? 0.55 : 1 }}
                  disabled={method === 'balance' && balance < amount}
                  onClick={method === 'balance' ? payWithBalance : payWithBinance}
                >
                  <i className="fas fa-check" aria-hidden="true" /> {method === 'balance' ? 'Balance দিয়ে কিনুন' : 'Continue — Binance Checkout খুলুন'}
                </button>
              )}
            </>
          )
        })()}

        {step === 'binance-id' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fbbf24', marginBottom: 12 }}>
              পরিমাণ: {amount} USDT
            </div>
            <div className="crypto-wallet-list">
              {binanceIds.map((p, i) => (
                <div key={i} className="crypto-wallet-row" style={{ cursor: 'default' }}>
                  <span className="crypto-net" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>PAY ID</span>
                  <span className="crypto-addr" style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{p.id}</span>
                  <button
                    className="copy-btn"
                    style={{ margin: 0 }}
                    onClick={() => {
                      navigator.clipboard?.writeText(p.id)
                      setCopied(p.id)
                      setTimeout(() => setCopied(''), 1500)
                    }}
                  >
                    {copied === p.id ? '✔' : <i className="far fa-copy" />}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
              Binance-এ এই Pay ID-তে <b>{amount} USDT</b> পাঠান, তারপর Transfer/TXID নিচে লিখুন — <b>অটো ভেরিফাই</b> হবে ✅
            </div>
            <input
              type="text"
              value={txnRef}
              onChange={e => setTxnRef(e.target.value)}
              placeholder="Binance Transfer ID / TXID"
              className="modal-input"
            />
            <div style={{ fontSize: 11.5, color: '#34d399', marginTop: -4, marginBottom: 8 }}>
              💡 দামের বেশি পাঠালে সমস্যা নেই — অতিরিক্ত টাকা আপনার Balance-এ জমা হবে
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
            <button className="pay-method-btn" onClick={payWithBinanceId} disabled={!txnRef.trim()}>
              <i className="fas fa-check" /> পেমেন্ট করেছি, সাবমিট করুন
            </button>
            <button className="modal-close" style={{ marginTop: 8, width: '100%' }} onClick={() => { setStep('method'); setTxnRef('') }}>
              ← Binance মাধ্যমে ফিরে যান
            </button>
          </>
        )}

        {step === 'crypto' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981', marginBottom: 12 }}>
              পরিমাণ: {amount} USDT
            </div>
            <div className="crypto-wallet-list">
              {cryptoWallets.map((w, i) => (
                <button
                  key={i}
                  className={`crypto-wallet-row ${selectedWallet?.address === w.address ? 'active' : ''}`}
                  onClick={() => setSelectedWallet(w)}
                >
                  <span className="crypto-net">{w.network}</span>
                  <span className="crypto-addr">{w.address?.slice(0, 10)}...{w.address?.slice(-6)}</span>
                  <i className={`fas ${selectedWallet?.address === w.address ? 'fa-check-circle' : 'fa-chevron-right'}`} />
                </button>
              ))}
            </div>
            {selectedWallet && (
              <div className="manual-info" style={{ margin: '12px 0' }}>
                <div><b>{selectedWallet.network}</b>-এ ঠিক <b>{amount} USDT</b> পাঠান:</div>
                <div style={{ wordBreak: 'break-all', marginTop: 6, fontSize: 12 }}>{selectedWallet.address}</div>
                <button
                  className="copy-btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(selectedWallet.address)
                    setCopied(selectedWallet.address)
                    setTimeout(() => setCopied(''), 1500)
                  }}
                >
                  <i className="far fa-copy" /> {copied === selectedWallet.address ? 'Copy হয়েছে!' : 'Address Copy'}
                </button>
              </div>
            )}
            <input
              type="text"
              value={txnRef}
              onChange={e => setTxnRef(e.target.value)}
              placeholder="TXID লিখুন (Transaction Hash)"
              className="modal-input"
            />
            <div style={{ fontSize: 11.5, color: '#34d399', marginTop: -4, marginBottom: 8 }}>
              💡 দামের বেশি পাঠালে সমস্যা নেই — অতিরিক্ত টাকা আপনার Balance-এ জমা হবে
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
            <button className="pay-method-btn" onClick={payWithCrypto} disabled={!selectedWallet || !txnRef.trim()}>
              <i className="fas fa-check" /> পেমেন্ট করেছি, সাবমিট করুন
            </button>
            <button className="modal-close" style={{ marginTop: 8, width: '100%' }} onClick={() => { setStep('method'); setTxnRef('') }}>
              ← Binance মাধ্যমে ফিরে যান
            </button>
          </>
        )}

        {step === 'crypto-waiting' && (
          <>
            <div className="manual-info">
              <div><b>{selectedWallet?.network}</b> — TXID: {txnRef.slice(0, 14)}...</div>
              <div style={{ marginTop: 6 }}>পরিমাণ: <b>{amount} USDT</b></div>
            </div>
            <div className="waiting-row">
              <i className="fas fa-circle-notch fa-spin" /> অটো ভেরিফাই চলছে (১–৫ মিনিট)...
            </div>
            <button className="modal-close" style={{ width: '100%' }} onClick={onClose}>
              ঠিক আছে
            </button>
          </>
        )}

        {step === 'manual' && (
          <>
            <div className="manual-info">
              <div>পরিমাণ: <b>{manualAmount} ৳</b></div>
            </div>
            <div className="crypto-wallet-list">
              {mobileWallets.map((w, i) => (
                <div key={i} className="crypto-wallet-row" style={{ cursor: 'default' }}>
                  <span className="crypto-net" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6' }}>{w.type}</span>
                  <span className="crypto-addr" style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{w.number}</span>
                  <button
                    className="copy-btn"
                    style={{ margin: 0 }}
                    onClick={() => {
                      navigator.clipboard?.writeText(w.number)
                      setCopied(w.number)
                      setTimeout(() => setCopied(''), 1500)
                    }}
                  >
                    {copied === w.number ? '✔' : <><i className="far fa-copy" /></>}
                  </button>
                </div>
              ))}
            </div>
            {payConfig.manual_instructions && <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>{payConfig.manual_instructions}</div>}
            <input
              type="text"
              value={txnRef}
              onChange={e => setTxnRef(e.target.value)}
              placeholder="Transaction ID / রেফারেন্স লিখুন"
              className="modal-input"
            />
            {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
            <button className="pay-method-btn" onClick={payManual}>
              <i className="fas fa-check" /> পেমেন্ট করেছি, সাবমিট করুন
            </button>
            <button className="modal-close" style={{ marginTop: 8, width: '100%' }} onClick={() => { setStep('method'); setTxnRef('') }}>
              ← গেটওয়ে বাছাইয়ে ফিরুন
            </button>
          </>
        )}

        {step === 'binance' && (
          <>
            <p style={{ fontSize: 13, color: '#ddd' }}>Binance Checkout পেজে পেমেন্ট সম্পূর্ণ করুন। পেমেন্ট হলে অটো আনলক হবে।</p>
            {checkoutUrl && (
              <button
                className="pay-method-btn"
                onClick={() => {
                  const tg = window.Telegram?.WebApp
                  if (tg?.openLink) tg.openLink(checkoutUrl)
                  else window.open(checkoutUrl, '_blank')
                }}
              >
                <i className="fas fa-external-link" /> Checkout আবার খুলুন
              </button>
            )}
            <div className="waiting-row">
              <i className="fas fa-circle-notch fa-spin" /> পেমেন্ট অটো ভেরিফাই চলছে...
            </div>
          </>
        )}

        {step === 'manual-waiting' && (
          <>
            <div className="manual-info">
              <div>পরিমাণ: <b>{manualAmount} ৳</b></div>
              <div style={{ marginTop: 6 }}>পাঠানোর নাম্বার: <b>{mobileWallets[0]?.number || '—'}</b></div>
              {payConfig.manual_instructions && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>{payConfig.manual_instructions}</div>}
            </div>
            <div className="waiting-row">
              <i className="fas fa-hourglass-half" /> অ্যাডমিন অ্যাপ্রুভ করলেই আনলক হয়ে যাবে
            </div>
            <button className="pay-method-btn" onClick={onClose}>
              ঠিক আছে
            </button>
          </>
        )}
      </div>
    </div>
  )
}
