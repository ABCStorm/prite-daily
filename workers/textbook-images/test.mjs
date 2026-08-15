/* Tests for the gated textbook Worker.  Run: npm test

   These exist because the ALLOW path can't be exercised against production —
   it needs a real Supabase access_token, which we can't mint. So the Worker's
   own branch logic is tested here against a stubbed Supabase and a stubbed R2
   bucket, and the DENY paths are additionally checked against the live Worker
   by hand (see SKILL.md). Between the two, every branch is covered.

   The one thing deliberately NOT covered: whether Supabase returns 200 for a
   valid token. That's Supabase's documented behaviour, not our code. */

import assert from 'node:assert/strict'
import worker from './src/index.js'

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const JSON_BODY = new TextEncoder().encode('{"2014-2":{"section":"11.3"}}')

/** Stub env. `validTokens` decides what the fake Supabase says. */
function makeEnv({ validTokens = ['good-token'], objects = null } = {}) {
  const store =
    objects ??
    new Map([
      ['2014-2_11.3_p3321.png', PNG],
      ['refs.json', JSON_BODY],
    ])
  const seen = []
  const env = {
    SUPABASE_URL: 'https://stub.supabase.co',
    SUPABASE_ANON_KEY: 'stub-anon-key',
    TEXTBOOK: {
      get: async (key) => {
        const body = store.get(key)
        if (!body) return null
        return { body, httpEtag: `"etag-${key}"` }
      },
    },
    _seen: seen,
  }
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), headers: init?.headers })
    const auth = init?.headers?.Authorization ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    return new Response(null, { status: validTokens.includes(token) ? 200 : 401 })
  }
  return env
}

const req = (path, { token, method = 'GET', origin } = {}) =>
  new Request(`https://textbook-images.example.workers.dev${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
  })

const call = (path, opts, env = makeEnv()) => worker.fetch(req(path, opts), env)

let passed = 0
async function it(name, fn) {
  try {
    await fn()
    console.log(`  ok  ${name}`)
    passed++
  } catch (e) {
    console.error(`  FAIL ${name}\n       ${e.message}`)
    process.exitCode = 1
  }
}

console.log('\ndeny paths')

await it('no token -> 401', async () => {
  const r = await call('/textbook/2014-2_11.3_p3321.png')
  assert.equal(r.status, 401)
})

await it('bad token -> 401', async () => {
  const r = await call('/textbook/2014-2_11.3_p3321.png', { token: 'nope' })
  assert.equal(r.status, 401)
})

await it('refs.json without token -> 401', async () => {
  const r = await call('/refs.json')
  assert.equal(r.status, 401)
})

await it('path traversal -> 404, and never reaches auth or R2', async () => {
  const env = makeEnv()
  const r = await worker.fetch(req('/textbook/../../etc/passwd', { token: 'good-token' }), env)
  assert.equal(r.status, 404)
  assert.equal(env._seen.length, 0, 'should not have called Supabase')
})

await it('nested path under /textbook/ -> 404', async () => {
  const r = await call('/textbook/sub/dir.png', { token: 'good-token' })
  assert.equal(r.status, 404)
})

await it('non-png extension -> 404', async () => {
  const r = await call('/textbook/secrets.json', { token: 'good-token' })
  assert.equal(r.status, 404)
})

await it('raw refs.json.gz key is not routable -> 404', async () => {
  const r = await call('/refs.json.gz', { token: 'good-token' })
  assert.equal(r.status, 404)
})

await it('root -> 404 (no listing)', async () => {
  const r = await call('/', { token: 'good-token' })
  assert.equal(r.status, 404)
})

await it('POST -> 405', async () => {
  const r = await call('/refs.json', { token: 'good-token', method: 'POST' })
  assert.equal(r.status, 405)
})

await it('every denial is uncacheable', async () => {
  for (const [path, opts] of [
    ['/textbook/2014-2_11.3_p3321.png', {}],
    ['/refs.json', {}],
    ['/textbook/../../etc/passwd', { token: 'good-token' }],
    ['/', { token: 'good-token' }],
  ]) {
    const r = await call(path, opts)
    assert.equal(r.headers.get('Cache-Control'), 'no-store', `${path} was cacheable`)
  }
})

await it('missing object with a valid token -> 404', async () => {
  const r = await call('/textbook/does-not-exist.png', { token: 'good-token' })
  assert.equal(r.status, 404)
})

console.log('\nallow path (the branch production cannot exercise)')

await it('valid token -> 200 with the image bytes', async () => {
  const r = await call('/textbook/2014-2_11.3_p3321.png', { token: 'good-token' })
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('Content-Type'), 'image/png')
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), PNG)
})

await it('image response is private, never shared-cached', async () => {
  const r = await call('/textbook/2014-2_11.3_p3321.png', { token: 'good-token' })
  const cc = r.headers.get('Cache-Control')
  assert.match(cc, /private/)
  assert.ok(!/public/.test(cc), 'must not be publicly cacheable')
  assert.equal(r.headers.get('ETag'), '"etag-2014-2_11.3_p3321.png"')
})

await it('refs.json -> 200, parseable JSON, NOT hand-encoded', async () => {
  const r = await call('/refs.json', { token: 'good-token' })
  assert.equal(r.status, 200)
  assert.match(r.headers.get('Content-Type'), /application\/json/)
  // Regression guard: a hand-set Content-Encoding is NOT passed through by
  // Cloudflare, so browsers received raw gzip bytes and res.json() threw.
  // Compression must be left to the edge.
  assert.equal(r.headers.get('Content-Encoding'), null)
  assert.deepEqual(await r.json(), { '2014-2': { section: '11.3' } })
})

await it('refs.json always revalidates; images stay long-cached', async () => {
  const refs = await call('/refs.json', { token: 'good-token' })
  const cc = refs.headers.get('Cache-Control')
  // A long max-age here meant every browser that fetched the broken gzip body
  // replayed it for 24h even after the server was fixed.
  assert.match(cc, /max-age=0/, `refs.json must revalidate, got "${cc}"`)
  assert.match(cc, /private/)

  const img = await call('/textbook/2014-2_11.3_p3321.png', { token: 'good-token' })
  assert.match(img.headers.get('Cache-Control'), /max-age=86400/)
})

await it('token is validated against Supabase with the anon key', async () => {
  const env = makeEnv()
  await worker.fetch(req('/refs.json', { token: 'good-token' }), env)
  assert.equal(env._seen.length, 1)
  assert.equal(env._seen[0].url, 'https://stub.supabase.co/auth/v1/user')
  assert.equal(env._seen[0].headers.Authorization, 'Bearer good-token')
  assert.equal(env._seen[0].headers.apikey, 'stub-anon-key')
})

await it('a revoked token stops working immediately', async () => {
  const env = makeEnv({ validTokens: [] }) // Supabase now rejects it
  const r = await worker.fetch(req('/refs.json', { token: 'good-token' }), env)
  assert.equal(r.status, 401)
})

console.log('\ncors')

await it('known origin is echoed back', async () => {
  const r = await call('/refs.json', { token: 'good-token', origin: 'https://pritedaily.com' })
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://pritedaily.com')
})

await it('unknown origin does not get itself echoed', async () => {
  for (const bad of [
    'https://evil.example',
    'https://prite-daily.pages.dev.evil.example', // suffix-lookalike
    'https://evilprite-daily.pages.dev',          // prefix-lookalike
    'http://pritedaily.com',                      // plain http
  ]) {
    const r = await call('/refs.json', { token: 'good-token', origin: bad })
    assert.notEqual(r.headers.get('Access-Control-Allow-Origin'), bad, `${bad} was allowed`)
  }
})

await it('pages.dev preview builds are allowed', async () => {
  for (const good of [
    'https://prite-daily.pages.dev',
    'https://eddac547.prite-daily.pages.dev',
    'http://localhost:5287',
  ]) {
    const r = await call('/refs.json', { token: 'good-token', origin: good })
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), good, `${good} was blocked`)
  }
})

await it('preflight needs no auth', async () => {
  const r = await call('/refs.json', { method: 'OPTIONS' })
  assert.equal(r.status, 200)
})

console.log('\nkaufman routes')

await it('kaufman-refs.json without token -> 401', async () => {
  const r = await call('/kaufman-refs.json')
  assert.equal(r.status, 401)
})

await it('kaufman image traversal -> 404', async () => {
  const r = await call('/kaufman/../../etc/passwd', { token: 'good-token' })
  assert.equal(r.status, 404)
})

await it('kaufman bad filename -> 404', async () => {
  const r = await call('/kaufman/dsm-00001.png', { token: 'good-token' })
  assert.equal(r.status, 404)
})

await it('kaufman figure crop is allowed', async () => {
  const env = makeEnv({
    objects: new Map([['kf-fig-4-11.png', PNG]]),
  })
  const r = await worker.fetch(req('/kaufman/kf-fig-4-11.png', { token: 'good-token' }), env)
  assert.equal(r.status, 200)
})

await it('kaufman figure traversal -> 404', async () => {
  const r = await call('/kaufman/kf-fig-../../x.png', { token: 'good-token' })
  assert.equal(r.status, 404)
})

await it('valid token can read a Kaufman page', async () => {
  const env = makeEnv({
    objects: new Map([
      ['kf-00210.png', PNG],
      ['kaufman-refs.json', JSON_BODY],
    ]),
  })
  const r = await worker.fetch(req('/kaufman/kf-00210.png', { token: 'good-token' }), env)
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('Content-Type'), 'image/png')
})

await it('kaufman-refs.json is JSON and not hand-encoded', async () => {
  const env = makeEnv({
    objects: new Map([['kaufman-refs.json', JSON_BODY]]),
  })
  const r = await worker.fetch(req('/kaufman-refs.json', { token: 'good-token' }), env)
  assert.equal(r.status, 200)
  assert.match(r.headers.get('Content-Type'), /application\/json/)
  assert.equal(r.headers.get('Content-Encoding'), null)
})

console.log(`\n${passed} passed${process.exitCode ? ' (with failures)' : ''}\n`)
