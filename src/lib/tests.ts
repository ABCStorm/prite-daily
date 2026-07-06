// Saved tests: named, hand-picked question sets for running a class session
// (live poll), re-studying, or exporting to PowerPoint. Kept in localStorage —
// no migration needed, and the host (whoever builds the test) is the one who
// runs it, so per-device storage matches how it's actually used. Question ids
// are the stable `${year}:${q_index}` keys, so a test survives bank updates.

export type SavedTest = {
  id: string;
  name: string;
  qids: string[];   // question ids in presentation order
  created: string;  // ISO date
};

const KEY = "prite_saved_tests";

export function loadTests(): SavedTest[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((t) => t && t.id && t.name && Array.isArray(t.qids)) : [];
  } catch {
    return [];
  }
}

function persist(tests: SavedTest[]) {
  try { localStorage.setItem(KEY, JSON.stringify(tests)); } catch { /* storage full/blocked — nothing to do */ }
}

export function saveTest(name: string, qids: string[]): SavedTest {
  const t: SavedTest = {
    id: "t_" + Math.random().toString(36).slice(2, 10),
    name: name.trim().slice(0, 60) || "Untitled test",
    qids: [...qids],
    created: new Date().toISOString(),
  };
  persist([t, ...loadTests()]);
  return t;
}

export function renameTest(id: string, name: string): SavedTest[] {
  const next = loadTests().map((t) => (t.id === id ? { ...t, name: name.trim().slice(0, 60) || t.name } : t));
  persist(next);
  return next;
}

export function deleteTest(id: string): SavedTest[] {
  const next = loadTests().filter((t) => t.id !== id);
  persist(next);
  return next;
}
