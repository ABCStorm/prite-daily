// Daily practice-reminder emailer. Invoked once a day by a scheduler (pg_cron +
// pg_net, or any external cron) — see README.md. Emails every approved member
// who's due today, via Resend. "Due" combines two things:
//   - on/off: settings.daily_reminder is tri-state. true/false = the user
//     explicitly overrode it (Settings toggle, or the email's Unsubscribe
//     link); null = auto — on during the 90 days before the user's exam date
//     (or a guessed Oct 15 if unset), off otherwise (see reminderWindow.ts).
//   - frequency: settings.reminder_every_days (default 1 = daily); only sent
//     on days where daysSinceEpoch % reminder_every_days === 0.
// Each email also reports the recipient's rank in the residency (distinct
// questions done over the trailing 14 days), a countdown-to-exam badge (real
// exam_date if set, else the same guessed Oct 15 used for the auto window —
// hidden once the date has passed), a rotating dad joke, and one-click
// Unsubscribe / Change frequency links. The opening greeting and rank-recap
// sentence are also picked from rotating pools (greetings.ts) so regular
// recipients don't see identical wording every day.
//
// Secrets (Project Settings -> Edge Functions):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-injected)
//   RESEND_API_KEY    — Resend key
//   REMINDER_FROM     — e.g. "PRITE Daily <noreply@pritedaily.com>" (verified domain)
//   CRON_SECRET       — shared secret; the caller must send it as x-cron-secret
//   UNSUB_SECRET      — signs one-click unsubscribe links (see unsubscribe-reminder function)
//   APP_URL           — optional, defaults to https://pritedaily.com
//
// Deploy WITHOUT JWT verification (it's gated by CRON_SECRET instead):
//   supabase functions deploy send-daily-reminders --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";
import { signUnsubscribeToken } from "../_shared/unsubToken.ts";
import { jokeForToday } from "./jokes.ts";
import { isAutoReminderActive, daysUntilExam } from "./reminderWindow.ts";
import { greetingForToday, rankLineForToday } from "./greetings.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  // Only the scheduler (holding CRON_SECRET) may trigger a send.
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "unauthorized" }, 401);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("REMINDER_FROM");
  const unsubSecret = Deno.env.get("UNSUB_SECRET");
  if (!resendKey || !from || !unsubSecret) return json({ error: "RESEND_API_KEY / REMINDER_FROM / UNSUB_SECRET not set" }, 500);
  const appUrl = Deno.env.get("APP_URL") || "https://pritedaily.com";
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Whole residency (approved members), for the leaderboard denominator — not
  // just the opted-in subset who actually get emailed.
  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .eq("status", "approved");
  if (profErr) return json({ error: profErr.message }, 500);

  const { data: settingsRows, error: setErr } = await admin
    .from("settings")
    .select("user_id, daily_reminder, exam_date, reminder_every_days");
  if (setErr) return json({ error: setErr.message }, 500);
  const settingsByUser = new Map<string, { daily_reminder: boolean | null; exam_date: string | null; reminder_every_days: number }>();
  for (const row of (settingsRows ?? []) as any[]) settingsByUser.set(row.user_id, row);

  // Distinct questions first-answered (created_at, immutable per question) in
  // the trailing 14 days — a proxy for "questions done" that isn't inflated by
  // re-attempts on already-answered questions.
  const since = new Date(Date.now() - TWO_WEEKS_MS).toISOString();
  const { data: recent, error: ansErr } = await admin
    .from("answers")
    .select("user_id, question_id")
    .gte("created_at", since);
  if (ansErr) return json({ error: ansErr.message }, 500);

  const doneByUser = new Map<string, Set<string>>();
  for (const row of (recent ?? []) as any[]) {
    if (!doneByUser.has(row.user_id)) doneByUser.set(row.user_id, new Set());
    doneByUser.get(row.user_id)!.add(row.question_id);
  }

  // Rank every approved member by that 14-day count (desc); ties share a rank.
  const board = (profiles ?? [])
    .map((p: any) => ({ id: p.id as string, answered: doneByUser.get(p.id)?.size ?? 0 }))
    .sort((a, b) => b.answered - a.answered);
  const rankOf = new Map<string, number>();
  let rank = 0, lastCount = -1;
  board.forEach((row, i) => {
    if (row.answered !== lastCount) { rank = i + 1; lastCount = row.answered; }
    rankOf.set(row.id, rank);
  });
  const total = board.length;

  const today = new Date();
  const daysSinceEpoch = Math.floor(today.getTime() / 86_400_000);

  const recipients = (profiles ?? [])
    .filter((p: any) => p.email)
    .map((p: any) => {
      const st = settingsByUser.get(p.id);
      const dr = st?.daily_reminder ?? null;
      const every = st?.reminder_every_days ?? 1;
      const effectiveOn = dr === true ? true : dr === false ? false : isAutoReminderActive(st?.exam_date ?? null, today);
      const dueToday = effectiveOn && daysSinceEpoch % every === 0;
      return {
        id: p.id as string,
        email: p.email as string,
        name: (p.full_name as string) || "",
        examDate: (st?.exam_date as string | null) ?? null,
        dueToday,
        answered: doneByUser.get(p.id)?.size ?? 0,
        rank: rankOf.get(p.id) ?? total,
        total,
      };
    })
    .filter((r) => r.dueToday);

  const joke = jokeForToday();

  // Countdown "pill" to the recipient's (real or guessed) exam date. Built as
  // an HTML table for email-client compatibility (Outlook's Word engine
  // ignores border-radius gracefully but still lays the table out fine).
  const countdownHtml = (examDate: string | null): string => {
    const n = daysUntilExam(examDate, today);
    if (n < 0) return ""; // exam date has passed — nothing useful to show
    const inner = n === 0
      ? `<span style="font-size:15px;font-weight:800;color:#0e7a6b">🎉 Exam day is today — good luck!</span>`
      : `<span style="font-size:15px;font-weight:800;color:#0e7a6b">🗓️ ${n} day${n === 1 ? "" : "s"}</span><span style="font-size:13px;color:#5c6d6a"> until your PRITE exam</span>`;
    const note = examDate ? "" : `<p style="font-size:11.5px;color:#9aa0ab;margin:6px 0 0;font-family:-apple-system,Segoe UI,system-ui,sans-serif">Estimated — set your real exam date in Settings for an exact countdown.</p>`;
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 6px"><tr>
        <td style="background:#eaf5f2;border:1px solid #c3e2da;border-radius:999px;padding:8px 16px;font-family:-apple-system,Segoe UI,system-ui,sans-serif;white-space:nowrap">
          ${inner}
        </td>
      </tr></table>${note}`;
  };

  let sent = 0; const failures: string[] = [];
  for (const r of recipients) {
    const first = (r.name || "").split(" ")[0] || "there";
    const greeting = greetingForToday(first);
    const rankLine = r.total > 1
      ? rankLineForToday(r.answered, r.rank, r.total)
      : `Over the past 2 weeks you've done <b>${r.answered}</b> question${r.answered === 1 ? "" : "s"}.`;
    const unsubToken = await signUnsubscribeToken(r.id, unsubSecret);
    const unsubUrl = `${supabaseUrl}/functions/v1/unsubscribe-reminder?u=${encodeURIComponent(r.id)}&t=${unsubToken}`;
    const settingsUrl = `${appUrl}/?openSettings=1`;
    const html = `<div style="font-family:-apple-system,Segoe UI,system-ui,sans-serif;max-width:520px;margin:0 auto">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
        <td style="width:32px;height:32px;background:#0e7a6b;border-radius:9px;text-align:center;vertical-align:middle;font-size:15px;font-weight:800;color:#fff;font-family:-apple-system,Segoe UI,system-ui,sans-serif">P</td>
        <td style="padding-left:9px;font-size:18px;font-weight:800;color:#0e7a6b;font-family:-apple-system,Segoe UI,system-ui,sans-serif;vertical-align:middle">PRITE Daily</td>
      </tr></table>

      <p style="font-size:15px;line-height:1.55;color:#23262f;margin:0 0 12px">${greeting}</p>
      <p style="font-size:15px;line-height:1.55;color:#23262f;margin:0 0 18px">${rankLine}</p>

      ${countdownHtml(r.examDate)}

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 22px"><tr>
        <td style="background:#0e7a6b;border-radius:10px;padding:12px 22px">
          <a href="${appUrl}" style="color:#fff;text-decoration:none;font-weight:700;font-size:15px;font-family:-apple-system,Segoe UI,system-ui,sans-serif">Do today's set →</a>
        </td>
      </tr></table>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 22px"><tr>
        <td style="background:#f7f4ee;border-left:3px solid #d8b45a;border-radius:0 10px 10px 0;padding:13px 15px;font-family:-apple-system,Segoe UI,system-ui,sans-serif">
          <div style="font-size:13.5px;color:#6c7280;line-height:1.5"><span style="font-size:15px">😄</span> <b style="color:#4a4030">Dad joke of the day</b><br>${joke}</div>
        </td>
      </tr></table>

      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #ece5d8;margin:0 0 14px"><tr><td style="padding-top:14px"></td></tr></table>

      <p style="font-size:11.5px;color:#9aa0ab;margin:0 0 12px;font-family:-apple-system,Segoe UI,system-ui,sans-serif">You're getting this because daily reminders are on for your account.</p>
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:8px"><a href="${unsubUrl}" style="display:inline-block;border:1px solid #e2e5ea;color:#6c7280;text-decoration:none;font-size:12px;font-weight:600;padding:7px 14px;border-radius:8px;font-family:-apple-system,Segoe UI,system-ui,sans-serif">Unsubscribe</a></td>
        <td><a href="${settingsUrl}" style="display:inline-block;border:1px solid #e2e5ea;color:#6c7280;text-decoration:none;font-size:12px;font-weight:600;padding:7px 14px;border-radius:8px;font-family:-apple-system,Segoe UI,system-ui,sans-serif">Change frequency</a></td>
      </tr></table>
    </div>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: r.email, subject: "Your PRITE practice for today", html }),
    });
    if (res.ok) sent++; else failures.push(`${r.email}: ${res.status}`);
  }
  return json({ recipients: recipients.length, sent, failures });
});
