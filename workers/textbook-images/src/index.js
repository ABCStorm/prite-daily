/**
 * Gated image server for Kaplan & Sadock page screenshots.
 *
 * WHY THIS EXISTS: the images are pages of a copyrighted textbook. The R2
 * bucket is PRIVATE and has no public URL. Every request must present a valid
 * Supabase session, so access matches the same "approved member" model the
 * Supabase storage policy used (see supabase/migrations/0058_textbook_excerpts.sql).
 * Do NOT make the bucket public — that would publish ~1,800 pages of the book
 * to the open internet.
 *
 * GET /textbook/<image>.png   — a single page screenshot
 * GET /refs.json              — the whole citation index (plain JSON)
 *   Authorization: Bearer <supabase access_token>
 *
 * The citation index is gated too, not just the images: the quotes are verbatim
 * excerpts from the same copyrighted book.
 */

const ALLOWED_ORIGINS = [
  'https://pritedaily.com',
  'https://www.pritedaily.com',
]

/** Cloudflare Pages preview/staging builds, e.g. https://eddac547.prite-daily.pages.dev.
    Without these, testing on a pages.dev URL fails CORS while the custom domain works —
    a confusing "it works for me" split. */
const ALLOWED_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)?prite-daily\.pages\.dev$|^http:\/\/localhost:\d+$/

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGIN_RE.test(origin)
  const allow = ok ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Vary': 'Origin',
  }
}

/** Verify the caller holds a valid Supabase session. */
async function isAuthed(request, env) {
  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return false
  // Ask Supabase to validate the token. Simple and always correct — no local
  // JWT-secret handling, and it honours revocation/expiry automatically.
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY },
  })
  return r.ok
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const headers = cors(origin)

    // Denials must never be cacheable. Cloudflare will happily edge-cache a bare
    // 404 (it did, and a stale one then masked a working route during testing),
    // and a cached deny is at best confusing to debug.
    const deny = (body, status) =>
      new Response(body, { status, headers: { ...headers, 'Cache-Control': 'no-store' } })

    if (request.method === 'OPTIONS') return new Response(null, { headers })
    if (request.method !== 'GET') return deny('Method not allowed', 405)

    const url = new URL(request.url)
    const path = url.pathname

    // Work out which object is being asked for BEFORE checking auth, so an
    // unauthenticated caller can't tell a real filename from a bogus one.
    let key = null
    let extra = null
    if (path === '/refs.json') {
      key = 'refs.json'
      // Stored UNCOMPRESSED on purpose. It was briefly stored pre-gzipped with a
      // hand-set `Content-Encoding: gzip`, which broke in production: Cloudflare
      // did not pass that header through, so browsers got raw gzip bytes and
      // res.json() threw "Unexpected token". Let the edge negotiate compression
      // itself — it gzips/brotlis JSON responses anyway, for the same ~3x saving.
      extra = {
        'Content-Type': 'application/json; charset=utf-8',
        // Always revalidate. This body's shape has changed once already, and a
        // long max-age meant every browser that saw the broken version kept
        // replaying it for a day. Revalidation is cheap — the ETag makes it a 304.
        'Cache-Control': 'private, max-age=0, must-revalidate',
      }
    } else if (path.startsWith('/textbook/')) {
      const name = decodeURIComponent(path.slice('/textbook/'.length))
      // Reject anything that isn't a plain image filename (no traversal, no listing).
      if (/^[A-Za-z0-9._-]+\.png$/.test(name)) {
        key = name
        extra = { 'Content-Type': 'image/png' }
      }
    }
    if (!key) return deny('Not found', 404)

    if (!(await isAuthed(request, env))) {
      return deny('Unauthorized', 401)
    }

    const obj = await env.TEXTBOOK.get(key)
    if (!obj) return deny('Not found', 404)

    return new Response(obj.body, {
      headers: {
        ...headers,
        // Default: private (cacheable by the member's browser, never by a shared
        // cache) and long-lived, which suits the page images — they never change.
        // `extra` comes AFTER so a route can override it; /refs.json does.
        'Cache-Control': 'private, max-age=86400',
        'ETag': obj.httpEtag,
        ...extra,
      },
    })
  },
}
