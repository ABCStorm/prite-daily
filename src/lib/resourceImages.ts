import { supabase } from "./supabase";

/**
 * AnKing / AnkiHub Extra diagrams and Sketchy panel images matched to PRITE
 * questions. Source material is copyrighted third-party content (AnKing exports
 * + Sketchy), so files live in a PRIVATE R2 bucket behind a Worker that requires
 * a valid Supabase session — same model as Kaplan page screenshots.
 *
 * Question bank fields (set by scripts/anking-images/extract_and_match.py):
 *   anking_images:  string[]   // Extra + First Aid style diagrams
 *   sketchy_images: string[]   // Sketchy / Sketchy 2 / Sketchy Extra panels
 *   anking_match?:  { score, text_preview, entities, source_deck, ankihub_id }
 */

const BASE =
  (import.meta.env.VITE_RESOURCE_IMAGES_BASE as string | undefined)?.replace(/\/$/, "") ||
  "https://resource-images.correllsoftware.workers.dev";

async function authHeader(): Promise<Record<string, string> | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

const imgCache = new Map<string, Promise<string>>();
const MAX_CACHED = 80;

function evictOldest() {
  while (imgCache.size > MAX_CACHED) {
    const oldest = imgCache.keys().next();
    if (oldest.done) return;
    const p = imgCache.get(oldest.value)!;
    imgCache.delete(oldest.value);
    p.then(URL.revokeObjectURL).catch(() => {});
  }
}

/** Fetch a resource image as an object URL (Authorization header required). */
export function resourceImage(kind: "anking" | "sketchy", name: string): Promise<string> {
  const key = `${kind}:${name}`;
  let p = imgCache.get(key);
  if (p) {
    imgCache.delete(key);
    imgCache.set(key, p);
  } else {
    p = (async () => {
      const headers = await authHeader();
      if (!headers) throw new Error("not signed in");
      const r = await fetch(
        `${BASE}/${kind}/${encodeURIComponent(name)}`,
        { headers },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return URL.createObjectURL(await r.blob());
    })().catch((e) => {
      imgCache.delete(key);
      throw e;
    });
    imgCache.set(key, p);
  }
  evictOldest();
  return p;
}

export function prefetchResourceImage(kind: "anking" | "sketchy", name: string): void {
  resourceImage(kind, name).catch(() => {});
}
