// Admin-only: decline a pending access request.
// Sets the profile to blocked and emails the applicant a polite copyright /
// residency-only notice via Resend (same secrets as send-daily-reminders).
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

function buildEmail(fullName: string | null): { subject: string; html: string; text: string } {
  const first = (fullName || "").trim().split(/\s+/)[0] || "there";
  const subject = "Regarding your PRITE Daily access request";
  const text =
    `Hi ${first},\n\n` +
    `Thank you for your interest in PRITE Daily.\n\n` +
    `We're not able to approve a full account for this request. The PRITE practice questions ` +
    `on this site are copyrighted material and are intended for internal use within ` +
    `our residency program only.\n\n` +
    `If you're a medical student: due to restrictions from the ABPN, we can't grant a full ` +
    `account that would let you download questions. That said, we would love to have you join ` +
    `in the polls during class — you're very welcome there!\n\n` +
    `If you believe this was a mistake — for example, if you are a current resident, ` +
    `faculty member, or otherwise affiliated with the program — please email ` +
    `${CONTACT} and we'll be happy to sort it out.\n\n` +
    `Thank you for understanding.\n\n` +
    `— PRITE Daily`;

  const html = `<div style="font-family:-apple-system,Segoe UI,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#23262f">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
      <td style="width:32px;height:32px;background:#0e7a6b;border-radius:9px;text-align:center;vertical-align:middle;font-size:15px;font-weight:800;color:#fff;font-family:-apple-system,Segoe UI,system-ui,sans-serif">P</td>
      <td style="padding-left:9px;font-size:18px;font-weight:800;color:#0e7a6b;font-family:-apple-system,Segoe UI,system-ui,sans-serif;vertical-align:middle">PRITE Daily</td>
    </tr></table>

    <p style="font-size:15px;line-height:1.55;margin:0 0 14px">Hi ${escapeHtml(first)},</p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 14px">Thank you for your interest in PRITE Daily.</p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 14px">
      We're not able to approve a full account for this request. The PRITE practice questions on this site
      are <b>copyrighted material</b> and are intended for <b>internal use within our residency program only</b>.
    </p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 14px;padding:12px 14px;background:#f7f4ee;border-left:3px solid #0e7a6b;border-radius:0 8px 8px 0">
      <b>If you're a medical student:</b> due to restrictions from the ABPN, we can't grant a full account
      that would let you download questions. That said, we would love to have you join in the polls
      during class — you're very welcome there!
    </p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 14px">
      If you believe this was a mistake — for example, if you are a current resident, faculty member,
      or otherwise affiliated with the program — please email
      <a href="mailto:${CONTACT}" style="color:#0e7a6b;font-weight:600">${CONTACT}</a>
      and we'll be happy to sort it out.
    </p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 22px">Thank you for understanding.</p>
    <p style="font-size:14px;line-height:1.5;color:#5c6d6a;margin:0">— PRITE Daily</p>
  </div>`;

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

    const { subject, html, text } = buildEmail(target.full_name);
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

    return json({ ok: true, blocked: true, emailed: true, email: target.email });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
