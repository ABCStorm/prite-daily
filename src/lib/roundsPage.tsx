import React, { useState } from "react";
import { ExternalLink, Newspaper, Send } from "lucide-react";

export const WRIGHT_ROUNDS_URL = "https://wrightrounds.com";
const FEEDBACK_URL = "https://wrightrounds.com/api/feedback";

type Theme = {
  text: string;
  muted: string;
  faint: string;
  teal: string;
  tealSoft: string;
  paperEdge: string;
  card: string;
  [key: string]: string | undefined;
};

export function RoundsLanding({
  theme: T,
  defaultName,
  defaultEmail,
}: {
  theme: Theme;
  defaultName?: string;
  defaultEmail?: string;
}) {
  const [name, setName] = useState(defaultName || "");
  const [email, setEmail] = useState(defaultEmail || "");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "err">("idle");
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setStatus("err");
      setErr("Write a note first.");
      return;
    }
    setStatus("sending");
    setErr("");
    try {
      const r = await fetch(FEEDBACK_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
          source: "prite-daily",
          website: "",
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Could not send (${r.status})`);
      }
      setStatus("ok");
      setMessage("");
    } catch (e) {
      setStatus("err");
      setErr(e instanceof Error ? e.message : "Could not send just now.");
    }
  };

  const field: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(255,255,255,.04)",
    color: T.text,
    border: `1px solid ${T.paperEdge}`,
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 15,
    fontFamily: "inherit",
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
        <span style={{
          display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 10,
          background: T.tealSoft, color: T.teal, flexShrink: 0,
        }}>
          <Newspaper size={18} strokeWidth={2.1} />
        </span>
        <div>
          <div style={{ fontSize: 20, fontWeight: 750, color: T.text, letterSpacing: "-0.02em" }}>
            Morning Rounds
          </div>
          <div style={{ color: T.muted, fontSize: 14, marginTop: 4, lineHeight: 1.5 }}>
            The daily psychiatry teaching briefing for Wright State — research, a
            fact, and a psychotherapy pearl in one email.
          </div>
        </div>
      </div>

      <p style={{ color: T.text, fontSize: 15, lineHeight: 1.6, margin: "0 0 16px" }}>
        Subscribe, read the archive, or change your preferences on the newsletter site.
      </p>
      <a
        href={WRIGHT_ROUNDS_URL}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: T.teal, color: "#fff", textDecoration: "none",
          fontWeight: 650, fontSize: 14, borderRadius: 10, padding: "10px 14px",
        }}
      >
        Open wrightrounds.com <ExternalLink size={14} />
      </a>

      <div style={{
        marginTop: 28, paddingTop: 22, borderTop: `1px solid ${T.paperEdge}`,
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: T.text, marginBottom: 6 }}>
          What should we change?
        </div>
        <p style={{ color: T.muted, fontSize: 14, lineHeight: 1.55, margin: "0 0 14px" }}>
          Tell us what is useful, what is missing, or what is getting in the way —
          Morning Rounds, PRITE Daily, or residency teaching in general.
        </p>
        {status === "ok" ? (
          <p style={{ color: T.teal, fontSize: 14.5, fontWeight: 600 }}>
            Got it — thank you. We read every note.
          </p>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (optional)"
              style={field}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional)"
              style={field}
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's working, what isn't, what you wish we built…"
              rows={5}
              required
              style={{ ...field, resize: "vertical", minHeight: 120 }}
            />
            {status === "err" && (
              <div style={{ color: "#f0b4b4", fontSize: 13 }}>{err}</div>
            )}
            <button
              type="submit"
              disabled={status === "sending"}
              style={{
                justifySelf: "start",
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "transparent", color: T.teal,
                border: `1px solid ${T.teal}`, borderRadius: 10,
                padding: "8px 14px", fontWeight: 650, fontSize: 14, cursor: "pointer",
                opacity: status === "sending" ? 0.6 : 1,
              }}
            >
              <Send size={14} /> {status === "sending" ? "Sending…" : "Send feedback"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
