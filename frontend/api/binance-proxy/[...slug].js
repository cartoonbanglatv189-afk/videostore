// Vercel Serverless Function (catch-all) — Binance API relay.
//
// Binance geo-blocks Render's datacenter IP (HTTP 451) and the region cannot
// be changed on free instances. This function forwards the backend's signed
// Binance calls through Vercel (Function Region must be Frankfurt/Singapore —
// Settings -> Functions -> Function Region).
//
// On Render set:
//   BINANCE_RELAY=https://<your-site>.vercel.app/api/binance-proxy/bnc9xk4vm2q7
//
// /api/binance-proxy/<SECRET>/sapi/...       -> https://api.binance.com/...
// /api/binance-proxy/<SECRET>/binancepay/... -> https://bpay.binanceapi.com/...

const SECRET = 'bnc9xk4vm2q7'

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'https://relay.local')
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[1] !== 'binance-proxy' || parts[2] !== SECRET || parts.length < 4) {
      return res.status(404).json({ error: 'not-found' })
    }
    const path = '/' + parts.slice(3).join('/')
    const target = path.startsWith('/sapi')
      ? 'https://api.binance.com' + path + url.search
      : 'https://bpay.binanceapi.com' + path + url.search

    const r = await fetch(target, {
      method: req.method || 'GET',
      headers: {
        'X-MBX-APIKEY': req.headers['x-mbx-apikey'] || '',
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body || {}),
    })
    res.status(r.status)
    res.setHeader('Content-Type', 'application/json')
    res.send(await r.text())
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) })
  }
}
