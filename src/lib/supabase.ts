import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* Supabase browser client.

   Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the environment
   (.env.local — see .env.example). When they're absent the app still runs in
   "local-only" mode (browse questions, ephemeral notes); `supabase` is null and
   `isConfigured` is false so the UI can degrade gracefully. */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anon);

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, anon!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

/** Always open Google's account picker so Chrome doesn't silently reuse
    a wright.edu Workspace session when the roster expects personal Gmail. */
export async function signInWithGoogle() {
  if (!supabase) throw new Error("Supabase not configured");
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: "select_account" },
    },
  });
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
}

/** Sign out, then start Google OAuth with the account picker — used when the
    signed-in Google account isn't the personal Gmail on the roster. */
export async function switchGoogleAccount() {
  if (supabase) await supabase.auth.signOut();
  return signInWithGoogle();
}

/** A question's stable id used as the foreign key across all user data. */
export function questionId(year: string, qIndex: number) {
  return `${year}-${qIndex}`;
}
