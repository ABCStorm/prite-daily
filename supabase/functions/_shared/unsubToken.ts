// HMAC-SHA256 signing for one-click unsubscribe links. Lets a plain email
// link flip settings.daily_reminder off with no login — the link can't be
// forged (or reused for a different user) without UNSUB_SECRET.

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function signUnsubscribeToken(userId: string, secret: string): Promise<string> {
  return hmacHex(secret, userId);
}

export async function verifyUnsubscribeToken(userId: string, token: string, secret: string): Promise<boolean> {
  const expected = await hmacHex(secret, userId);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
