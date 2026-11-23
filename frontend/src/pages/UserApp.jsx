import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { runTransaction, ref } from 'firebase/database'
import { getDb } from '../firebase'
import { useFirebaseList, useFirebaseObject } from '../hooks/useFirebase'
import { isBackendEnabled } from '../api'
import { ToastProvider, useToast } from '../context/ToastContext'
import LoadingOverlay from '../components/LoadingOverlay'
import BottomNav from '../components/BottomNav'
import SingleView from '../components/SingleView'
import HomeSection from './sections/HomeSection'
import LikedSection from './sections/LikedSection'
import TutorialSection from './sections/TutorialSection'
import LinksSection from './sections/LinksSection'
import useEntitlements from '../hooks/useEntitlements'
import { isVideoEntitled, hasCredits, membershipActive, videoPurchased } from '../utils/entitlements'
import PurchaseModal from '../components/PurchaseModal'
import PremiumSection from './sections/PremiumSection'
import {
  getDaily,
  getProgress,
  hasViewedEvent,
  incDaily,
  markViewedEvent,
  setProgress,
  toggleLike
} from '../utils/localStorage'

const tg = window.Telegram?.WebApp
if (tg) tg.expand()

function UserAppInner() {
  const { showToast } = useToast()

  const settingsRaw = useFirebaseObject('settings') || {}
  const settings = { ads_limit: 20, bot_app_link: '', monetag_id: '', tutorial_id: '', ...settingsRaw }
  const adsConfig = useFirebaseObject('ads_config') || {}
  const menuLinks = useFirebaseList('links')
  const filters = useFirebaseList('filters')
  const videosRaw = useFirebaseList('videos')

  const allVideos = useRef([])
  allVideos.current = [...videosRaw].reverse()

  const adsgramIds = useMemo(() => {
    const v = adsConfig.interstitial_ids
    return v ? Object.values(v) : []
  }, [adsConfig])

  const bannerAds = useMemo(() => {
    const v = adsConfig.banners
    return v ? Object.values(v) : []
  }, [adsConfig])

  const videosLenRef = useRef(-1)
  useEffect(() => {
    if (videosLenRef.current === -1) {
      videosLenRef.current = videosRaw.length
    } else if (videosRaw.length > videosLenRef.current) {
      showToast('🆕 নতুন ভিডিও যোগ হয়েছে!')
      videosLenRef.current = videosRaw.length
    } else {
      videosLenRef.current = videosRaw.length
    }
  }, [videosRaw.length, showToast])

  const [activeNav, setActiveNav] = useState('homeSec')
  const [singleVideoId, setSingleVideoId] = useState(null)
  const [purchase, setPurchase] = useState(null)
  const [overlay, setOverlay] = useState({ open: false, text: 'Processing...', sub: 'Please do not close' })
  const monetagLoaded = useRef(false)
  const currentUserId =
    tg?.initDataUnsafe?.user?.id || Math.floor(Math.random() * 90000000) + 10000000
  const entitlements = useEntitlements(currentUserId)

  // Monetag SDK inject once
  useEffect(() => {
    if (settings.monetag_id && !monetagLoaded.current) {
      const script = document.createElement('script')
      script.src = '//libtl.com/sdk.js'
      script.dataset.zone = settings.monetag_id
      script.dataset.sdk = 'show_' + settings.monetag_id
      document.head.appendChild(script)
      monetagLoaded.current = true
    }
  }, [settings.monetag_id])

  // Deep link: Telegram start_param or ?file= query
  useEffect(() => {
    const startParam = tg?.initDataUnsafe?.start_param || new URLSearchParams(window.location.search).get('file')
    if (!startParam) return
    const videoId = String(startParam).split('_')[0]
    const tryOpen = () => {
      const target = allVideos.current.find(v => v.id === videoId)
      if (target) setSingleVideoId(videoId)
      else if (videosRaw.length > 0) showToast('ভিডিওটি খুঁজে পাওয়া যায়নি!')
    }
    tryOpen()
  }, [videosRaw, showToast])

  const handleLike = useCallback(id => {
    toggleLike(id)
    window.dispatchEvent(new Event('viralzone-refresh'))
  }, [])

  const handleShare = useCallback(
    id => {
      const botLink = settings.bot_app_link || ''
      let link
      if (!botLink) {
        link = window.location.origin + window.location.pathname + '?file=' + id
        navigator.clipboard.writeText(link).then(() => showToast('Web Link Copied!'))
        return
      }
      link = `${botLink}?startapp=${id}_${currentUserId}`
      navigator.clipboard.writeText(link).then(() => showToast('Share Link Copied!'))
    },
    [settings.bot_app_link, currentUserId, showToast]
  )

  const handleOpen = useCallback(id => setSingleVideoId(id), [])

  const handleBuy = useCallback(video => {
    setPurchase({ mode: 'video', target: video })
  }, [])

  const priceLabel = video => {
    const p = video.price || settings.video_price
    return p ? `${p} USDT` : ''
  }

  const incrementViewCount = useCallback(async videoId => {
    if (hasViewedEvent(videoId)) return
    const db = await getDb()
    if (!db) return
    const vidRef = ref(db, 'videos/' + videoId + '/view_count')
    runTransaction(vidRef, current => (current || 0) + 1)
      .then(() => markViewedEvent(videoId))
      .catch(err => console.error('View update failed', err))
  }, [])

  const playMixedSequence = useCallback(
    (step, videoId, req) => {
      if (step >= 3) {
        startFinalCountdown(videoId, req)
        return
      }
      setTimeout(() => {
        if (step === 1) {
          if (settings.monetag_id) {
            setOverlay(o => ({ ...o, text: 'Loading Partner Ad...' }))
            const sdkFunc = window['show_' + settings.monetag_id]
            if (typeof sdkFunc === 'function') {
              sdkFunc()
                .then(() => playMixedSequence(step + 1, videoId, req))
                .catch(() => playMixedSequence(step + 1, videoId, req))
            } else {
              playMixedSequence(step + 1, videoId, req)
            }
          } else {
            playMixedSequence(step + 1, videoId, req)
          }
        } else {
          setOverlay(o => ({ ...o, text: 'Loading Video Ad...' }))
          if (window.Adsgram && adsgramIds.length) {
            const blockId = adsgramIds[step % adsgramIds.length]
            const AdController = window.Adsgram.init({ blockId })
            AdController.show()
              .then(() => playMixedSequence(step + 1, videoId, req))
              .catch(() => playMixedSequence(step + 1, videoId, req))
          } else {
            playMixedSequence(step + 1, videoId, req)
          }
        }
      }, 500)
    },
    [adsgramIds, settings.monetag_id]
  )

  const startFinalCountdown = useCallback(
    (videoId, req) => {
      let count = 5
      setOverlay({ open: true, text: 'Verification Successful!', sub: `Unlocking in ${count} seconds...` })
      const timer = setInterval(() => {
        count--
        if (count > 0) {
          setOverlay({ open: true, text: 'Verification Successful!', sub: `Unlocking in ${count} seconds...` })
        } else {
          clearInterval(timer)

          const currentProgress = getProgress(videoId) + 1
          setProgress(videoId, currentProgress)
          incDaily()

          if (currentProgress >= req) {
            incrementViewCount(videoId)
          }

          window.dispatchEvent(new Event('viralzone-refresh'))
          setOverlay(o => ({ ...o, open: false }))
          showToast('Unlock Successful!')
        }
      }, 1000)
    },
    [incrementViewCount, showToast]
  )

  const useCreditUnlock = useCallback(
    async video => {
      if (isBackendEnabled()) {
        try {
          const res = await api.useCredit({ user_id: currentUserId, video_id: video.id })
          if (res.ok) {
            window.dispatchEvent(new Event('viralzone-refresh'))
            showToast('ক্রেডিট ব্যবহার হয়েছে! Unlocked 🎉')
            return
          }
        } catch (e) {
          console.error('use-credit backend failed', e)
        }
      }
      try {
        const ents = entitlements || {}
        const credits = hasCredits(ents)
        if (credits <= 0) {
          showToast('কোনো ক্রেডিট নেই!')
          return
        }
        const { ref: fbRef, update: fbUpdate } = await import('firebase/database')
        const db = await getDb()
        if (!db) throw new Error('Firebase unavailable')
        await fbUpdate(fbRef(db, `user_entitlements/${currentUserId}`), {
          video_unlock_credits: credits - 1,
          [`videos_unlocked/${video.id}`]: true
        })
        window.dispatchEvent(new Event('viralzone-refresh'))
        showToast('ক্রেডিট ব্যবহার হয়েছে! Unlocked 🎉')
      } catch (e) {
        console.error('use-credit failed', e)
        showToast('ক্রেডিট ব্যবহার করা যায়নি')
      }
    },
    [currentUserId, entitlements, showToast]
  )

  const handleUnlock = useCallback(
    video => {
      const req = video.ad_watches_required || 1
      if (getProgress(video.id) >= req || videoPurchased(entitlements, video.id) || membershipActive(entitlements)) {
        window.open(video.download_link, '_blank')
        return
      }
      if (hasCredits(entitlements) > 0) {
        useCreditUnlock(video)
        return
      }
      if (getDaily() >= (settings.ads_limit || 20)) {
        showToast('Daily limit reached!')
        return
      }
      if (!isBackendEnabled() && adsgramIds.length === 0) {
        alert('Admin: Add Adsgram IDs')
        return
      }

      setOverlay({ open: true, text: 'Processing...', sub: 'Please do not close' })
      playMixedSequence(0, video.id, req)
    },
    [settings.ads_limit, adsgramIds.length, playMixedSequence, showToast, entitlements, useCreditUnlock]
  )

  const singleVideo = singleVideoId ? allVideos.current.find(v => v.id === singleVideoId) : null
  const closeSingle = useCallback(() => setSingleVideoId(null), [])

  return (
    <div className="app">
      <LoadingOverlay open={overlay.open} text={overlay.text} sub={overlay.sub} />

      <SingleView
        video={singleVideo}
        onClose={closeSingle}
        onUnlock={handleUnlock}
        onLike={handleLike}
        onShare={handleShare}
        onBuy={handleBuy}
        entitlements={entitlements}
        priceLabel={singleVideo?.price ? `${singleVideo.price} USDT` : ''}
      />

      {purchase && (
        <PurchaseModal
          mode={purchase.mode}
          target={purchase.target}
          userId={currentUserId}
          onClose={() => setPurchase(null)}
          onSuccess={() => window.dispatchEvent(new Event('viralzone-refresh'))}
        />
      )}

      <div
        id="mainContent"
        className={singleVideo ? 'hidden' : ''}
        style={{ display: singleVideo ? 'none' : 'block' }}
      >
        <div className="header">
          <h1 className="title">
            {' '}
            VIRAL ZONE VIDEO<i className="fas fa-fire" style={{ color: '#ec4899' }} />
          </h1>
          <div className="subtitle">Exclusive Premium Video</div>
        </div>

        {activeNav === 'homeSec' && (
          <HomeSection
            allVideos={allVideos.current}
            filters={filters}
            bannerAds={bannerAds}
            onUnlock={handleUnlock}
            onLike={handleLike}
            onShare={handleShare}
            onOpen={handleOpen}
            onBuy={handleBuy}
            entitlements={entitlements}
          />
        )}
        {activeNav === 'likedSec' && (
          <LikedSection
            allVideos={allVideos.current}
            onUnlock={handleUnlock}
            onLike={handleLike}
            onShare={handleShare}
            onOpen={handleOpen}
            onBuy={handleBuy}
            entitlements={entitlements}
          />
        )}
        {activeNav === 'tutSec' && <TutorialSection tutorialId={settings.tutorial_id} />}
        {activeNav === 'linkSec' && <LinksSection menuLinks={menuLinks} />}
        {activeNav === 'premiumSec' && <PremiumSection userId={currentUserId} />}
      </div>

      <BottomNav active={activeNav} onChange={setActiveNav} />
    </div>
  )
}

export default function UserApp() {
  return (
    <ToastProvider>
      <UserAppInner />
    </ToastProvider>
  )
}
