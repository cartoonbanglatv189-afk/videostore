// Vercel Serverless Function — Binance API relay.
//
// Binance geo-blocks Render's datacenter IP (HTTP 451 on every
// api.binance.com host, and the region cannot be changed on free instances).
// This function forwards signed Binance requests from the backend through
// Vercel. Set the Vercel project's Function Region to Frankfurt or Singapore
// (Settings -> Functions), then on Render add the env var:
//   BINANCE_RELAY=https://<your-site>.vercel.app/api/binance-proxy/bnc9xk4vm2q7
//
// Usage: POST/GET  /api/binance-proxy/<SECRET>/<path><query>
//   /sapi/...        -> https://api.binance.com/...
//   /binancepay/...  -> https://bpay.binanceapi.com/...

const SECRET = 'bnc9xk4vm2q7'

module.exports = async (req, res) => {
  const url = new URL(req.url, 'https://relay.local')
  const m = url.pathname.match(new RegExp(`^/api/binance-proxy/${SECRET}(/.*)$`))
  if (!m) return res.status(404).json({ error: 'not-found' })

  const path = m[1]
  const target = path.startsWith('/sapi')
    ? 'https://api.binance.com' + path + url.search
    : 'https://bpay.binanceapi.com' + path + url.search

  try {
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
    res.status(502).json({ error: 'relay-error' })
  }
}
