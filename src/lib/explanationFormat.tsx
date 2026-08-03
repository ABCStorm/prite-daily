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
 */
export function ExplanationText({ text, style, accent = "#48c78e" }: Props) {
  const blocks = React.useMemo(() => {
    const lines = (text || "").replace(/\r\n?/g, "\n").split("\n");
    const out: Array<{ kind: "title" | "para" | "bullets"; lines: string[] }> = [];
    let bullets: string[] = [];
    const flush = () => {
      if (bullets.length) { out.push({ kind: "bullets", lines: bullets }); bullets = []; }
    };
    lines.forEach((raw, i) => {
      const line = raw.trim();
      if (!line) { flush(); return; }
      if (BULLET.test(line)) { bullets.push(line.replace(BULLET, "")); return; }
      flush();
      // The first non-empty line is the emoji + bolded topic title.
      const isTitle = i === 0 || !out.length;
      out.push({ kind: isTitle ? "title" : "para", lines: [line] });
    });
    flush();
    return out;
  }, [text]);

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
    </div>
  );
}

/** Strips the markup vocabulary for plain-text destinations (PPTX, clipboard). */
export function plainExplanation(text: string): string {
  return (text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1");
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
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*\n]+)\*/g, "<i>$1</i>");
}
