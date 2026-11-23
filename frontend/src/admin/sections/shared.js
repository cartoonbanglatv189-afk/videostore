import { push, ref, remove, update, set } from 'firebase/database'
import { db } from '../../firebase'
import { api, isBackendEnabled } from '../../api'

export async function confirmDelete(path, apiDelete, id) {
  if (!window.confirm('Delete?')) return
  if (isBackendEnabled() && apiDelete) {
    try {
      await apiDelete(id)
      return
    } catch (e) {
      console.error('Backend delete failed, falling back to direct write', e)
    }
  }
  remove(ref(db, path + '/' + id))
}

export async function writeWithFallback(path, value, apiCall, payload) {
  if (isBackendEnabled() && apiCall) {
    try {
      const res = await apiCall(payload)
      if (res && res.ok !== false) return res
    } catch (e) {
      console.error('Backend write failed, falling back to direct write', e)
    }
  }
  return push(ref(db, path), value)
}

export { update, set, ref, db }

export async function applyPurchaseClientSide(purchase) {
  const DAY_MS = 86400000
  const ent = purchase.user_id ? { } : null
  if (!ent) return
  const path = 'user_entitlements/' + purchase.user_id
  const { get } = await import('firebase/database')
  const snap = await get(ref(db, path))
  const current = snap.val() || {}
  const updates = {}
  if (purchase.video_id) {
    updates['videos_unlocked/' + purchase.video_id] = true
  }
  if (purchase.package_key) {
    const pkgSnap = await get(ref(db, 'packages/' + purchase.package_key))
    const pkg = pkgSnap.val() || {}
    updates.video_unlock_credits = Number(current.video_unlock_credits || 0) + Number(pkg.video_count || 0)
    const days = Number(pkg.duration_days || 0)
    if (days > 0) {
      const base = Math.max(Number(current.membership_until || 0), Date.now())
      updates.membership_until = base + days * DAY_MS
    }
  }
  if (Object.keys(updates).length) await update(ref(db, path), updates)
}
