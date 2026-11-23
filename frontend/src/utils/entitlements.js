export function membershipActive(entitlements) {
  if (!entitlements) return false
  return Number(entitlements.membership_until || 0) > Date.now()
}

export function videoPurchased(entitlements, videoId) {
  if (!entitlements) return false
  const unlocked = entitlements.videos_unlocked || {}
  return Boolean(unlocked[videoId])
}

export function hasCredits(entitlements) {
  if (!entitlements) return 0
  return Number(entitlements.video_unlock_credits || 0)
}

export function isVideoEntitled(entitlements, videoId) {
  return membershipActive(entitlements) || videoPurchased(entitlements, videoId)
}
