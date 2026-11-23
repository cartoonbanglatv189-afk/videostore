import { useFirebaseObject } from './useFirebase'

export default function useEntitlements(userId) {
  const path = userId ? `user_entitlements/${userId}` : '__none__'
  return useFirebaseObject(path) || null
}
