import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "./supabase";
import { getMyProfile, type Profile } from "./db";

/* Tracks the Supabase session + the user's profile (with approval status).
   In local-only mode (no env) it resolves immediately with no session. */
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(isConfigured);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let alive = true;
    if (!supabase) { setLoading(false); return; }
    if (!session) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    getMyProfile().then((p) => { if (alive) { setProfile(p); setLoading(false); } });
    return () => { alive = false; };
  }, [session?.user?.id]);

  const reloadProfile = () => getMyProfile().then(setProfile);
  return { session, profile, loading, reloadProfile };
}
