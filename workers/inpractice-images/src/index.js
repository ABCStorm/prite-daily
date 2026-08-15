/**
 * Public media server for "In practice" scenario illustrations and short videos.
 *
 * WHY PUBLIC (unlike workers/textbook-images, which is Supabase-gated): these are
 * AI-generated originals drawn from the app's own `clinical_application` text --
 * no third-party copyright, no question stems, no answers, no PII. The app's
 * existing `/images/...` set is already public for the same reason. Serving them
 * openly means the app can use a plain <img>/<video src>, and Cloudflare's edge
 * cache does the work for free.
 *
 * GET /i/<year>-<qindex>.webp   still illustrations  e.g. /i/2017-0032.webp
 * GET /v/<year>-<qindex>.mp4    short scenario clips e.g. /v/2010-0094.mp4
 * GET /healthz                  liveness + object spot-check
 */

const ALLOWED_ORIGINS = ['https://pritedaily.com', 'https://www.pritedaily.com']
const ALLOWED_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)?prite-daily\.pages\.dev$|^http:\/\/localhost:\d+$/

function cors(origin) {
  // Media is public, so a permissive default is fine; we still echo known
  // origins exactly so credentialed fetches keep working if that ever changes.
  const ok = ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGIN_RE.test(origin)
  return {
    'Access-Control-Allow-Origin': ok ? origin : '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    Vary: 'Origin',
  }
}

// Keys are exactly "<4-digit year>-<4-digit q_index>.(webp|mp4)". Anything else is a
// 404 before it reaches the bucket -- blocks traversal and any listing attempt.
const IMAGE_KEY_RE = /^\d{4}-\d{4}\.webp$/
const VIDEO_KEY_RE = /^\d{4}-\d{4}\.mp4$/

export default {
  async fetch(request, env) {
    const headers = cors(request.headers.get('Origin') || '')

    if (request.method === 'OPTIONS') return new Response(null, { headers })
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { ...headers, 'Cache-Control': 'no-store' } })
    }

    const url = new URL(request.url)

    if (url.pathname === '/healthz') {
      const probe = await env.ILLUSTRATIONS.head('2017-0032.webp')
      return new Response(JSON.stringify({ ok: !!probe, probe: probe ? probe.size : null }), {
        headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      })
    }

    let kind = null // 'image' | 'video'
    let key = null
    if (url.pathname.startsWith('/i/')) {
      kind = 'image'
      key = decodeURIComponent(url.pathname.slice('/i/'.length))
      if (!IMAGE_KEY_RE.test(key)) {
        return new Response('Not found', { status: 404, headers: { ...headers, 'Cache-Control': 'no-store' } })
      }
    } else if (url.pathname.startsWith('/v/')) {
      kind = 'video'
      key = decodeURIComponent(url.pathname.slice('/v/'.length))
      if (!VIDEO_KEY_RE.test(key)) {
        return new Response('Not found', { status: 404, headers: { ...headers, 'Cache-Control': 'no-store' } })
      }
    } else {
      return new Response('Not found', { status: 404, headers: { ...headers, 'Cache-Control': 'no-store' } })
    }

    // Range requests matter for <video> seeking on some browsers.
    const range = request.headers.get('Range')
    const obj = range
      ? await env.ILLUSTRATIONS.get(key, { range: request.headers })
      : await env.ILLUSTRATIONS.get(key)

    // A miss must not be cached at the edge: a stale 404 masked a working route
    // during textbook-images testing and cost real debugging time.
    if (!obj) {
      return new Response('Not found', { status: 404, headers: { ...headers, 'Cache-Control': 'no-store' } })
    }

    const contentType = kind === 'video' ? 'video/mp4' : 'image/webp'
    const status = obj.range ? 206 : 200
    const outHeaders = {
      ...headers,
      'Content-Type': contentType,
      // Immutable: the key encodes the question and media never changes in place.
      // Regenerated assets ship under a new cache-bust query on the client.
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: obj.httpEtag,
      'Accept-Ranges': 'bytes',
    }
    if (obj.size != null) outHeaders['Content-Length'] = String(obj.size)
    if (obj.range) {
      // wrangler/R2 returns range metadata when a Range header was honored.
      const { offset, length } = obj.range
      const end = offset + length - 1
      const total = obj.size ?? '*'
      outHeaders['Content-Range'] = `bytes ${offset}-${end}/${total}`
    }

    return new Response(request.method === 'HEAD' ? null : obj.body, {
      status,
      headers: outHeaders,
    })
  },
}
