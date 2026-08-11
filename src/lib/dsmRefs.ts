/* DSM-5-TR section links + private page images.

   Matches live in a gated Worker (same textbook-images Worker as Kaplan).
   Page images are dsm-NNNNN.png in the private R2 bucket — never plain <img src>.
   Page numbers are indexes into OUR PDF copy only; UI must not present them as
   printed-page citations. */

import { supabase } from "./supabase";

const BASE =
  (import.meta.env.VITE_TEXTBOOK_BASE as string | undefined)?.replace(/\/$/, "") ||
  "https://textbook-images.correllsoftware.workers.dev";

export type DsmRef = {
  section_title: string;
  section_kind?: string;
  chapter_title?: string | null;
  book?: string;
  why?: string;
  /** Anchor page (section start) — PDF index only. */
  page?: number;
  lo?: number;
  hi?: number;
  atStart?: boolean;
  atEnd?: boolean;
  /** Legacy metadata-only fields (pre-pager). */
  pdf_page_start?: number | null;
  pdf_page_end?: number | null;
};

export function dsmPageImageName(page: number): string {
  return `dsm-${String(page).padStart(5, "0")}.png`;
}

async function authHeader(): Promise<Record<string, string> | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

let refsPromise: Promise<Record<string, DsmRef>> | null = null;

/** Prefer gated Worker bundle (has page windows); fall back to public metadata. */
export function loadDsmRefs(): Promise<Record<string, DsmRef>> {
  if (!refsPromise) {
    refsPromise = (async () => {
      // Try gated bundle first (full pager metadata + consistent auth path)
      try {
        const headers = await authHeader();
        if (headers) {
          const r = await fetch(`${BASE}/dsm-refs.json`, { headers, cache: "no-cache" });
          if (r.ok) {
            return (await r.json()) as Record<string, DsmRef>;
          }
        }
      } catch {
        /* fall through */
      }
      // Public metadata-only fallback (no images, but section titles still useful)
      let r: Response;
      try {
        r = await fetch("/data/dsm_refs.json", { cache: "force-cache" });
      } catch (e) {
        throw new Error(`can't reach dsm refs: ${String(e)}`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} for dsm refs`);
      const data = (await r.json()) as Record<string, DsmRef>;
      // Normalize legacy shape → page window if only pdf_page_* present
      for (const v of Object.values(data)) {
        if (v.page == null && v.pdf_page_start != null) {
          const start = v.pdf_page_start;
          const end = v.pdf_page_end ?? start;
          v.page = start;
          v.lo = start;
          v.hi = Math.min(end, start + 4);
          v.atStart = true;
          v.atEnd = (v.hi ?? start) >= end;
        }
      }
      return data;
    })().catch((e) => {
      refsPromise = null;
      throw e;
    });
  }
  return refsPromise;
}

const imgCache = new Map<string, Promise<string>>();
const MAX_CACHED = 60;

function evictOldest() {
  while (imgCache.size > MAX_CACHED) {
    const oldest = imgCache.keys().next();
    if (oldest.done) return;
    const p = imgCache.get(oldest.value)!;
    imgCache.delete(oldest.value);
    p.then(URL.revokeObjectURL).catch(() => {});
  }
}

export function dsmImage(name: string): Promise<string> {
  let p = imgCache.get(name);
  if (p) {
    imgCache.delete(name);
    imgCache.set(name, p);
  } else {
    p = (async () => {
      const headers = await authHeader();
      if (!headers) throw new Error("not signed in");
      const r = await fetch(`${BASE}/dsm/${encodeURIComponent(name)}`, { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return URL.createObjectURL(await r.blob());
    })().catch((e) => {
      imgCache.delete(name);
      throw e;
    });
    imgCache.set(name, p);
  }
  evictOldest();
  return p;
}

export function prefetchDsmImage(name: string): void {
  dsmImage(name).catch(() => {});
}
