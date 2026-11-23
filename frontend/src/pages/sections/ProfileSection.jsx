import { useEffect, useRef, useState } from 'react'
import { api, isBackendEnabled } from '../../api'
import { useFirebaseList, useFirebaseObject } from '../../hooks/useFirebase'
import { useToast } from '../../context/ToastContext'

const tg = window.Telegram?.WebApp

export default function ProfileSection({ userId }) {
  const { showToast } = useToast()
  const tgUser = tg?.initDataUnsafe?.user
  const wallet = useFirebaseObject(userId ? `user_wallets/${userId}` : '__none__') || {}
  const balance = Number(wallet.balance || 0)
  const payConfig = useFirebaseObject('payments_config') || {}
  const allDeposits = useFirebaseList('deposits')
  const myDeposits = allDeposits.filter(d => String(d.user_id) === String(userId))

  const [depAmount, setDepAmount] = useState('')
  const [depRef, setDepRef] = useState('')
  const [depMethod, setDepMethod] = useState(null)
  const [depId, setDepId] = useState(null)
  const [depError, setDepError] = useState('')
  const [copied, setCopied] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const pollRef = useRef(null)
  const [depStatus, setDepStatus] = useState(null)

  const cryptoWallets = (() => {
    const raw = payConfig.crypto_wallets
    const list = Array.isArray(raw) ? raw : Object.values(raw || {})
    return list.filter(w => w && w.address && w.on !== false)
  })()
  const binanceIds = (() => {
    const raw = payConfig.binance_pay_ids
    const list = Array.isArray(raw) ? raw : Object.values(raw || {})
    const active = list.filter(w => w && w.id && w.on !== false)
    if (active.length) return active
    return payConfig.binance_pay_id ? [{ id: payConfig.binance_pay_id, on: true }] : []
  })()

  useEffect(() => () => pollRef.current && clearInterval(pollRef.current), [])

  useEffect(() => {
    if (depStatus === 'approved') {
      showToast('💰 Deposit সফল! Balance যোগ হয়েছে')
      setDepStatus(null)
      setDepId(null)
      setDepRef('')
      setDepAmount('')
    }
  }, [depStatus, showToast])

  const copyText = (text, id) => {
    navigator.clipboard?.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(''), 1500)
  }

  const submitDeposit = async () => {
    if (!isBackendEnabled()) {
      setDepError('Deposit-এর জন্য Backend চালু থাকতে হবে')
      return
    }
    const amount = parseFloat(depAmount) || 0
    if (!depMethod || !depRef.trim() || amount <= 0) {
      setDepError('Amount, পেমেন্ট মেথড ও TXID/Transfer ID সব দিন')
      return
    }
    setDepError('')
    setSubmitting(true)
    try {
      const payload =
        depMethod.type === 'binance'
          ? { user_id: userId, method: 'binance_id', amount, ref: depRef.trim() }
          : { user_id: userId, method: 'crypto', network: depMethod.network, amount, ref: depRef.trim() }
      const res = await api.depositSubmit(payload)
      if (!res.ok) {
        setDepError('Submit হয়নি — আবার চেষ্টা করুন')
        setSubmitting(false)
        return
      }
      setDepId(res.deposit_id)
      setDepStatus('verifying')
      pollRef.current = setInterval(async () => {
        try {
          const check = await api.depositCheck(res.deposit_id)
          if (check.status === 'approved') {
            clearInterval(pollRef.current)
            pollRef.current = null
            setDepStatus('approved')
          }
        } catch {
          /* keep polling */
        }
      }, 5000)
    } catch (e) {
      setDepError('সার্ভারে সংযোগ করা যায়নি')
    }
    setSubmitting(false)
  }

  return (
    <div className="fadeIn" style={{ padding: '0 5px' }}>
      <div className="profile-card">
        {tgUser?.photo_url ? (
          <img className="profile-avatar" src={tgUser.photo_url} alt="" />
        ) : (
          <div className="profile-avatar profile-avatar-ph">
            {(tgUser?.first_name || 'U').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="profile-name">{tgUser?.first_name} {tgUser?.last_name || ''}</div>
        {tgUser?.username && <div className="profile-username">@{tgUser.username}</div>}
        <button className="profile-id" onClick={() => copyText(tgUser?.id || userId, 'uid')}>
          <i className="far fa-id-badge" /> ID: {tgUser?.id || userId}{' '}
          {copied === 'uid' ? <b style={{ color: '#34d399' }}>✔</b> : <i className="far fa-copy" />}
        </button>
      </div>

      <div className="profile-balance">
        <div className="pb-label">💰 আমার Balance</div>
        <div className="pb-amount">{balance} USDT</div>
        <div className="pb-hint">একবারে বড় অ্যামাউন্ট ডিপোজিট করে রাখতে পারেন — পরে এক ক্লিকে সব কিনবেন!</div>
      </div>

      <h4 style={{ color: '#d8b4fe', margin: '18px 0 8px' }}>⬇️ Deposit করুন (USDT)</h4>

      {depStatus === 'verifying' ? (
        <div className="manual-info">
          <div className="waiting-row">
            <i className="fas fa-circle-notch fa-spin" /> অটো ভেরিফাই চলছে (১–৫ মিনিট)...
          </div>
        </div>
      ) : (
        <div className="ad-card">
          <div className="crypto-wallet-list">
            {binanceIds.map((p, i) => (
              <button
                key={`b${i}`}
                className={`crypto-wallet-row ${depMethod?.binance === p.id ? 'active' : ''}`}
                onClick={() => { setDepMethod({ type: 'binance', id: p.id }); setDepError('') }}
              >
                <span className="crypto-net" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>PAY ID</span>
                <span className="crypto-addr">{p.id}</span>
                <i className={`fas ${depMethod?.binance === p.id ? 'fa-check-circle' : 'fa-chevron-right'}`} />
              </button>
            ))}
            {cryptoWallets.map((w, i) => (
              <button
                key={`c${i}`}
                className={`crypto-wallet-row ${depMethod?.network === w.network ? 'active' : ''}`}
                onClick={() => { setDepMethod({ type: 'crypto', network: w.network, address: w.address }); setDepError('') }}
              >
                <span className="crypto-net">{w.network}</span>
                <span className="crypto-addr">{w.address?.slice(0, 10)}...{w.address?.slice(-6)}</span>
                <i className={`fas ${depMethod?.network === w.network ? 'fa-check-circle' : 'fa-chevron-right'}`} />
              </button>
            ))}
          </div>

          {depMethod && (
            <div className="manual-info" style={{ margin: '10px 0' }}>
              {depMethod.type === 'binance' ? (
                <div>Binance-এ এই <b>Pay ID</b>-তে USDT পাঠান</div>
              ) : (
                <>
                  <div><b>{depMethod.network}</b>-এ নিচের অ্যাড্রেসে USDT পাঠান:</div>
                  <div style={{ wordBreak: 'break-all', marginTop: 6, fontSize: 12 }}>
                    {cryptoWallets.find(w => w.network === depMethod.network)?.address}
                  </div>
                </>
              )}
              <button className="copy-btn" onClick={() => copyText(depMethod.type === 'binance' ? depMethod.id : depMethod.address, 'dep')}>
                {copied === 'dep' ? '✔ Copy হয়েছে!' : <><i className="far fa-copy" /> Copy</>}
              </button>
            </div>
          )}

          <input type="number" value={depAmount} onChange={e => setDepAmount(e.target.value)} placeholder="ডিপোজিট Amount (USDT)" className="modal-input" />
          <input
            type="text"
            value={depRef}
            onChange={e => setDepRef(e.target.value)}
            placeholder={depMethod?.type === 'binance' ? 'Binance Transfer ID' : 'TXID (Transaction Hash)'}
            className="modal-input"
          />
          {depError && <p style={{ color: '#ef4444', fontSize: 13 }}>{depError}</p>}
          <button className="pay-method-btn" onClick={submitDeposit} disabled={submitting || !depMethod || !depRef.trim() || !(parseFloat(depAmount) > 0)}>
            <i className="fas fa-check" /> পেমেন্ট করেছি, Deposit সাবমিট
          </button>
        </div>
      )}

      <h4 style={{ color: '#d8b4fe', margin: '18px 0 8px' }}>🧾 Deposit History</h4>
      <div>
        {myDeposits.length === 0 && <p style={{ color: '#666', fontSize: 13 }}>এখনও কোনো deposit নেই</p>}
        {[...myDeposits].reverse().map(d => (
          <div key={d._fbKey} className="list-item payable">
            <div style={{ flex: 1, fontSize: 12 }}>
              <b>{d.amount} USDT</b> — {d.method === 'binance_id' ? 'Binance ID' : d.crypto_network || 'Crypto'}
              <div style={{ color: '#9ca3af' }}>{d.transaction_ref?.slice(0, 20)}</div>
            </div>
            <div style={{ color: d.status === 'approved' ? '#10b981' : d.status === 'rejected' ? '#ef4444' : '#f59e0b', fontWeight: 700, fontSize: 12 }}>
              {d.status === 'approved' ? '✔ APPROVED' : d.status === 'rejected' ? '✖ REJECTED' : '⏳ PENDING'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
