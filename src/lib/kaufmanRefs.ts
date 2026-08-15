/* Kaufman 9e section links + private page images + practice-bank loader.

   Pages live in the same gated textbook-images Worker as Kaplan/DSM
   (kf-NNNNN.png). Page numbers are indexes into OUR PDF copy only — the UI
   must not present them as printed-page citations. Show chapter titles. */

import { supabase } from "./supabase";

const BASE =
  (import.meta.env.VITE_TEXTBOOK_BASE as string | undefined)?.replace(/\/$/, "") ||
  "https://textbook-images.correllsoftware.workers.dev";

export type KaufmanRef = {
  section: string;
  title: string;
  subsection?: string | null;
  why?: string;
  book?: string;
  page?: number;
  lo?: number;
  hi?: number;
  atStart?: boolean;
  atEnd?: boolean;
};

export function kaufmanPageImageName(page: number): string {
  return `kf-${String(page).padStart(5, "0")}.png`;
}

async function authHeader(): Promise<Record<string, string> | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

let refsPromise: Promise<Record<string, KaufmanRef>> | null = null;

export function loadKaufmanRefs(): Promise<Record<string, KaufmanRef>> {
  if (!refsPromise) {
    refsPromise = (async () => {
      try {
        const headers = await authHeader();
        if (headers) {
          const r = await fetch(`${BASE}/kaufman-refs.json`, { headers, cache: "no-cache" });
          if (r.ok) return (await r.json()) as Record<string, KaufmanRef>;
        }
      } catch {
        /* fall through */
      }
      const r = await fetch("/data/kaufman_refs.json", { cache: "force-cache" });
      if (!r.ok) throw new Error(`HTTP ${r.status} for kaufman refs`);
      return (await r.json()) as Record<string, KaufmanRef>;
    })().catch((e) => {
      refsPromise = null;
      throw e;
    });
  }
  return refsPromise;
}

let questionsPromise: Promise<unknown[]> | null = null;

/** Kaufman chapter + additional-review MCQs. Gated — these are the book's own Q&As. */
export function loadKaufmanQuestions(): Promise<unknown[]> {
  if (!questionsPromise) {
    questionsPromise = (async () => {
      const headers = await authHeader();
      if (!headers) throw new Error("not signed in (no Supabase session)");
      const r = await fetch(`${BASE}/kaufman-questions.json`, { headers, cache: "no-cache" });
      if (!r.ok) throw new Error(`HTTP ${r.status} from ${BASE}/kaufman-questions.json`);
      return (await r.json()) as unknown[];
    })().catch((e) => {
      questionsPromise = null;
      throw e;
    });
  }
  return questionsPromise;
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

export function kaufmanImage(name: string): Promise<string> {
  let p = imgCache.get(name);
  if (p) {
    imgCache.delete(name);
    imgCache.set(name, p);
  } else {
    p = (async () => {
      const headers = await authHeader();
      if (!headers) throw new Error("not signed in");
      const q = name.startsWith("kf-fig-") ? "?v=3" : "";
      const r = await fetch(`${BASE}/kaufman/${encodeURIComponent(name)}${q}`, { headers, cache: name.startsWith("kf-fig-") ? "reload" : "default" });
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

export function prefetchKaufmanImage(name: string): void {
  kaufmanImage(name).catch(() => {});
}

export function isKaufmanFigurePath(path: string): boolean {
  return path.startsWith("kf:") || path.startsWith("kf-");
}

export function kaufmanFigureName(path: string): string {
  if (path.startsWith("kf:")) return `kf-${path.slice(3).padStart(5, "0")}.png`;
  return path.endsWith(".png") ? path : `${path}.png`;
}
