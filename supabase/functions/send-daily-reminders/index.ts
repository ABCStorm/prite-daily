// Daily practice-reminder emailer. Invoked once a day by a scheduler (pg_cron +
// pg_net, or any external cron) — see README.md. Emails every approved member
// who's due today, via Resend. "Due" combines two things:
//   - on/off: settings.daily_reminder is tri-state. true/false = the user
//     explicitly overrode it (Settings toggle, or the email's Unsubscribe
//     link); null = auto — on during the 90 days before the user's exam date
//     (or a guessed Oct 15 if unset), off otherwise (see reminderWindow.ts).
//   - frequency: settings.reminder_every_days (default 1 = daily); only sent
//     on days where daysSinceEpoch % reminder_every_days === 0.
// Each email also reports the recipient's rank in the residency for the
// current discrete 2-week contest period (contestPeriods.ts — non-overlapping
// periods tiling backward from Oct 7, not a rolling window, so there's an
// actual winner to declare at each boundary), a countdown-to-exam badge (real
// exam_date if set, else the same guessed Oct 15 used for the auto window —
// hidden once the date has passed), a rotating dad joke, and one-click
// Unsubscribe / Change frequency links. The morning after each contest period
// ends, everyone also gets a fun winner-announcement card. The opening
// greeting and rank-recap sentence are picked from rotating pools
// (greetings.ts) so regular recipients don't see identical wording every day.
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
import { currentContestPeriod, periodEndingYesterday } from "./contestPeriods.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

/** Distinct questions first-answered per user within [startYmd, endYmd] inclusive. */
async function distinctQuestionsByUser(
  admin: ReturnType<typeof createClient>,
  startYmd: string,
  endYmd: string,
): Promise<Map<string, Set<string>>> {
  const gte = `${startYmd}T00:00:00.000Z`;
  const lt = new Date(new Date(endYmd + "T00:00:00").getTime() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin.from("answers").select("user_id, question_id").gte("created_at", gte).lt("created_at", lt);
  if (error) throw new Error(error.message);
  const map = new Map<string, Set<string>>();
  for (const row of (data ?? []) as any[]) {
    if (!map.has(row.user_id)) map.set(row.user_id, new Set());
    map.get(row.user_id)!.add(row.question_id);
  }
  return map;
}

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
  const today = new Date();

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

  // Distinct questions first-answered (created_at, immutable per question)
  // within the current discrete 2-week contest period — or a rolling 14-day
  // window once the contest season is over (past the final Oct 7 cutoff).
  const period = currentContestPeriod(today);
  let doneByUser: Map<string, Set<string>>;
  try {
    doneByUser = period
      ? await distinctQuestionsByUser(admin, period.start, period.end)
      : await distinctQuestionsByUser(
          admin,
          new Date(today.getTime() - TWO_WEEKS_MS).toISOString().slice(0, 10),
          today.toISOString().slice(0, 10),
        );
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }

  // If today is the morning after a contest period ended, find that period's
  // winner(s) (ties share the win) for the announcement card.
  const justEnded = periodEndingYesterday(today);
  let winnerNames: string[] = [];
  let winnerCount = 0;
  let winnerIds = new Set<string>();
  if (justEnded) {
    try {
      const finishedDoneByUser = await distinctQuestionsByUser(admin, justEnded.start, justEnded.end);
      const finishedBoard = (profiles ?? [])
        .map((p: any) => ({ id: p.id as string, name: (p.full_name as string) || "", answered: finishedDoneByUser.get(p.id)?.size ?? 0 }))
        .sort((a, b) => b.answered - a.answered);
      winnerCount = finishedBoard[0]?.answered ?? 0;
      if (winnerCount > 0) {
        const winners = finishedBoard.filter((p) => p.answered === winnerCount);
        winnerNames = winners.map((p) => p.name.split(" ")[0] || "Someone");
        winnerIds = new Set(winners.map((p) => p.id));
      }
    } catch { /* winner card is a nice-to-have; never block the send over it */ }
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

  // Winner-announcement card — only rendered the one morning after a contest
  // period ends. Framed differently for the winner(s) themselves vs. everyone
  // else, so it reads as a personal result, not a generic broadcast.
  const winnerCardHtml = (recipientId: string): string => {
    if (!justEnded || winnerCount === 0 || winnerNames.length === 0) return "";
    const iWon = winnerIds.has(recipientId);
    const tied = winnerNames.length > 1;
    const namesJoined = !tied ? winnerNames[0]
      : winnerNames.length === 2 ? `${winnerNames[0]} & ${winnerNames[1]}`
      : `${winnerNames.slice(0, -1).join(", ")} & ${winnerNames[winnerNames.length - 1]}`;
    const qWord = `question${winnerCount === 1 ? "" : "s"}`;
    const headline = iWon ? (tied ? "You tied for the win! 🎉" : "You won! 🎉") : `${namesJoined} ${tied ? "tied for" : "took"} the crown!`;
    const sub = iWon
      ? `${winnerCount} ${qWord} over the last 2 weeks — nice work! A new 2-week round just started.`
      : `${winnerCount} ${qWord} over the last 2 weeks. Think you can take it next round?`;
    return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px"><tr>
        <td style="background:#fdf3d8;border:2px solid #f0d488;border-radius:14px;padding:16px 18px;text-align:center;font-family:-apple-system,Segoe UI,system-ui,sans-serif">
          <div style="font-size:26px;line-height:1;margin:0 0 6px">🏆🎉🏆</div>
          <div style="font-size:16px;font-weight:800;color:#8a6a1e;margin:0 0 4px">${headline}</div>
          <div style="font-size:13.5px;color:#9c7d33">${sub}</div>
        </td>
      </tr></table>`;
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

      ${winnerCardHtml(r.id)}

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
