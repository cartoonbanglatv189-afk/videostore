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
  const [purchaseId, setPurchaseId] = useState(null)
  const [checkoutUrl, setCheckoutUrl] = useState('')
  const [txnRef, setTxnRef] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [selectedWallet, setSelectedWallet] = useState(null)
  const pollRef = useRef(null)

  const purchase = useFirebaseObject(purchaseId ? `purchases/${purchaseId}` : '__none__')

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
      setError('Backend চালু থাকতে হবে')
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
      setError('Binance Pay এর জন্য Backend চালু থাকতে হবে')
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
      setError('Backend চালু থাকতে হবে')
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
      setError('Crypto payment-এর জন্য Backend চালু থাকতে হবে')
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
        showToast('Firebase unavailable!')
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

        {step === 'method' && (
          <>
            <p style={{ color: '#9ca3af', fontSize: 13 }}>
              {mode === 'package' ? 'প্রিমিয়াম প্যাকেজ' : 'এই ভিডিও'} কিনুন — অ্যাড দেখার দরকার নেই
            </p>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#a855f7', marginBottom: 15 }}>
              {manualAmount ? `${manualAmount} ৳` : `${amount} USDT`}
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
            {isBackendEnabled() && (
              <button
                className="pay-method-btn crypto"
                style={{ background: 'linear-gradient(135deg, #0d9488, #14b8a6)' }}
                disabled={balance < amount}
                onClick={payWithBalance}
              >
                <i className="fas fa-wallet" /> Balance দিয়ে কিনুন ({balance} USDT)
              </button>
            )}
            {payConfig.binance_enabled !== false && (
              <button className="pay-method-btn" onClick={payWithBinance}>
                <i className="fab fa-bitcoin" /> Binance Pay (Auto Verify)
              </button>
            )}
            {payConfig.crypto_enabled !== false && cryptoWallets.length > 0 && (
              <button className="pay-method-btn crypto" onClick={() => { setError(''); setStep('crypto') }}>
                <i className="fas fa-coins" /> Crypto — TRC20/BEP20 (Auto Verify)
              </button>
            )}
            {binanceIds.length > 0 && (
              <button className="pay-method-btn crypto" style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)' }} onClick={() => { setError(''); setStep('binance-id') }}>
                <i className="fas fa-id-badge" /> Binance ID দিয়ে পাঠান (USDT)
              </button>
            )}
            {payConfig.manual_enabled !== false && (
              <button className="pay-method-btn manual" onClick={() => { setError(''); setStep('manual') }}>
                <i className="fas fa-mobile-screen" /> bKash / ম্যানুয়াল (অ্যাডমিন ভেরিফাই)
              </button>
            )}
          </>
        )}

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
            {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
            <button className="pay-method-btn" onClick={payWithBinanceId} disabled={!txnRef.trim()}>
              <i className="fas fa-check" /> পেমেন্ট করেছি, সাবমিট করুন
            </button>
            <button className="modal-close" style={{ marginTop: 8, width: '100%' }} onClick={() => { setStep('method'); setTxnRef('') }}>
              ← ফিরে যান
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
            {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
            <button className="pay-method-btn" onClick={payWithCrypto} disabled={!selectedWallet || !txnRef.trim()}>
              <i className="fas fa-check" /> পেমেন্ট করেছি, সাবমিট করুন
            </button>
            <button className="modal-close" style={{ marginTop: 8, width: '100%' }} onClick={() => { setStep('method'); setTxnRef('') }}>
              ← ফিরে যান
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
              {mobileWallets.length === 0 && (
                <div style={{ color: '#9ca3af', fontSize: 12 }}>এখনও কোনো নাম্বার সেট করা হয়েছে না — অ্যাডমিন প্যানেলে যোগ করুন</div>
              )}
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
