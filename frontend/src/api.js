const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '')
const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY || ''

export const isBackendEnabled = () => Boolean(BACKEND_URL)

function headers() {
  const h = { 'Content-Type': 'application/json' }
  if (ADMIN_KEY) h['x-admin-key'] = ADMIN_KEY
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
  }
}
