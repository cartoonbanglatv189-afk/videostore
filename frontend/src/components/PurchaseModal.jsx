import { useEffect, useRef, useState } from 'react'
import { push, ref } from 'firebase/database'
import { getDb } from '../firebase'
import { api, isBackendEnabled } from '../api'
import { useFirebaseObject } from '../hooks/useFirebase'
import { useToast } from '../context/ToastContext'

export default function PurchaseModal({ mode, target, userId, onClose, onSuccess }) {
  const { showToast } = useToast()
  const payConfig = useFirebaseObject('payments_config') || {}
  const [step, setStep] = useState('method')
  const [purchaseId, setPurchaseId] = useState(null)
  const [checkoutUrl, setCheckoutUrl] = useState('')
  const [txnRef, setTxnRef] = useState('')
  const [error, setError] = useState('')
  const pollRef = useRef(null)

  const purchase = useFirebaseObject(purchaseId ? `purchases/${purchaseId}` : '__none__')

  const amount =
    mode === 'package'
      ? target.price
      : (target.price ?? payConfig.video_price) || payConfig.video_price || 0
  const manualAmount = mode === 'package' ? (target.bkash_price || target.price) : amount

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

  const itemLabel = mode === 'package' ? target.name : target.name

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
            {payConfig.binance_enabled !== false && (
              <button className="pay-method-btn" onClick={payWithBinance}>
                <i className="fab fa-bitcoin" /> Binance Pay (Auto Verify)
              </button>
            )}
            {payConfig.manual_enabled !== false && (
              <button className="pay-method-btn manual" onClick={() => { setError(''); setStep('manual') }}>
                <i className="fas fa-mobile-screen" /> bKash / ম্যানুয়াল (অ্যাডমিন ভেরিফাই)
              </button>
            )}
          </>
        )}

        {step === 'manual' && (
          <>
            <div className="manual-info">
              <div>
                <b>Send Money:</b> {payConfig.manual_phone || 'যোগাযোগ করুন'}
              </div>
              <div style={{ marginTop: 6 }}>পরিমাণ: <b>{manualAmount} ৳</b></div>
              {payConfig.manual_instructions && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>{payConfig.manual_instructions}</div>}
            </div>
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
              <div>
                <b>Send Money:</b> {payConfig.manual_phone || 'যোগাযোগ করুন'}
              </div>
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
