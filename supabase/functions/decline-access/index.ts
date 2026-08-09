// Admin-only: decline a pending access request.
// Sets the profile to blocked and emails the applicant a polite notice via
// Resend (same secrets as send-daily-reminders). Two flavors, chosen by the
// admin in the Approvals panel via the `variant` field:
//   "generic" — unknown requester: plain "accounts are limited to the program"
//               notice. Deliberately does NOT lead with the copyright angle.
//   "student" — likely M4 or visiting medical student: same restriction, but
//               framed as a warm invitation to the Tuesday didactics board-
//               question sessions, which they're welcome to join in person.
//
// Secrets (Project Settings → Edge Functions):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY  (auto-injected)
//   RESEND_API_KEY    — Resend key
//   REMINDER_FROM     — e.g. "PRITE Daily <noreply@pritedaily.com>" (verified domain)
//
// Deploy (JWT verification ON — callers send the user's session token):
//   supabase functions deploy decline-access

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const CONTACT = "correllsoftware@gmail.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type DeclineVariant = "generic" | "student";

const shell = (inner: string) => `<div style="font-family:-apple-system,Segoe UI,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#23262f">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
      <td style="width:32px;height:32px;background:#0e7a6b;border-radius:9px;text-align:center;vertical-align:middle;font-size:15px;font-weight:800;color:#fff;font-family:-apple-system,Segoe UI,system-ui,sans-serif">P</td>
      <td style="padding-left:9px;font-size:18px;font-weight:800;color:#0e7a6b;font-family:-apple-system,Segoe UI,system-ui,sans-serif;vertical-align:middle">PRITE Daily</td>
    </tr></table>
${inner}
    <p style="font-size:14px;line-height:1.5;color:#5c6d6a;margin:0">— PRITE Daily</p>
  </div>`;

const P = 'style="font-size:15px;line-height:1.55;margin:0 0 14px"';
const CALLOUT = 'style="font-size:15px;line-height:1.55;margin:0 0 14px;padding:12px 14px;background:#f7f4ee;border-left:3px solid #0e7a6b;border-radius:0 8px 8px 0"';

function buildEmail(fullName: string | null, variant: DeclineVariant): { subject: string; html: string; text: string } {
  const first = (fullName || "").trim().split(/\s+/)[0] || "there";

  if (variant === "student") {
    const subject = "About PRITE Daily — and an invitation to our board-question sessions";
    const text =
      `Hi ${first},\n\n` +
      `Thanks for checking out PRITE Daily—and welcome, if you're rotating with us!\n\n` +
      `A little board-related bureaucracy means we can't give medical students access to the ` +
      `full question bank. (It's not you. It's psychiatry's version of airport security.)\n\n` +
      `But you're absolutely welcome at our board-question sessions during Tuesday didactics. ` +
      `You can answer the live polls from your phone—no account, password, or secret handshake ` +
      `required—and join the discussion with everyone else.\n\n` +
      `Hope to see you Tuesday!\n\n` +
      `— PRITE Daily`;

    const html = shell(`
    <p ${P}>Hi ${escapeHtml(first)},</p>
    <p ${P}>Thanks for checking out PRITE Daily—and welcome, if you're rotating with us!</p>
    <p ${P}>
      A little board-related bureaucracy means we can't give medical students access to the full question
      bank. (It's not you. It's psychiatry's version of airport security.)
    </p>
    <p ${CALLOUT}>
      But you're absolutely welcome at our <b>board-question sessions during Tuesday didactics</b>. You can
      answer the live polls from your phone—no account, password, or secret handshake required—and join the
      discussion with everyone else.
    </p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 22px">Hope to see you Tuesday!</p>`);

    return { subject, html, text };
  }

  const subject = "About your PRITE Daily access request";
  const text =
    `Hi ${first},\n\n` +
    `Thanks for checking out PRITE Daily!\n\n` +
    `A little board-related bureaucracy means we have to keep full question-bank accounts ` +
    `limited to residents and faculty within our program, so we aren't able to set you up ` +
    `with one. (Nothing personal—it's psychiatry's version of airport security.)\n\n` +
    `Thanks for understanding, and sorry we couldn't be more help!\n\n` +
    `— PRITE Daily`;

  const html = shell(`
    <p ${P}>Hi ${escapeHtml(first)},</p>
    <p ${P}>Thanks for checking out PRITE Daily!</p>
    <p ${P}>
      A little board-related bureaucracy means we have to keep full question-bank accounts limited to
      residents and faculty within our program, so we aren't able to set you up with one. (Nothing
      personal—it's psychiatry's version of airport security.)
    </p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 22px">Thanks for understanding, and sorry we couldn't be more help!</p>`);

  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Caller must be a signed-in admin (is_admin flag or legacy role='admin').
    const authHeader = req.headers.get("Authorization") ?? "";
    const scoped = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await scoped.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return json({ error: "Sign in to continue." }, 401);

    const { data: me } = await admin
      .from("profiles")
      .select("status, role, is_admin")
      .eq("id", uid)
      .maybeSingle();
    if (!me || me.status !== "approved" || (!me.is_admin && me.role !== "admin")) {
      return json({ error: "Only an administrator can decline access requests." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const profileId = typeof body?.profile_id === "string" ? body.profile_id.trim() : "";
    // Older clients don't send a variant — fall back to the plain notice.
    const variant: DeclineVariant = body?.variant === "student" ? "student" : "generic";
    if (!profileId) return json({ error: "profile_id required" }, 400);
    if (profileId === uid) return json({ error: "You can't decline your own account." }, 400);

    const { data: target, error: loadErr } = await admin
      .from("profiles")
      .select("id, email, full_name, status")
      .eq("id", profileId)
      .maybeSingle();
    if (loadErr) return json({ error: loadErr.message }, 500);
    if (!target) return json({ error: "Profile not found." }, 404);
    if (!target.email) return json({ error: "That account has no email address." }, 400);

    // Block first so access is revoked even if the email provider hiccups.
    if (target.status !== "blocked") {
      const { error: updErr } = await admin
        .from("profiles")
        .update({ status: "blocked" })
        .eq("id", profileId);
      if (updErr) return json({ error: updErr.message }, 500);
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const from = Deno.env.get("REMINDER_FROM");
    if (!resendKey || !from) {
      return json({
        ok: true,
        blocked: true,
        emailed: false,
        warning: "Account blocked, but RESEND_API_KEY / REMINDER_FROM is not set so no email was sent.",
      });
    }

    const { subject, html, text } = buildEmail(target.full_name, variant);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: target.email,
        cc: [CONTACT],
        reply_to: CONTACT,
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("resend decline email failed", res.status, detail);
      return json({
        ok: true,
        blocked: true,
        emailed: false,
        warning: `Account blocked, but the email failed to send (${res.status}).`,
        detail,
      });
    }

    return json({ ok: true, blocked: true, emailed: true, email: target.email, variant });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
