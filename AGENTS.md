# Release invariants

## Supabase-backed production builds

- Never deploy a Vite production build unless both `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` are present. `vite.config.ts` intentionally fails a
  production build when either is missing.
- A clean worktree does not contain `.env.local`. Build from a configured
  checkout or pass the trusted env file explicitly with `node --env-file=...`.
- Before a Cloudflare Pages deploy, verify the compiled main bundle contains
  the expected Supabase project hostname, then smoke-test a fresh signed-in tab.
  A page that falls back to local-preview data can misleadingly show
  “No questions for this filter.”
- Never commit or print Supabase keys.
