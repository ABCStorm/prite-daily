export interface AudioEnv {
  AUDIO: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  AUDIO_BATCH_SECRET: string;
}

const exportKey = /^exports\/(?:v2|v3-48k|v4-16k-5100|v6-16k-5100-topics)\/[a-z0-9-]+\.mp3(?:\.part-\d{2,4})?$/;
const clipKey = /^\d{4}-\d+\/v(?:3|4-open-ended)\/(?:prompt|answer)\.mp3$/;

export function keyFromParam(value: string | string[] | undefined): string | null {
  const key = Array.isArray(value) ? value.join("/") : value ?? "";
  if (!key || key.includes("..") || (!exportKey.test(key) && !clipKey.test(key))) return null;
  return key;
}

function jwtSubject(authorization: string): string | null {
  try {
    const token = authorization.replace(/^Bearer\s+/i, "");
    const part = token.split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof payload.sub === "string" && /^[0-9a-f-]{36}$/i.test(payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}

/** PostgREST verifies the JWT signature; the unverified subject is used only
 * to make the RLS-protected own-profile lookup precise. */
export async function requireApprovedUser(request: Request, env: AudioEnv): Promise<Response | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const subject = jwtSubject(authorization);
  if (!subject) return new Response("Sign in required", { status: 401 });
  const url = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/profiles?id=eq.${encodeURIComponent(subject)}&select=status&limit=1`;
  const response = await fetch(url, {
    headers: {
      authorization,
      apikey: env.SUPABASE_ANON_KEY,
      accept: "application/json",
    },
  });
  if (!response.ok) return new Response("Invalid session", { status: 401 });
  const rows = await response.json().catch(() => []) as { status?: string }[];
  return rows[0]?.status === "approved" ? null : new Response("Approval required", { status: 403 });
}

export function requireBatch(request: Request, env: AudioEnv): Response | null {
  const supplied = request.headers.get("x-audio-batch-secret") ?? "";
  if (!env.AUDIO_BATCH_SECRET || env.AUDIO_BATCH_SECRET.length < 32 || supplied !== env.AUDIO_BATCH_SECRET) {
    return new Response("Batch authorization required", { status: 403 });
  }
  return null;
}
