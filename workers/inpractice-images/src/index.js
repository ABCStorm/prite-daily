/**
 * Public image server for the "In practice" scenario illustrations.
 *
 * WHY PUBLIC (unlike workers/textbook-images, which is Supabase-gated): these are
 * AI-generated originals drawn from the app's own `clinical_application` text --
 * no third-party copyright, no question stems, no answers, no PII. The app's
 * existing `/images/...` set is already public for the same reason. Serving them
 * openly means the app can use a plain <img src>, and Cloudflare's edge cache does
 * the work for free.
 *
 * If this ever needs gating, copy the isAuthed() helper from
 * workers/textbook-images/src/index.js -- but note that <img src> cannot send an
 * Authorization header, so the app would have to fetch blobs and manage object
 * URLs. That cost is the whole reason this one is public.
 *
 * GET /i/<year>-<qindex>.webp   e.g. /i/2017-0032.webp
 * GET /healthz                  liveness + object spot-check
 */

const ALLOWED_ORIGINS = ['https://pritedaily.com', 'https://www.pritedaily.com']
const ALLOWED_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)?prite-daily\.pages\.dev$|^http:\/\/localhost:\d+$/

function cors(origin) {
  // Images are public, so a permissive default is fine; we still echo known
  // origins exactly so credentialed fetches keep working if that ever changes.
  const ok = ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGIN_RE.test(origin)
  return {
    'Access-Control-Allow-Origin': ok ? origin : '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  }
}

// Keys are exactly "<4-digit year>-<4-digit q_index>.webp". Anything else is a
// 404 before it reaches the bucket -- blocks traversal and any listing attempt.
const KEY_RE = /^\d{4}-\d{4}\.webp$/

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

    if (!url.pathname.startsWith('/i/')) {
      return new Response('Not found', { status: 404, headers: { ...headers, 'Cache-Control': 'no-store' } })
    }

    const key = decodeURIComponent(url.pathname.slice('/i/'.length))
    if (!KEY_RE.test(key)) {
      return new Response('Not found', { status: 404, headers: { ...headers, 'Cache-Control': 'no-store' } })
    }

    const obj = await env.ILLUSTRATIONS.get(key)
    // A miss must not be cached at the edge: a stale 404 masked a working route
    // during textbook-images testing and cost real debugging time.
    if (!obj) {
      return new Response('Not found', { status: 404, headers: { ...headers, 'Cache-Control': 'no-store' } })
    }

    // Immutable: the key encodes the question and the image for a question never
    // changes in place. A regenerated illustration ships under a re-deploy, so a
    // year-long public cache is safe and keeps origin reads near zero.
    return new Response(request.method === 'HEAD' ? null : obj.body, {
      headers: {
        ...headers,
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: obj.httpEtag,
      },
    })
  },
}
