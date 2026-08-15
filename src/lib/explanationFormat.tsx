import React from "react";

/**
 * Explanations in the bank are plain text with a deliberately tiny markup vocabulary:
 *   **bold**, *italic*, `• ` bullet lines, and blank lines between blocks.
 * The first line is a topic emoji + a bolded title.
 *
 * Anything richer (markdown headings, tables, HTML) is intentionally NOT supported — the
 * reformatting pass in `extraction/fmt_explanations.py` rejects it, so a full markdown
 * dependency would be dead weight. Unrecognized characters render as themselves.
 */

const BULLET = /^[•]\s+/;

// Splits on **bold** / *italic* while keeping the delimiters, so unmatched markers survive as text.
const INLINE = /(\*\*[^*]+\*\*|\*[^*\n]+\*)/g;

/**
 * Missing-key-page disclaimers are prepended in the bank as a leading
 * "INFERRED ANSWER — …" block. Pull them out so the real teaching content
 * can render first, and the disclaimer can sit smaller underneath.
 *
 * Two bank shapes (both always start with INFERRED ANSWER):
 *   1. "…not an official keyed answer. Rationale: <body>"
 *   2. "…not an official answer for this exam copy.\n\n<body>"
 */
export function splitInferredAnswerNotice(text: string): { body: string; notice: string | null } {
  const raw = text || "";
  if (!raw.startsWith("INFERRED ANSWER")) return { body: raw, notice: null };

  const rationale = raw.match(
    /^(INFERRED ANSWER —[\s\S]+?not an official keyed answer\.)\s*Rationale:\s*([\s\S]*)$/
  );
  if (rationale) {
    return { notice: rationale[1].trim(), body: rationale[2].trim() };
  }

  const blank = raw.match(/^(INFERRED ANSWER —[\s\S]+?)\n\s*\n([\s\S]*)$/);
  if (blank) {
    return { notice: blank[1].replace(/\s+/g, " ").trim(), body: blank[2].trim() };
  }

  // Fallback: whole string is the notice (shouldn't happen with current bank).
  return { notice: raw.trim(), body: "" };
}

function inline(text: string, keyBase: string): React.ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key} style={{ fontWeight: 700, color: "inherit" }}>{part.slice(2, -2)}</strong>;
    }
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

type Props = {
  text: string;
  /** Applied to the wrapper — font size, colour, line height come from the call site. */
  style?: React.CSSProperties;
  /** Colour for the leading title line and section headers. */
  accent?: string;
};

/**
 * Renders an explanation with its bold spans, bullets and block spacing.
 * Falls back to plain pre-wrap text for anything that isn't recognised markup.
 * Inferred-answer disclaimers render last, smaller, so they don't dominate.
 */
export function ExplanationText({ text, style, accent = "#48c78e" }: Props) {
  const { body, notice } = React.useMemo(() => splitInferredAnswerNotice(text || ""), [text]);

  const blocks = React.useMemo(() => {
    const lines = body.replace(/\r\n?/g, "\n").split("\n");
    const out: Array<{ kind: "title" | "para" | "bullets"; lines: string[] }> = [];
    let bullets: string[] = [];
    const flush = () => {
      if (bullets.length) { out.push({ kind: "bullets", lines: bullets }); bullets = []; }
    };
    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) { flush(); return; }
      if (BULLET.test(line)) { bullets.push(line.replace(BULLET, "")); return; }
      flush();
      // First non-empty content line is the emoji + bolded topic title when present.
      // Skip title treatment for plain prose (no emoji / no **title** markup).
      const looksLikeTitle =
        !out.length && (/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(line) || /\*\*[^*]+\*\*/.test(line));
      out.push({ kind: looksLikeTitle ? "title" : "para", lines: [line] });
    });
    flush();
    return out;
  }, [body]);

  return (
    <div style={{ whiteSpace: "pre-wrap", ...style }}>
      {blocks.map((b, i) => {
        if (b.kind === "bullets") {
          return (
            <ul key={i} style={{ margin: "0 0 0.7em", paddingLeft: "1.15em", listStyle: "none" }}>
              {b.lines.map((ln, j) => (
                <li key={j} style={{ position: "relative", marginBottom: "0.35em" }}>
                  <span aria-hidden style={{ position: "absolute", left: "-1.05em", color: accent, opacity: 0.85 }}>•</span>
                  {inline(ln, `${i}-${j}`)}
                </li>
              ))}
            </ul>
          );
        }
        if (b.kind === "title") {
          return (
            <div key={i} style={{ margin: "0 0 0.7em", fontSize: "1.05em", color: accent, letterSpacing: 0.1 }}>
              {inline(b.lines[0], `t${i}`)}
            </div>
          );
        }
        return (
          <p key={i} style={{ margin: "0 0 0.7em" }}>{inline(b.lines[0], `p${i}`)}</p>
        );
      })}
      {notice && (
        <div
          style={{
            marginTop: blocks.length ? 10 : 0,
            padding: "7px 10px",
            borderRadius: 8,
            border: "1px solid rgba(72, 199, 142, 0.22)",
            background: "rgba(72, 199, 142, 0.06)",
            fontSize: "0.78em",
            lineHeight: 1.45,
            color: "rgba(175, 190, 180, 0.92)",
            letterSpacing: 0.01,
            whiteSpace: "normal",
          }}
        >
          <span style={{ fontWeight: 650, color: "rgba(120, 190, 155, 0.95)", marginRight: 4 }}>
            Inferred answer.
          </span>
          {notice.replace(/^INFERRED ANSWER\s*[—–-]\s*/i, "")}
        </div>
      )}
    </div>
  );
}

/** Body-first plain text (notice last) for PPTX / clipboard. */
export function plainExplanation(text: string): string {
  const { body, notice } = splitInferredAnswerNotice(text || "");
  const main = body
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .trim();
  if (!notice) return main;
  const note = notice
    .replace(/^INFERRED ANSWER\s*[—–-]\s*/i, "Inferred answer: ")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1");
  return main ? `${main}\n\n${note}` : note;
}

/** As plainExplanation, but also drops the title emoji — jsPDF's Latin-1 fonts render it as "?". */
export function pdfExplanation(text: string): string {
  return plainExplanation(text)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, "")
    .replace(/^[ \t]+/gm, "")
    .trim();
}

/** Converts the markup to the small HTML subset Anki fields accept. */
export function htmlExplanation(text: string): string {
  const { body, notice } = splitInferredAnswerNotice(text || "");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmt = (s: string) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/\*([^*\n]+)\*/g, "<i>$1</i>");
  const main = fmt(body);
  if (!notice) return main;
  const note = fmt(notice.replace(/^INFERRED ANSWER\s*[—–-]\s*/i, "Inferred answer: "));
  return main ? `${main}<br><br><i style="font-size:0.9em">${note}</i>` : `<i>${note}</i>`;
}
