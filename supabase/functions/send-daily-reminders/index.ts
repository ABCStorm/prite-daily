// Daily practice-reminder emailer. Invoked once a day by a scheduler (pg_cron +
// pg_net, or any external cron) — see README.md. Emails every approved member who
// opted in (settings.daily_reminder = true), via Resend.
//
// Secrets (Project Settings -> Edge Functions):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-injected)
//   RESEND_API_KEY    — Resend key
//   REMINDER_FROM     — e.g. "PRITE Daily <noreply@pritedaily.com>" (verified domain)
//   CRON_SECRET       — shared secret; the caller must send it as x-cron-secret
//   APP_URL           — optional, defaults to https://pritedaily.com
//
// Deploy WITHOUT JWT verification (it's gated by CRON_SECRET instead):
//   supabase functions deploy send-daily-reminders --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  // Only the scheduler (holding CRON_SECRET) may trigger a send.
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "unauthorized" }, 401);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("REMINDER_FROM");
  if (!resendKey || !from) return json({ error: "RESEND_API_KEY / REMINDER_FROM not set" }, 500);
  const appUrl = Deno.env.get("APP_URL") || "https://pritedaily.com";

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Opted-in + approved members, with their email.
  const { data, error } = await admin
    .from("settings")
    .select("user_id, daily_reminder, profiles!inner(email, full_name, status)")
    .eq("daily_reminder", true)
    .eq("profiles.status", "approved");
  if (error) return json({ error: error.message }, 500);

  const recipients = (data ?? [])
    .map((r: any) => ({ email: r.profiles?.email as string, name: (r.profiles?.full_name as string) || "" }))
    .filter((r) => r.email);

  let sent = 0; const failures: string[] = [];
  for (const r of recipients) {
    const first = (r.name || "").split(" ")[0] || "there";
    const html = `<div style="font-family:-apple-system,Segoe UI,system-ui,sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#0e7a6b;margin:0 0 6px">PRITE Daily</h2>
      <p style="font-size:15px;line-height:1.5;color:#23262f">Good morning, ${first} — time for today's PRITE practice. A few questions a day keeps the in-training exam from sneaking up on you.</p>
      <p style="margin:18px 0"><a href="${appUrl}" style="background:#0e7a6b;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:10px;font-size:15px">Do today's set →</a></p>
      <p style="font-size:12px;color:#9aa0ab">You're getting this because you turned on daily reminders. Turn them off anytime in Settings.</p>
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
