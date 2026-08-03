import { supabase } from "./supabase";

/* Admin-only residency usage dashboard data.
   Backed by the SECURITY DEFINER RPC admin_usage_dashboard (migration 0059). */

export type UsageDay = {
  day: string;
  practice_answers: number;
  poll_answers: number;
  total_answers: number;
  active_users: number;
  first_try_pct: number | null;
};

export type UsageLevel = {
  level: string;
  roster: number;
  active_in_window: number;
  practice_answers: number;
  first_try_pct: number | null;
  active_7d: number;
};

export type UsagePerson = {
  name: string;
  level: string;
  answers?: number;
  first_try_pct?: number | null;
  last_active?: string | null;
  role?: string;
  practice_answers?: number;
  poll_answers?: number;
};

export type UsageDashboard = {
  generated_at: string;
  days_back: number;
  timezone: string;
  roster: {
    approved: number;
    residents: number;
    r1: number; r2: number; r3: number; r4: number;
    fellows: number;
    faculty: number;
    alumni: number;
    pending: number;
    blocked: number;
  };
  totals: {
    practice_in_window: number;
    poll_in_window: number;
    practice_users_in_window: number;
    active_users_in_window: number;
    practice_7d: number;
    users_7d: number;
    practice_30d: number;
    users_30d: number;
    practice_all_time: number;
    practice_today: number;
    users_today: number;
    first_try_pct_window: number | null;
  };
  polls: { votes: number; voters: number; sessions: number };
  daily: UsageDay[];
  by_level: UsageLevel[];
  top_users: UsagePerson[];
  quiet_users: UsagePerson[];
  signups: { day: string; n: number }[];
};

export async function fetchAdminUsageDashboard(daysBack = 90): Promise<UsageDashboard | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("admin_usage_dashboard", { days_back: daysBack });
  if (error) {
    console.warn("admin_usage_dashboard", error.message);
    throw new Error(error.message);
  }
  return data as UsageDashboard;
}

/** CSV of quiet / low-activity people for education-chief outreach. */
export function quietUsersCsv(rows: UsagePerson[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["name", "level", "role", "practice_answers", "poll_answers", "last_active"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      esc(r.name),
      esc(r.level),
      esc(r.role ?? ""),
      esc(r.practice_answers ?? 0),
      esc(r.poll_answers ?? 0),
      esc(r.last_active ? new Date(r.last_active).toLocaleDateString() : "never"),
    ].join(","));
  }
  return lines.join("\n");
}
