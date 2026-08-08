/* Browser-side cache for the question bank, backed by IndexedDB.

   The bank is a ~4.6 MB gzipped object in a private Supabase Storage bucket,
   and before this it was re-downloaded on EVERY app load — which was the whole
   of the project's Supabase egress (~6.4 GB/month against a 5 GB free-tier
   cap). The object name is version-stamped (…-20260805-r6.json.gz) and a new
   corpus is always published under a NEW name, so the name is a perfect cache
   key: a released corpus can never be served stale, and invalidation is free.

   We cache the still-gzipped Blob rather than the inflated JSON — 4.6 MB
   instead of tens of MB of text, which keeps us well clear of per-origin
   storage quotas. Inflating from the cache uses the same native
   DecompressionStream path the network response does, so it costs milliseconds.

   Every operation is best-effort: private-browsing modes, disabled storage, and
   quota errors all resolve to "no cache" rather than throwing, so a failure
   here can only cost a download, never break loading the bank. */

const DB_NAME = "prite-bank-cache";
const DB_VERSION = 1;
const STORE = "bank";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DB_NAME, DB_VERSION); }
    catch { return resolve(null); }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    // Firefox in private mode can leave the open request hanging rather than
    // erroring, so don't let a stuck request stall the whole app boot.
    request.onblocked = () => resolve(null);
    setTimeout(() => resolve(null), 3000);
  });
}

/** The cached gzip Blob for this exact bank version, or null on any miss. */
export async function readCachedBank(key: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise<Blob | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => {
        const value = request.result;
        resolve(value instanceof Blob ? value : null);
      };
      request.onerror = () => resolve(null);
      tx.onerror = () => resolve(null);
    });
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/** Store this version's gzip Blob and drop every older one, so a user who has
    lived through several corpus releases doesn't accumulate a stack of dead
    4.6 MB blobs in their browser profile. */
export async function writeCachedBank(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const keysRequest = store.getAllKeys();
      keysRequest.onsuccess = () => {
        for (const existing of keysRequest.result) {
          if (existing !== key) store.delete(existing);
        }
      };
      store.put(blob, key);
      tx.oncomplete = () => resolve();
      // Most likely a quota rejection — the next load just re-downloads.
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    /* best effort */
  } finally {
    db.close();
  }
}
