const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')

export const isBackendEnabled = () => Boolean(BACKEND_URL)

export const getAdminKey = () => sessionStorage.getItem('admin_key') || ''

export const setAdminKey = key => {
  if (key) sessionStorage.setItem('admin_key', key)
  else sessionStorage.removeItem('admin_key')
}

function headers() {
  const h = { 'Content-Type': 'application/json' }
  const key = getAdminKey()
  if (key) h['x-admin-key'] = key
  return h
}

async function request(path, options = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: headers()
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

export const api = {
  async verifyKey(key) {
    if (!isBackendEnabled()) {
      return key && key === (import.meta.env.VITE_ADMIN_KEY || '') ? 'ok' : 'wrong-key'
    }
    let res
    try {
      res = await fetch(`${BACKEND_URL}/admin/verify`, {
        headers: { 'x-admin-key': key }
      })
    } catch {
      return 'backend-down'
    }
    if (res.ok) return 'ok'
    if (res.status === 401) return 'wrong-key'
    if (res.status === 403) return 'admin-key-missing'
    return 'backend-error'
  },
  async cryptoSubmit(payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/payments/crypto/submit', { method: 'POST', body: JSON.stringify(payload) })
  },
  async binanceIdSubmit(payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/payments/binance-id/submit', { method: 'POST', body: JSON.stringify(payload) })
  },
  async binanceIdCheck(purchaseId) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/payments/binance-id/check/${purchaseId}`)
  },
  async depositSubmit(payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/payments/deposits/submit', { method: 'POST', body: JSON.stringify(payload) })
  },
  async depositCheck(depositId) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/payments/deposits/check/${depositId}`)
  },
  async approveDeposit(depositId) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/payments/deposits/${depositId}/approve`, { method: 'POST' })
  },
  async rejectDeposit(depositId) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/payments/deposits/${depositId}/reject`, { method: 'POST' })
  },
  async walletPay(payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/payments/wallet/pay', { method: 'POST', body: JSON.stringify(payload) })
  },
  async cryptoCheck(purchaseId) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/payments/crypto/check/${purchaseId}`)
  },
  async createVideo(payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/videos', { method: 'POST', body: JSON.stringify(payload) })
  },
  async deleteVideo(id) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/videos/${id}`, { method: 'DELETE' })
  },
  async addFilter(payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/filters', { method: 'POST', body: JSON.stringify(payload) })
  },
  async deleteFilter(id) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/filters/${id}`, { method: 'DELETE' })
  },
  async addLink(payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/links', { method: 'POST', body: JSON.stringify(payload) })
  },
  async deleteLink(id) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/links/${id}`, { method: 'DELETE' })
  },
  async saveMonetag(monetag_id) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/ads/monetag', { method: 'PUT', body: JSON.stringify({ monetag_id }) })
  },
  async addAdsgramId(id) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/ads/interstitial_ids', { method: 'POST', body: JSON.stringify({ id }) })
  },
  async deleteAdsgramId(itemId) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/ads/interstitial_ids/${itemId}`, { method: 'DELETE' })
  },
  async addBanner(html) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/ads/banners', { method: 'POST', body: JSON.stringify({ html }) })
  },
  async deleteBanner(itemId) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/ads/banners/${itemId}`, { method: 'DELETE' })
  },
  async saveSettings(payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/settings', { method: 'PUT', body: JSON.stringify(payload) })
  },
  async createPackage(payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/packages', { method: 'POST', body: JSON.stringify(payload) })
  },
  async editPackage(id, payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/packages/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
  },
  async deletePackage(id) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/packages/${id}`, { method: 'DELETE' })
  },
  async savePaymentsConfig(payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/payments/config', { method: 'PUT', body: JSON.stringify(payload) })
  },
  async binanceCreate(payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/payments/binance/create', { method: 'POST', body: JSON.stringify(payload) })
  },
  async binanceCheck(purchaseId) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/payments/binance/check/${purchaseId}`)
  },
  async manualCreate(payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/payments/manual/create', { method: 'POST', body: JSON.stringify(payload) })
  },
  async approveManual(purchaseId) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/payments/manual/${purchaseId}/approve`, { method: 'POST' })
  },
  async rejectManual(purchaseId) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/payments/manual/${purchaseId}/reject`, { method: 'POST' })
  },
  async useCredit(payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/payments/use-credit', { method: 'POST', body: JSON.stringify(payload) })
  },
  async registerUser(payload) {
    if (!isBackendEnabled()) return { ok: false, reason: 'backend-disabled' }
    return request('/users/register', { method: 'POST', body: JSON.stringify(payload) })
  },
  async checkJoin(userId) {
    if (!isBackendEnabled()) return { required: false, joined: true }
    return request(`/telegram/check-join/${userId}`)
  },
  async rateVideo(videoId, payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/videos/${videoId}/rate`, { method: 'POST', body: JSON.stringify(payload) })
  },
  async getStats() {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/admin/stats')
  },
  async sendBroadcast(text) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request('/admin/broadcast', { method: 'POST', body: JSON.stringify({ text }) })
  },
  async commentVideo(videoId, payload) {
    if (!isBackendEnabled()) throw new Error('backend-disabled')
    return request(`/videos/${videoId}/comment`, { method: 'POST', body: JSON.stringify(payload) })
  }
}
