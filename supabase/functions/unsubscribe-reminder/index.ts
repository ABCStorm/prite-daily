// One-click unsubscribe for daily reminder emails. Public (no login) — the
// link carries a signed token instead, verified against UNSUB_SECRET, so it
// can only flip off the daily_reminder setting for the specific user it was
// issued to. Deploy WITHOUT JWT verification:
//   supabase functions deploy unsubscribe-reminder --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyUnsubscribeToken } from "../_shared/unsubToken.ts";

const page = (body: string, status = 200) =>
  new Response(
    `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
     <body style="font-family:-apple-system,Segoe UI,system-ui,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#23262f;padding:0 20px">${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const userId = url.searchParams.get("u");
  const token = url.searchParams.get("t");
  const secret = Deno.env.get("UNSUB_SECRET");

  if (!secret || !userId || !token) return page("<h2>Invalid unsubscribe link.</h2>", 400);

  const ok = await verifyUnsubscribeToken(userId, token, secret);
  if (!ok) return page("<h2>Invalid or expired unsubscribe link.</h2>", 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await admin.from("settings").update({ daily_reminder: false }).eq("user_id", userId);
  if (error) return page(`<h2>Something went wrong.</h2><p>${error.message}</p>`, 500);

  return page(`
    <h2 style="color:#0e7a6b">You're unsubscribed</h2>
    <p style="font-size:15px;line-height:1.5">You won't get any more daily reminder emails from PRITE Daily.
    You can turn them back on anytime in the app's Settings.</p>
  `);
});
