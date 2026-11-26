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
  const [step, setStep] = useState('checkout') // checkout | details | binance-id | crypto | manual | binance | crypto-waiting | manual-waiting
  const [detail, setDetail] = useState(null)   // selected method for the details screen
  const [sender, setSender] = useState('')
  const [purchaseId, setPurchaseId] = useState(null)
  const [checkoutUrl, setCheckoutUrl] = useState('')
  const [txnRef, setTxnRef] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [selectedWallet, setSelectedWallet] = useState(null)
  const [selectedPayId, setSelectedPayId] = useState('')
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
  const itemId = mode === 'package' ? target?._fbKey : (target?._fbKey || target?.id)

  async function payWithBalance() {
    if (!isBackendEnabled()) {
      setError('Payments are not available right now — please try again later.')
      return
    }
    setError('')
    try {
      const payload =
        mode === 'package' ? { user_id: userId, package_key: target._fbKey } : { user_id: userId, video_id: target._fbKey || target.id }
      const res = await api.walletPay(payload)
      if (res.ok) {
        cleanup()
        showToast('Paid with Balance! Unlocked 🎉')
        onSuccess && onSuccess()
        onClose()
        return
      }
      setError(res.reason === 'insufficient' ? `Insufficient balance (You have: ${res.balance} USDT)` : 'Purchase failed')
    } catch (e) {
      setError('Could not connect to the server')
    }
  }

  async function payWithBinance() {
    if (!isBackendEnabled()) {
      setError('Payments are not available right now — please try again later.')
      return
    }
    setError('')
    try {
      const payload =
        mode === 'package' ? { user_id: userId, package_key: target._fbKey } : { user_id: userId, video_id: target._fbKey || target.id }
      const res = await api.binanceCreate(payload)
      if (!res.ok) {
        setError(res.reason === 'binance-not-configured' ? 'Binance Pay is not available yet — please try a different method' : 'Order could not be created')
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
      setError('Could not connect to the server')
    }
  }

  async function payWithBinanceId() {
    if (!isBackendEnabled()) {
      setError('Payments are not available right now — please try again later.')
      return
    }
    if (!txnRef.trim()) {
      setError('Please enter the Transfer ID')
      return
    }
    setError('')
    try {
      const ref0 =
        mode === 'package' ? { user_id: userId, package_key: target._fbKey } : { user_id: userId, video_id: target._fbKey || target.id }
      const res = await api.binanceIdSubmit({ ...ref0, transfer_id: txnRef.trim() })
      if (!res.ok) {
        setError('Submit failed — please try again')
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
      setError('Could not connect to the server')
    }
  }

  async function payWithCrypto() {
    if (!isBackendEnabled()) {
      setError('Payments are not available right now — please try again later.')
      return
    }
    const wallet0 = detail?.wallet || selectedWallet
    if (!wallet0 || !wallet0.network) {
      setError('Please select a network first')
      return
    }
    if (!txnRef.trim()) {
      setError('Please enter the Transaction ID (TXID)')
      return
    }
    setError('')
    try {
      const ref0 =
        mode === 'package' ? { user_id: userId, package_key: target._fbKey } : { user_id: userId, video_id: target._fbKey || target.id }
      const res = await api.cryptoSubmit({ ...ref0, network: wallet0.network, txid: txnRef.trim() })
      if (!res.ok) {
        setError('Submit failed — please try again')
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
      setError('Could not connect to the server')
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
        showToast('Connection problem — please try again')
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

  function copyVal(v) {
    navigator.clipboard?.writeText(v)
    setCopied(v)
    setTimeout(() => setCopied(''), 1500)
  }

  function openDetails(d) {
    setDetail(d)
    setError('')
    setTxnRef('')
    setSender('')
    if (d.kind === 'binance-id') setSelectedPayId(binanceIds[0]?.id || '')
    if (d.kind === 'crypto') setSelectedWallet(d.wallet)
    setStep(d.kind === 'binance-pay' ? 'binance' : 'details')
    if (d.kind === 'binance-pay') payWithBinance()
  }

  if (!mode || !target) return null

  const intlMethods = [
    ...(binancePayConfigured ? [{ key: 'binance-pay', kind: 'binance-pay', icon: 'B+', iconClass: 'binance', name: 'Binance Pay', sub: 'Auto verify' }] : []),
    ...(binanceIds.length > 0 ? [{ key: `payid-${binanceIds[0].id}`, kind: 'binance-id', icon: 'B', iconClass: 'binance', name: 'Binance Pay ID', sub: 'Send USDT → Transfer ID' }] : []),
    ...cryptoWallets.map(w => ({
      key: `crypto-${w.network}`,
      kind: 'crypto',
      icon: '₮',
      iconClass: 'usdt',
      name: `USDT ${w.network}`,
      sub: w.network === 'TRC20' ? 'TRON Network' : w.network === 'BEP20' ? 'BNB Network' : w.network === 'ERC20' ? 'Ethereum' : `${w.network} Network`,
      wallet: w
    }))
  ]
  const bdMethods = mobileWallets.map(w => ({
    key: `mob-${w.type}-${w.number}`,
    kind: 'mobile',
    icon: (w.type || 'b')[0].toUpperCase(),
    iconClass: /bkash/i.test(w.type) ? 'bkash' : /nagad/i.test(w.type) ? 'nagad' : /rocket/i.test(w.type) ? 'rocket' : 'other',
    name: w.type,
    sub: 'Mobile Banking',
    wallet: w
  }))

  const cur = mode === 'package' && manualAmount ? '৳' : ''
  const payAmt = mode === 'package' && manualAmount ? `${manualAmount} ৳` : `${amount} USDT`

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card ck-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header-row">
          <h3 style={{ margin: 0 }}>💳 {mode === 'package' ? 'Premium Package' : 'Video Purchase'}</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* ============ CHECKOUT ============ */}
        {step === 'checkout' && (
          <>
            <div className="ck-title">Complete Your Order</div>
            <p className="ck-muted" style={{ marginTop: -4 }}>Review your order and select a payment method.</p>

            <div className="ck-card">
              <div className="ck-product">
                <div style={{ minWidth: 0 }}>
                  <h3>{itemLabel}</h3>
                  <div className="ck-muted">Item ID: {String(itemId || '').slice(0, 12)}</div>
                  <div className="ck-muted">Quantity: 1</div>
                </div>
                <div className="ck-price">{payAmt}</div>
              </div>
              <div className="ck-line" />
              <div className="ck-row"><span>Subtotal</span><b>{payAmt}</b></div>
              <div className="ck-row"><span>Discount</span><b>0</b></div>
              <div className="ck-line" />
              <div className="ck-row ck-total"><span>Total Amount</span><span>{payAmt}</span></div>
            </div>

            {isBackendEnabled() && (
              <div className="ck-card" style={{ marginTop: 12 }}>
                <div className="ck-row" style={{ margin: 0 }}>
                  <span>
                    <i className="fas fa-wallet" aria-hidden="true" style={{ color: 'var(--primary-2)', marginRight: 6 }} />
                    Wallet Balance
                  </span>
                  <b>{balance} USDT</b>
                </div>
                {balance >= amount && amount > 0 ? (
                  <button className="ck-primary" style={{ marginTop: 12 }} onClick={payWithBalance}>
                    Buy with Balance — Instant (no payment)
                  </button>
                ) : (
                  <p className="ck-muted" style={{ margin: '8px 0 0' }}>
                    Balance is insufficient — pay by any method below, or deposit more from Profile → Deposit.
                  </p>
                )}
              </div>
            )}

            {intlMethods.length > 0 && (
              <>
                <div className="ck-group">International Payment</div>
                <div className="ck-methods">
                  {intlMethods.map(m => (
                    <button key={m.key} className="ck-method" onClick={() => openDetails(m)}>
                      <div className={`ck-icon ${m.iconClass}`}>{m.icon}</div>
                      <b>{m.name}</b>
                      <small>{m.sub}</small>
                    </button>
                  ))}
                </div>
              </>
            )}

            {bdMethods.length > 0 && (
              <>
                <div className="ck-group">Bangladesh Payment</div>
                <div className="ck-methods">
                  {bdMethods.map(m => (
                    <button key={m.key} className="ck-method" onClick={() => openDetails(m)}>
                      <div className={`ck-icon ${m.iconClass}`}>{m.icon}</div>
                      <b>{m.name}</b>
                      <small>{m.sub}</small>
                    </button>
                  ))}
                </div>
              </>
            )}

            {intlMethods.length === 0 && bdMethods.length === 0 && (
              <p className="ck-muted" style={{ padding: '14px 0' }}>
                No payment methods are available yet — please try again later.
              </p>
            )}

            {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}
          </>
        )}

        {/* ============ PAYMENT DETAILS ============ */}
        {step === 'details' && detail && (
          <>
            <button
              className="ck-back"
              onClick={() => { setStep('checkout'); setDetail(null); setTxnRef(''); setSender('') }}
            >
              ← Back to Checkout
            </button>

            <div className="ck-card">
              <div className="ck-title" style={{ fontSize: 18 }}>{detail.kind === 'crypto' ? `${detail.name} Payment` : detail.kind === 'binance-id' ? 'Binance Pay ID Payment' : `${detail.name} Payment`}</div>

              <div className="ck-notice">
                Send {payAmt} (or more — any extra goes to your Balance automatically) to the account below.
                After completing your payment, submit your Transaction ID.
              </div>

              <div className="ck-row"><span>Payment Method</span><b>{detail.kind === 'binance-id' ? 'Binance Pay ID' : detail.name}</b></div>
              <div className="ck-row ck-total"><span>Total Amount</span><span>{payAmt}</span></div>

              <label className="ck-label">Receiver Account / Wallet</label>
              <div className="ck-copyrow">
                <input
                  readOnly
                  value={detail.kind === 'binance-id' ? (selectedPayId || binanceIds[0]?.id || '') : detail.kind === 'crypto' ? detail.wallet.address : detail.wallet.number}
                />
                <button className="ck-copy" onClick={() => copyVal(detail.kind === 'binance-id' ? (selectedPayId || binanceIds[0]?.id || '') : detail.kind === 'crypto' ? detail.wallet.address : detail.wallet.number)}>
                  {copied === (detail.kind === 'binance-id' ? (selectedPayId || binanceIds[0]?.id || '') : detail.kind === 'crypto' ? detail.wallet.address : detail.wallet.number) ? '✓' : 'Copy'}
                </button>
              </div>

              {detail.kind === 'binance-id' && binanceIds.length > 1 && (
                <>
                  <label className="ck-label">Choose a Pay ID</label>
                  <div className="ck-copyrow" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    {binanceIds.map((p, i) => (
                      <button key={i} className={`ck-id-opt ${selectedPayId === p.id ? 'active' : ''}`} onClick={() => setSelectedPayId(p.id)}>
                        <span>{p.id}</span>
                        {selectedPayId === p.id && <i className="fas fa-check-circle" />}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {detail.kind !== 'mobile' && (
                <div className="ck-notice" style={{ marginTop: 10 }}>
                  {detail.kind === 'binance-id'
                    ? 'Open Binance Pay, send USDT to the Pay ID above, then copy the Transfer ID.'
                    : `Send USDT on the ${detail.name.replace('USDT ', '')} network to the address above — verify the network before transferring.`}
                </div>
              )}

              <div className="ck-line" />

              <div className="ck-title" style={{ fontSize: 15, marginBottom: 8 }}>Submit Payment Information</div>

              <label className="ck-label" style={{ marginTop: 8 }}>Your Sender Number / Account ID</label>
              <input
                className="modal-input"
                value={sender}
                onChange={e => setSender(e.target.value)}
                placeholder="Enter your number or account ID (optional)"
              />

              <label className="ck-label">Transaction ID / Hash</label>
              <input
                className="modal-input"
                value={txnRef}
                onChange={e => setTxnRef(e.target.value)}
                placeholder={detail.kind === 'binance-id' ? 'Binance Transfer ID' : 'Transaction ID / Hash (TXID)'}
              />

              {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}

              <button
                className="ck-primary"
                onClick={() => {
                  if (detail.kind === 'crypto') payWithCrypto()
                  else if (detail.kind === 'binance-id') payWithBinanceId()
                  else payManual()
                }}
                disabled={detail.kind !== 'mobile' && !txnRef.trim()}
              >
                Submit For Verification
              </button>

              <p className="ck-muted" style={{ marginTop: 10 }}>
                Your order will remain pending until payment verification.
                {detail.kind !== 'mobile' && ' Auto-verification usually takes 1–5 minutes.'}
                {detail.kind === 'mobile' && ' The admin will verify it shortly.'}
              </p>
            </div>
          </>
        )}

        {/* ============ BINANCE CHECKOUT ============ */}
        {step === 'binance' && (
          <>
            <div className="ck-card">
              <div className="ck-title" style={{ fontSize: 18 }}>Binance Pay Checkout</div>
              <div className="ck-notice">Complete the payment on the Binance checkout page. The video unlocks automatically after payment.</div>
              {checkoutUrl && (
                <button
                  className="ck-primary"
                  onClick={() => {
                    const tg = window.Telegram?.WebApp
                    if (tg?.openLink) tg.openLink(checkoutUrl)
                    else window.open(checkoutUrl, '_blank')
                  }}
                >
                  Open Binance Checkout
                </button>
              )}
              <div className="waiting-row">
                <i className="fas fa-circle-notch fa-spin" /> Auto-verifying payment...
              </div>
            </div>
            <button className="ck-back" onClick={() => { setStep('checkout'); setError('') }}>
              ← Back to Checkout
            </button>
          </>
        )}

        {/* ============ VERIFYING (auto) ============ */}
        {step === 'crypto-waiting' && (
          <div className="ck-card ck-status">
            <div className="ck-spinner" />
            <div className="ck-title" style={{ marginBottom: 4 }}>Verifying Payment…</div>
            <p className="ck-muted">Please keep this page open — we are automatically checking your payment. The video will unlock on its own the moment it is verified (usually 1–5 minutes).</p>
            <div className="ck-line" />
            <div className="ck-row"><span>Transaction ID</span><b>{txnRef.slice(0, 18)}{txnRef.length > 18 ? '…' : ''}</b></div>
            <div className="ck-row"><span>Total Amount</span><b>{payAmt}</b></div>
            <div className="ck-row"><span>Status</span><b style={{ color: 'var(--gold)' }}>Verifying…</b></div>
          </div>
        )}

        {/* ============ PENDING (admin verify) ============ */}
        {step === 'manual-waiting' && (
          <div className="ck-card ck-status">
            <div className="ck-check">◷</div>
            <div className="ck-title" style={{ marginBottom: 4 }}>Payment Submitted!</div>
            <p className="ck-muted">Your payment information has been submitted. The admin will verify it shortly.</p>
            <div className="ck-line" />
            <div className="ck-row"><span>Transaction ID</span><b>{txnRef.slice(0, 18)}{txnRef.length > 18 ? '…' : ''}</b></div>
            <div className="ck-row"><span>Total Amount</span><b>{payAmt}</b></div>
            <div className="ck-row"><span>Status</span><b style={{ color: 'var(--gold)' }}>Pending Verification</b></div>
            <button className="ck-primary" onClick={onClose}>Back To Store</button>
          </div>
        )}
      </div>
    </div>
  )
}
