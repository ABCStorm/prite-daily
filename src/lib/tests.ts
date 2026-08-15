// Saved tests: named, hand-picked question sets for running a class session
// (live poll), re-studying, or exporting to PowerPoint. Stored in Supabase
// under the creating user's account (table `saved_tests`, see migration
// 0023) so a test built on one device — e.g. at home — is still there when
// the host signs in on the presenting computer. Question ids are the stable
// `${year}:${q_index}` keys, so a test survives bank updates.

import { supabase } from "./supabase";

export type TestVisibility = "private" | "chiefs" | "everyone";

export type SavedTest = {
  id: string;
  name: string;
  qids: string[];   // question ids in presentation order
  created: string;  // ISO date
  user_id: string;
  visibility: TestVisibility;
  shared_with: string[];
  owner_name: string | null;
  mine: boolean;
};

function asTest(r: {
  id: string;
  name: string;
  qids: unknown;
  created_at: string;
  user_id?: string;
  visibility?: string;
  shared_with?: string[] | null;
  owner?: { full_name: string | null } | { full_name: string | null }[] | null;
}, me: string | null): SavedTest {
  const vis = r.visibility === "chiefs" || r.visibility === "everyone" ? r.visibility : "private";
  const owner = Array.isArray(r.owner) ? r.owner[0] : r.owner;
  return {
    id: r.id,
    name: r.name,
    qids: (r.qids as string[]) ?? [],
    created: r.created_at,
    user_id: r.user_id ?? "",
    visibility: vis,
    shared_with: r.shared_with ?? [],
    owner_name: owner?.full_name ?? null,
    mine: !!me && r.user_id === me,
  };
}

function clampName(name: string) {
  return name.trim().slice(0, 60) || "Untitled test";
}

export async function loadTests(): Promise<SavedTest[]> {
  if (!supabase) return [];
  const { data: u } = await supabase.auth.getUser();
  const me = u.user?.id ?? null;
  const { data, error } = await supabase
    .from("saved_tests")
    .select("id, name, qids, created_at, user_id, visibility, shared_with, owner:profiles!saved_tests_user_id_fkey(full_name)")
    .order("created_at", { ascending: false });
  if (error) {
    // Older DBs without the share columns still work for the owner.
    const fallback = await supabase
      .from("saved_tests")
      .select("id, name, qids, created_at, user_id")
      .order("created_at", { ascending: false });
    if (fallback.error) { console.warn(error); return []; }
    return sortTests((fallback.data ?? []).map((r) => asTest(r, me)));
  }
  return sortTests((data ?? []).map((r) => asTest(r, me)));
}

function sortTests(tests: SavedTest[]): SavedTest[] {
  return tests.sort((a, b) => {
    if (a.mine !== b.mine) return a.mine ? -1 : 1;
    return b.created.localeCompare(a.created);
  });
}

export async function saveTest(name: string, qids: string[]): Promise<SavedTest | null> {
  if (!supabase) return null;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from("saved_tests")
    .insert({ user_id: u.user.id, name: clampName(name), qids: [...qids] })
    .select("id, name, qids, created_at")
    .single();
  if (error) { console.warn(error); return null; }
  return asTest({ ...data, user_id: u.user.id }, u.user.id);
}

export async function shareTest(
  id: string,
  visibility: TestVisibility,
  sharedWith: string[],
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from("saved_tests")
    .update({ visibility, shared_with: [...new Set(sharedWith)] })
    .eq("id", id);
  if (error) { console.warn(error); return false; }
  return true;
}

export async function renameTest(id: string, name: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("saved_tests").update({ name: clampName(name) }).eq("id", id);
  if (error) console.warn(error);
}

/** Replace a test's question list (add/remove/reorder). Returns false on
    failure so the caller can keep the editor open and warn. RLS restricts the
    update to the owner's own row. */
export async function updateTestQids(id: string, qids: string[]): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("saved_tests").update({ qids: [...qids] }).eq("id", id);
  if (error) { console.warn(error); return false; }
  return true;
}

export type SharePerson = { id: string; name: string; level: string | null; chief: boolean };

export async function listShareablePeople(): Promise<SharePerson[]> {
  if (!supabase) return [];
  const { data: u } = await supabase.auth.getUser();
  const me = u.user?.id;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, training_level, is_education_chief, role")
    .eq("status", "approved")
    .order("full_name", { ascending: true });
  if (error) { console.warn(error); return []; }
  return (data ?? [])
    .filter((p) => p.id !== me && p.role !== "test" && !String(p.email || "").startsWith("placeholder+"))
    .map((p) => ({
      id: p.id,
      name: (p.full_name || p.email || "Unnamed").trim(),
      level: p.training_level,
      chief: !!p.is_education_chief,
    }));
}

export async function deleteTest(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("saved_tests").delete().eq("id", id);
  if (error) console.warn(error);
}
