import { supabase } from "./supabase";

/* Kaplan & Sadock citations.

   Every question in the bank was run through a retrieval pipeline that finds a
   real passage in Kaplan & Sadock's Comprehensive Textbook of Psychiatry (10th
   ed.) supporting the correct answer. Each quote was verified by exact
   substring match against the local source text and located on a rendered PDF
   page — nothing here is model-generated prose. 2,697 of 5,100 questions have
   a citation.

   Note: reference/kaplan_sadock_refs_SHIP.json is NOT the shipped set despite
   the name — it's a narrower strong-only cut (1,632 questions). The deployed
   refs.json is the source of truth; see build_refs_bundle.py.

   Both the index and the page images are pages of a copyrighted textbook, so
   they live in a PRIVATE Cloudflare R2 bucket behind a Worker that requires a
   valid Supabase session. Nothing here is reachable signed-out, which is why
   images can't be plain <img src> URLs — see kaplanImage() below. */

const BASE =
  (import.meta.env.VITE_TEXTBOOK_BASE as string | undefined)?.replace(/\/$/, "") ||
  "https://textbook-images.correllsoftware.workers.dev";

export type KaplanCite = {
  quote: string;
  /** "primary" supports the keyed answer; "context"/"distractor" explain around it. */
  role: string;
  note: string;
  /* ⚠️ page/lo/hi are indexes into OUR copy of the PDF — the source is a reflowed
     ebook with no printed page numbers, so these are NOT citable book pages and
     must never be shown to a reader. They exist only to name image files: the
     readable window is every page from `lo` to `hi`, with the quote on `page`.
     Show position relative to the quote instead ("2 pages earlier"). */
  page?: number;
  lo?: number;
  hi?: number;
  /** The window stops at `lo` because the section starts there, not because we ran out. */
  atStart?: boolean;
  /** Likewise at `hi` — the section ends there. */
  atEnd?: boolean;
};

/** Page images are keyed by PDF page: `ks-03321.png`. Zero-padded to 5 digits to
    match pdftoppm's own naming for a 12,754-page document. */
export function pageImageName(page: number): string {
  return `ks-${String(page).padStart(5, "0")}.png`;
}

export type KaplanRef = {
  /** Section number, e.g. "11.3". */
  section: string;
  /** Section title, e.g. "Stimulant-Related Disorders". */
  title: string;
  cites: KaplanCite[];
};

async function authHeader(): Promise<Record<string, string> | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

let refsPromise: Promise<Record<string, KaplanRef>> | null = null;

/** Load (and memoise) the whole citation index. ~285 KB gzipped, fetched once. */
export function loadKaplanRefs(): Promise<Record<string, KaplanRef>> {
  if (!refsPromise) {
    refsPromise = (async () => {
      const headers = await authHeader();
      if (!headers) throw new Error("not signed in (no Supabase session)");
      let r: Response;
      try {
        // `no-cache` = always revalidate (still cheap: the ETag turns it into a
        // 304). Needed because an earlier build served this body gzipped with a
        // header Cloudflare stripped, and browsers cached the unreadable result
        // for a day — without forced revalidation those clients stay broken
        // until it expires, no matter what the server does.
        r = await fetch(`${BASE}/refs.json`, { headers, cache: "no-cache" });
      } catch (e) {
        // fetch() only rejects for network/CORS failures, never for a 4xx.
        throw new Error(`can't reach ${BASE} (network or CORS): ${String(e)}`);
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${BASE}/refs.json`);
      try {
        return (await r.json()) as Record<string, KaplanRef>;
      } catch (e) {
        throw new Error(`response wasn't valid JSON (gzip decode?): ${String(e)}`);
      }
    })().catch((e) => {
      // Don't cache a failure — a later attempt (e.g. after a token refresh)
      // should be able to succeed.
      refsPromise = null;
      throw e;
    });
  }
  return refsPromise;
}

const imgCache = new Map<string, Promise<string>>();

/* Each page is ~450 KB of decoded blob. When the panel showed a single page per
   citation the cache could grow untended, but a reader can now page through up
   to 11 pages per citation, so an unbounded cache leaks tens of MB across a long
   study session. Keep the most recent MAX_CACHED and revoke the rest — a revoked
   page just refetches (and it's still in the HTTP cache, which the Worker sets to
   private/24h), so eviction costs a repaint at worst. */
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

/** Fetch a page screenshot as an object URL.

   The bucket is private, so the image needs an Authorization header — which a
   plain <img src="..."> can't send. We fetch it as a blob and hand back an
   object URL instead. */
export function kaplanImage(name: string): Promise<string> {
  let p = imgCache.get(name);
  if (p) {
    // Refresh recency: Map iterates in insertion order, so re-inserting makes
    // this the newest entry and keeps evictOldest() an LRU rather than a FIFO.
    imgCache.delete(name);
    imgCache.set(name, p);
  } else {
    p = (async () => {
      const headers = await authHeader();
      if (!headers) throw new Error("not signed in");
      const r = await fetch(`${BASE}/textbook/${encodeURIComponent(name)}`, { headers });
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

/** Warm the cache for a page without caring about the result — used to prefetch
    the next/previous page so paging feels instant. */
export function prefetchKaplanImage(name: string): void {
  kaplanImage(name).catch(() => {});
}
