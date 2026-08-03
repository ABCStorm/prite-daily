import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "./supabase";
import { getMyProfile, type Profile } from "./db";

/* Tracks the Supabase session + the user's profile (with approval status).
   In local-only mode (no env) it resolves immediately with no session.

   Safari note: if getSession / getMyProfile hang or reject (IndexedDB lock,
   flaky network, content blockers), we must still clear `loading` — otherwise
   the app freezes on "Signing you in…" forever. Always use finally + a timeout. */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(isConfigured);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    // Safety net: never leave the gate stuck if storage/network stalls (Safari ITP).
    const failSafe = window.setTimeout(() => { if (alive) setLoading(false); }, 10000);
    supabase.auth.getSession()
      .then(({ data }) => { if (alive) setSession(data.session); })
      .catch(() => { if (alive) setSession(null); })
      .finally(() => { /* loading cleared by profile effect / failSafe */ });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (alive) setSession(s);
    });
    return () => {
      alive = false;
      window.clearTimeout(failSafe);
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!supabase) { setLoading(false); return; }
    if (!session) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    const failSafe = window.setTimeout(() => { if (alive) setLoading(false); }, 10000);
    getMyProfile()
      .then((p) => { if (alive) setProfile(p); })
      .catch(() => { if (alive) setProfile(null); })
      .finally(() => {
        if (alive) setLoading(false);
        window.clearTimeout(failSafe);
      });
    return () => {
      alive = false;
      window.clearTimeout(failSafe);
    };
  }, [session?.user?.id]);

  const reloadProfile = () => getMyProfile().then(setProfile).catch(() => null);
  return { session, profile, loading, reloadProfile };
}
