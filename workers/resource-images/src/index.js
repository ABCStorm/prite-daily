/**
 * Gated image server for AnKing / AnkiHub Extra diagrams and Sketchy panels.
 *
 * WHY THIS EXISTS: these are third-party copyrighted study assets (AnKing
 * community media + Sketchy). The R2 bucket is PRIVATE. Every request must
 * present a valid Supabase session so access matches the approved-member model.
 * Do NOT make the bucket public.
 *
 * GET /anking/<filename>   — Extra / First Aid style diagrams
 * GET /sketchy/<filename>  — Sketchy / Sketchy 2 / Sketchy Extra panels
 *   Authorization: Bearer <supabase access_token>
 *
 * Filenames are stored as-is from Anki media (may include spaces). Both kinds
 * currently share one bucket; the path prefix is for clarity and future split.
 */

const ALLOWED_ORIGINS = [
  "https://pritedaily.com",
  "https://www.pritedaily.com",
];

const ALLOWED_ORIGIN_RE =
  /^https:\/\/([a-z0-9-]+\.)?prite-daily\.pages\.dev$|^http:\/\/localhost:\d+$/;

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGIN_RE.test(origin);
  const allow = ok ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    Vary: "Origin",
  };
}

async function isAuthed(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return false;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY,
    },
  });
  return r.ok;
}

function contentType(name) {
  const low = name.toLowerCase();
  if (low.endsWith(".png")) return "image/png";
  if (low.endsWith(".jpg") || low.endsWith(".jpeg")) return "image/jpeg";
  if (low.endsWith(".webp")) return "image/webp";
  if (low.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

/** Safe Anki media filename: letters, digits, common punctuation, spaces. No path seps. */
function safeName(raw) {
  const name = decodeURIComponent(raw);
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) return null;
  if (name.length > 240) return null;
  // Allow typical Anki media names
  if (!/^[A-Za-z0-9._\-+()\[\] &'%,]+\.(png|jpe?g|webp|gif)$/i.test(name)) return null;
  return name;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);
    const deny = (body, status) =>
      new Response(body, {
        status,
        headers: { ...headers, "Cache-Control": "no-store" },
      });

    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "GET") return deny("Method not allowed", 405);

    const url = new URL(request.url);
    const path = url.pathname;

    let kind = null;
    let filePart = null;
    if (path.startsWith("/anking/")) {
      kind = "anking";
      filePart = path.slice("/anking/".length);
    } else if (path.startsWith("/sketchy/")) {
      kind = "sketchy";
      filePart = path.slice("/sketchy/".length);
    } else if (path === "/healthz") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...headers, "Content-Type": "application/json" },
      });
    }
    if (!kind || !filePart) return deny("Not found", 404);

    const name = safeName(filePart);
    if (!name) return deny("Not found", 404);

    if (!(await isAuthed(request, env))) {
      return deny("Unauthorized", 401);
    }

    // Objects stored under flat keys (filename only). kind is for URL routing.
    const obj = await env.RESOURCES.get(name);
    if (!obj) return deny("Not found", 404);

    return new Response(obj.body, {
      headers: {
        ...headers,
        "Content-Type": contentType(name),
        "Cache-Control": "private, max-age=86400",
        ETag: obj.httpEtag,
      },
    });
  },
};
