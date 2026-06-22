/* ----------------------------------------------------------------------
   Local-first persistence (no backend yet). Everything a single user needs
   to actually practice survives reloads via localStorage. This layer is
   deliberately small and swappable: when the backend lands, the same shapes
   (answers, notes, settings, daily set) sync to the database.
---------------------------------------------------------------------- */

const KEY = "prite.v1";

export type AnswerRecord = {
  picked: string[];
  correct: boolean;
  ts: number; // epoch ms
};

export type Settings = {
  regimen: 5 | 10 | 20;
  recycleMissed: boolean;
  recycleAfterDays: number;
  examDate: string | null; // ISO yyyy-mm-dd
};

export type DailyState = {
  date: string; // yyyy-mm-dd the set was built for
  ids: string[]; // question ids in today's set
};

export type Store = {
  answers: Record<string, AnswerRecord>;
  notes: Record<string, string>;
  settings: Settings;
  daily: DailyState | null;
};

const DEFAULTS: Store = {
  answers: {},
  notes: {},
  settings: { regimen: 10, recycleMissed: true, recycleAfterDays: 14, examDate: null },
  daily: null,
};

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULTS),
      ...parsed,
      settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode — ignore, in-memory still works this session */
  }
}

export function todayStr(): string {
  // local date, not UTC, so "today" matches the user's calendar
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - start) / 86400000);
}

/* --- accessors --- */
export function loadStore(): Store {
  return read();
}

export function recordAnswer(id: string, rec: AnswerRecord): Store {
  const s = read();
  s.answers[id] = rec;
  write(s);
  return s;
}

export function setNote(id: string, text: string): Store {
  const s = read();
  if (text.trim()) s.notes[id] = text;
  else delete s.notes[id];
  write(s);
  return s;
}

export function setSettings(patch: Partial<Settings>): Store {
  const s = read();
  s.settings = { ...s.settings, ...patch };
  write(s);
  return s;
}

export function setDaily(daily: DailyState): Store {
  const s = read();
  s.daily = daily;
  write(s);
  return s;
}

export function resetAll(): Store {
  write(structuredClone(DEFAULTS));
  return read();
}

/* --- derived stats --- */
export type Stats = {
  answered: number;
  correct: number;
  accuracy: number; // 0..100
  streakDays: number;
  byYear: Record<string, { answered: number; correct: number }>;
};

export function computeStats(store: Store, idYear: (id: string) => string): Stats {
  const entries = Object.entries(store.answers);
  const answered = entries.length;
  const correct = entries.filter(([, a]) => a.correct).length;
  const byYear: Record<string, { answered: number; correct: number }> = {};
  const days = new Set<string>();
  for (const [id, a] of entries) {
    const y = idYear(id);
    byYear[y] = byYear[y] || { answered: 0, correct: 0 };
    byYear[y].answered++;
    if (a.correct) byYear[y].correct++;
    const d = new Date(a.ts);
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  // streak: consecutive calendar days ending today (or yesterday) with activity
  let streakDays = 0;
  const cursor = new Date();
  for (;;) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (days.has(key)) {
      streakDays++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (streakDays === 0) {
      // allow the streak to count from yesterday if nothing done yet today
      cursor.setDate(cursor.getDate() - 1);
      const ykey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
      if (days.has(ykey)) { streakDays++; cursor.setDate(cursor.getDate() - 1); }
      else break;
    } else break;
  }
  return { answered, correct, accuracy: answered ? Math.round((correct / answered) * 100) : 0, streakDays, byYear };
}
