/* Local safety net for practice answers.

   Closing a phone tab cancels in-flight upserts, and PostgREST's 1000-row
   default used to hide anything past the first page on reload. localStorage
   keeps every answer the UI has already accepted; on the next visit we merge
   that cache with the server and retry anything the server doesn't have yet. */

import { nextAnswerRow, pushAnswerRow, type AnswerRow } from "./db";

function cacheKey(uid: string) {
  return `pd_answers_${uid}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota / private mode */ }
}

export function readLocalAnswers(uid: string): Record<string, AnswerRow> {
  const raw = readJson<Record<string, AnswerRow>>(cacheKey(uid), {});
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, AnswerRow> = {};
  for (const [id, row] of Object.entries(raw)) {
    if (row && typeof row === "object" && typeof row.question_id === "string") out[id] = row;
  }
  return out;
}

export function writeLocalAnswers(uid: string, map: Record<string, AnswerRow>) {
  writeJson(cacheKey(uid), map);
}

export function cacheAnswer(uid: string, row: AnswerRow) {
  const map = readLocalAnswers(uid);
  map[row.question_id] = row;
  writeLocalAnswers(uid, map);
}

function newer(a: AnswerRow, b: AnswerRow | undefined) {
  if (!b) return true;
  return Date.parse(a.updated_at) > Date.parse(b.updated_at);
}

/** Overlay any locally-newer rows onto the server snapshot and persist the
    merge so a killed tab still shows the questions just finished. */
export function hydrateAnswers(
  uid: string,
  server: Record<string, AnswerRow>,
): { merged: Record<string, AnswerRow>; pending: AnswerRow[] } {
  const local = readLocalAnswers(uid);
  const merged: Record<string, AnswerRow> = { ...server };
  const pending: AnswerRow[] = [];
  for (const row of Object.values(local)) {
    if (newer(row, server[row.question_id])) {
      merged[row.question_id] = row;
      pending.push(row);
    }
  }
  writeLocalAnswers(uid, merged);
  return { merged, pending };
}

/** Accept an answer in the UI immediately (sync localStorage write). */
export function rememberAnswer(
  uid: string,
  questionId: string,
  picked: string[],
  correct: boolean,
  existing: AnswerRow | undefined,
): AnswerRow {
  const row = nextAnswerRow(existing, questionId, picked, correct, uid);
  cacheAnswer(uid, row);
  return row;
}

export function confirmAnswer(uid: string, row: AnswerRow) {
  cacheAnswer(uid, row);
}

/** Re-upsert rows the last visit accepted but the server never confirmed. */
export async function retryPendingAnswers(uid: string, pending: AnswerRow[]) {
  for (const row of pending) {
    const saved = await pushAnswerRow({ ...row, user_id: uid });
    if (saved) cacheAnswer(uid, saved);
  }
}
