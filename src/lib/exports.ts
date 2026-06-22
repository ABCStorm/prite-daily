/* Client-side exports. Builds a self-contained, print-ready HTML study sheet
   and downloads it — no dependency, and the user can open it and Print → Save
   as PDF. Per the spec, exports include the ORIGINAL question + answer but
   deliberately omit the AI explanation. */

import { questionId } from "./supabase";
import type { GroupNote } from "./db";

type RawQuestion = {
  year: string; q_index: number; stem: string;
  options: { letter: string; text: string }[];
  answer_letters: string[]; answer_letter: string | null; answer_text: string;
};
type AnswerRow = { picked: string[]; correct: boolean };

function esc(s: string) {
  return (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function download(filename: string, html: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const STYLE = `
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#23262f;max-width:760px;margin:0 auto;padding:40px 28px;line-height:1.5}
  h1{font-size:22px;margin:0 0 4px} .sub{color:#6c7280;font-size:13px;margin:0 0 26px}
  .q{padding:18px 0;border-top:1px solid #ece5d8;page-break-inside:avoid}
  .eyebrow{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9aa0ab;margin-bottom:6px}
  .stem{font-family:Georgia,serif;font-size:15.5px;margin:0 0 10px}
  .opt{font-size:14px;padding:2px 0;color:#3a3f4b} .opt b{color:#155f39}
  .correct{color:#155f39;font-weight:600} .meta{font-size:13px;color:#6c7280;margin-top:6px}
  .note{background:#faf7f1;border:1px solid #ece5d8;border-radius:8px;padding:10px 13px;margin-top:9px;font-size:14px;white-space:pre-wrap}
  .thread{margin-top:8px} .cmt{font-size:14px;margin:8px 0;padding-left:12px;border-left:2px solid #e2efeb}
  .cmt .who{font-weight:600;font-size:12.5px} .cmt .who span{color:#9aa0ab;font-weight:400;font-family:ui-monospace,monospace}
  @media print{body{padding:0} .q{border-color:#ddd}}
`;

function qBlock(q: RawQuestion, inner: string) {
  const correct = q.answer_letters?.length ? q.answer_letters : q.answer_letter ? [q.answer_letter] : [];
  const opts = q.options.map((o) => {
    const isC = correct.includes(o.letter);
    return `<div class="opt${isC ? " correct" : ""}">${esc(o.letter)}. ${esc(o.text)}${isC ? " ✓" : ""}</div>`;
  }).join("");
  return `<div class="q">
    <div class="eyebrow">${esc(q.year)} · Q${q.q_index}</div>
    <div class="stem">${esc(q.stem)}</div>
    ${opts}
    <div class="meta">Correct answer: <b>${correct.join(", ")}</b>${q.answer_text ? " — " + esc(q.answer_text) : ""}</div>
    ${inner}
  </div>`;
}

function shell(title: string, sub: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE}</style></head>
  <body><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>${body}</body></html>`;
}

export function exportMyNotes(
  notes: { question_id: string; text: string }[],
  byId: Map<string, RawQuestion>,
  answers: Record<string, AnswerRow>,
  who: string
) {
  const rows = notes
    .map((n) => ({ n, q: byId.get(n.question_id) }))
    .filter((x) => x.q) as { n: { question_id: string; text: string }; q: RawQuestion }[];
  const body = rows.map(({ n, q }) => {
    const a = answers[n.question_id];
    const yours = a ? `<div class="meta">Your answer: <b>${a.picked.join(", ")}</b> · ${a.correct ? "correct" : "missed"}</div>` : "";
    return qBlock(q, `${yours}<div class="note">${esc(n.text)}</div>`);
  }).join("");
  const sub = `${who} · ${rows.length} note${rows.length === 1 ? "" : "s"} · exported ${new Date().toLocaleDateString()}`;
  download("prite-my-notes.html", shell("My PRITE notes", sub, body || "<p>No notes yet.</p>"));
}

export function exportMissed(
  missedIds: string[],
  byId: Map<string, RawQuestion>,
  answers: Record<string, AnswerRow>,
  notes: Record<string, string>,
  who: string
) {
  const rows = missedIds.map((id) => ({ id, q: byId.get(id) })).filter((x) => x.q) as { id: string; q: RawQuestion }[];
  const body = rows.map(({ id, q }) => {
    const a = answers[id];
    const yours = a ? `<div class="meta">Your answer: <b>${a.picked.join(", ")}</b> · missed</div>` : "";
    const note = notes[id] ? `<div class="note">${esc(notes[id])}</div>` : "";
    return qBlock(q, yours + note);
  }).join("");
  const sub = `${who} · ${rows.length} missed question${rows.length === 1 ? "" : "s"} · exported ${new Date().toLocaleDateString()}`;
  download("prite-missed-questions.html", shell("My missed PRITE questions", sub, body || "<p>Nothing missed yet.</p>"));
}

export function exportGroupNotes(
  groupNotes: GroupNote[],
  byId: Map<string, RawQuestion>
) {
  const byQ = new Map<string, GroupNote[]>();
  for (const g of groupNotes) {
    if (!byQ.has(g.question_id)) byQ.set(g.question_id, []);
    byQ.get(g.question_id)!.push(g);
  }
  const body = [...byQ.entries()].map(([qid, notes]) => {
    const q = byId.get(qid);
    if (!q) return "";
    const thread = notes.map((g) => {
      const name = g.author?.full_name || g.author?.email || "Member";
      const when = new Date(g.created_at).toLocaleDateString();
      return `<div class="cmt"><div class="who">${esc(name)} <span>· ${g.author?.role ?? ""} · ${when}</span></div>${esc(g.text)}</div>`;
    }).join("");
    return qBlock(q, `<div class="thread">${thread}</div>`);
  }).join("");
  const count = groupNotes.length;
  const sub = `Class discussion · ${count} comment${count === 1 ? "" : "s"} across ${byQ.size} question${byQ.size === 1 ? "" : "s"} · exported ${new Date().toLocaleDateString()}`;
  download("prite-group-notes.html", shell("PRITE group notes", sub, body || "<p>No group notes yet.</p>"));
}

function esc2(s: string) {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build the Lecture Notes field (original question) for the AnKing card. */
export function ankingLecture(q: {
  year: string; q_index: number; stem: string;
  options: { letter: string; text: string }[];
  answer_letter: string | null; answer_text: string;
}) {
  const opts = q.options.map((o) => `${esc2(o.letter)}. ${esc2(o.text)}`).join("<br>");
  return `<b>PRITE ${q.year} &middot; Q${q.q_index}</b><br><br>${esc2(q.stem)}<br><br>${opts}<br><br><b>Answer: ${esc2(q.answer_letter ?? "")} &mdash; ${esc2(q.answer_text)}</b>`;
}

/* Anki import file (.txt) in AnKing Overhaul format. Tab-separated with headers
   so Anki targets the AnKing note type and maps Text / Extra / Lecture Notes
   positionally. File > Import (Anki remembers the mapping). */
export function exportAnkiDeck(rows: { cloze: string; lecture: string }[], filename = "prite-anki.txt") {
  const cell = (s: string) => (s ?? "").replace(/\t/g, " ").replace(/\r?\n/g, "<br>");
  const header = [
    "#separator:tab", "#html:true",
    "#notetype:AnKingOverhaul (AnKing Step Deck / AnKingMed)", "#deck:PRITE Daily",
  ].join("\n");
  // columns map positionally to fields: Text, Extra (empty), Lecture Notes
  const body = rows.map((r) => `${cell(r.cloze)}\t\t${cell(r.lecture)}`).join("\n");
  const blob = new Blob([header + "\n" + body + "\n"], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type PptxQ = {
  year: string; q_index: number; stem: string;
  options: { letter: string; text: string }[];
  answer_letters: string[]; answer_letter: string | null; answer_text: string;
};

/* PowerPoint export. Each question gets TWO slides: the question alone, then an
   identical slide with the answer revealed — so pressing space-bar in
   presentation mode "reveals" the answer. Pass reveal=false for one slide. */
export async function exportPptx(questions: PptxQ[], filename = "prite-questions.pptx", reveal = true) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "W", width: 10, height: 5.63 });
  pptx.layout = "W";

  const addSlide = (q: PptxQ, showAnswer: boolean) => {
    const correct = q.answer_letters?.length ? q.answer_letters : q.answer_letter ? [q.answer_letter] : [];
    const slide = pptx.addSlide();
    slide.addText(`PRITE ${q.year}  ·  Q${q.q_index}`, { x: 0.4, y: 0.2, fontSize: 10, color: "9AA0AB" });
    slide.addText(q.stem, { x: 0.4, y: 0.5, w: 9.2, h: 1.9, fontSize: 15, valign: "top", color: "23262F" });
    const opts = q.options.map((o) => ({
      text: `${o.letter}.  ${o.text}`,
      options: {
        color: showAnswer && correct.includes(o.letter) ? "155F39" : "3A3F4B",
        bold: showAnswer && correct.includes(o.letter), bullet: false, breakLine: true,
      },
    }));
    slide.addText(opts as any, { x: 0.6, y: 2.5, w: 8.8, h: 2.2, fontSize: 13, valign: "top" });
    if (showAnswer) {
      slide.addText(`Answer: ${correct.join(", ")} — ${q.answer_text}`, { x: 0.4, y: 5.0, w: 9.2, fontSize: 13, bold: true, color: "0E7A6B" });
    }
  };

  for (const q of questions) {
    if (reveal) addSlide(q, false);  // question, no answer
    addSlide(q, true);               // reveal slide (answer shown)
  }
  await pptx.writeFile({ fileName: filename });
}

export { questionId };
