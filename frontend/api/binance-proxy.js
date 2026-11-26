// Vercel Serverless Function (ESM) — Binance API relay.
//
// Binance geo-blocks Render's datacenter IP (HTTP 451) and the region cannot
// be changed on free instances. This function forwards the backend's signed
// Binance calls through Vercel (Function Region = Frankfurt/Singapore).
//
// On Render set:
//   BINANCE_RELAY=https://<your-site>.vercel.app/api/binance-proxy?s=bnc9xk4vm2q7
//
// Call format:
//   /api/binance-proxy?s=<SECRET>&p=<url-encoded target path + query>

const SECRET = 'bnc9xk4vm2q7'

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'https://relay.local')
    if (url.searchParams.get('s') !== SECRET) {
      return res.status(404).json({ error: 'not-found' })
    }
    let p = url.searchParams.get('p') || ''
    p = decodeURIComponent(p)
    if (!p.startsWith('/sapi') && !p.startsWith('/binancepay')) {
      return res.status(400).json({ error: 'bad-path' })
    }
    const target = (p.startsWith('/sapi') ? 'https://api.binance.com' : 'https://bpay.binanceapi.com') + p

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
