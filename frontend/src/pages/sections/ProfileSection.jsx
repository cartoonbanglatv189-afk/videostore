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
  const appSettings = useFirebaseObject('settings') || {}
  const refCfg = useFirebaseObject('referral_config') || {}
  const myUser = useFirebaseObject(userId ? `bot_users/${userId}` : '__none__') || {}
  const allDeposits = useFirebaseList('deposits')
  const myDeposits = allDeposits.filter(d => String(d.user_id) === String(userId))
  const allPurchases = useFirebaseList('purchases')
  const myPurchases = allPurchases.filter(x => String(x.user_id) === String(userId))

  const [depAmount, setDepAmount] = useState('')
  const [depRef, setDepRef] = useState('')
  const [depMethod, setDepMethod] = useState(null)
  const [depId, setDepId] = useState(null)
  const [depError, setDepError] = useState('')
  const [copied, setCopied] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const pollRef = useRef(null)
  const [depStatus, setDepStatus] = useState(null)

  const refEnabled = refCfg.enabled !== false && (Number(refCfg.bonus_join || 0) > 0 || Number(refCfg.bonus_purchase || 0) > 0)
  const refLink = appSettings.bot_app_link
    ? `${appSettings.bot_app_link}?startapp=ref_${userId}`
    : `${window.location.origin}${window.location.pathname}?ref=${userId}`
  const refCount = Number(myUser.referrals || 0)
  const refEarned = Number(myUser.ref_earned || 0)

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
  const hasDepMethods = binanceIds.length > 0 || cryptoWallets.length > 0

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
      setDepError('ডিপোজিট এখনো চালু নেই — একটু পরে চেষ্টা করুন')
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

      {hasDepMethods && (<>
      <h4 style={{ color: '#fda4af', margin: '18px 0 8px' }}>⬇️ Deposit করুন (USDT)</h4>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-inset)', border: 'var(--border)', borderRadius: 12, padding: '10px 13px', lineHeight: 1.7, marginBottom: 12 }}>
        <b style={{ color: 'var(--text-main)' }}>How to Deposit:</b>
        <div>1. Choose a method below — Binance Pay ID or a crypto network (e.g. TRC20 / BEP20).</div>
        <div>2. Copy the Pay ID or wallet address.</div>
        <div>3. Send USDT from your Binance / crypto wallet — send an amount equal to or more than you deposit. Any extra goes to your Balance automatically.</div>
        <div>4. Copy the Transfer ID or Transaction Hash (TXID) from that payment.</div>
        <div>5. Enter the amount, paste the TXID, and tap Submit — your Balance updates automatically within 1–5 minutes.</div>
      </div>

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
      </>
      )}

            {refEnabled && (
        <div className="ad-card" style={{ marginTop: 18, borderColor: 'rgba(59, 130, 246, 0.4)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#60a5fa', marginBottom: 6 }}>
            🎁 রেফার ইনকাম — বন্ধু আনুন, টাকা জিতুন!
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
            {Number(refCfg.bonus_join || 0) > 0 && (
              <div>✉️ বন্ধু জয়েন করলেই আপনি পাবেন <b style={{ color: '#34d399' }}>{refCfg.bonus_join} USDT</b></div>
            )}
            {Number(refCfg.bonus_purchase || 0) > 0 && (
              <div>💰 বন্ধু পেমেন্ট করলে পাবেন <b style={{ color: '#34d399' }}>{refCfg.bonus_purchase} USDT</b> {String(refCfg.purchase_mode || 'first') === 'first' ? '(প্রথম কেনাকাটায়)' : '(প্রতি কেনাকাটায়)'}</div>
            )}
            টাকা সরাসরি আপনার <b>Balance</b>-এ যোগ হবে — দিয়ে যেকোনো ভিডিও/প্যাকেজ কিনতে পারবেন!
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, background: 'rgba(59,130,246,0.12)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>👥 Refer করেছেন</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa' }}>{refCount} জন</div>
            </div>
            <div style={{ flex: 1, background: 'rgba(16,185,129,0.12)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>💵 মোট ইনকাম</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#34d399' }}>{refEarned} USDT</div>
            </div>
          </div>
          <div style={{ wordBreak: 'break-all', fontSize: 12, color: '#cbd5e1', background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 10px', marginBottom: 8 }}>
            {refLink}
          </div>
          <button
            className="pay-method-btn"
            style={{ background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)' }}
            onClick={() => copyText(refLink, 'ref')}
          >
            <i className="fab fa-telegram-plane" /> {copied === 'ref' ? '✔ Link Copy হয়েছে!' : 'রেফার লিংক Copy করুন'}
          </button>
        </div>
      )}

      <h4 style={{ color: '#fda4af', margin: '18px 0 8px' }}>🧾 Deposit History</h4>
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

      <h4 style={{ color: '#fda4af', margin: '18px 0 8px' }}>💳 Payment History</h4>
      <div>
        {myPurchases.length === 0 && <p style={{ color: '#666', fontSize: 13 }}>No purchases yet.</p>}
        {[...myPurchases].reverse().map(x => {
          const item = x.video_name || x.package_name || (x.package_key ? 'Premium Package' : 'Video')
          const methodLabel = x.method === 'wallet' ? 'Balance' : x.method === 'binance_id' ? 'Binance ID' : x.method === 'binance' ? 'Binance Pay' : x.method === 'crypto' ? `USDT ${x.crypto_network || ''}` : x.method === 'manual' ? 'Mobile Banking' : x.method || ''
          return (
            <div key={x._fbKey} className="list-item payable">
              <div style={{ flex: 1, fontSize: 12, minWidth: 0 }}>
                <b>{item || 'Item'}</b> {String(x.amount ? x.amount : '')} {x.currency || 'USDT'} — {methodLabel}
                <div style={{ color: '#9ca3af' }}>
                  {x.transaction_ref ? x.transaction_ref.slice(0, 20) : ''}
                  {x.created_at ? ` · ${new Date(x.created_at).toLocaleDateString('en-GB')}` : ''}
                </div>
              </div>
              <div style={{ color: x.status === 'approved' ? '#10b981' : x.status === 'rejected' ? '#ef4444' : '#f59e0b', fontWeight: 700, fontSize: 12 }}>
                {x.status === 'approved' ? '✔ COMPLETED' : x.status === 'rejected' ? '✖ REJECTED' : '⏳ PENDING'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
