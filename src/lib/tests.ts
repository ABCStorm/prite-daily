// Saved tests: named, hand-picked question sets for running a class session
// (live poll), re-studying, or exporting to PowerPoint. Stored in Supabase
// under the creating user's account (table `saved_tests`, see migration
// 0023) so a test built on one device — e.g. at home — is still there when
// the host signs in on the presenting computer. Question ids are the stable
// `${year}:${q_index}` keys, so a test survives bank updates.

import { supabase } from "./supabase";

export type SavedTest = {
  id: string;
  name: string;
  qids: string[];   // question ids in presentation order
  created: string;  // ISO date
};

function clampName(name: string) {
  return name.trim().slice(0, 60) || "Untitled test";
}

export async function loadTests(): Promise<SavedTest[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("saved_tests")
    .select("id, name, qids, created_at")
    .order("created_at", { ascending: false });
  if (error) { console.warn(error); return []; }
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, qids: (r.qids as string[]) ?? [], created: r.created_at }));
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
  return { id: data.id, name: data.name, qids: (data.qids as string[]) ?? [], created: data.created_at };
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

export async function deleteTest(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("saved_tests").delete().eq("id", id);
  if (error) console.warn(error);
}
