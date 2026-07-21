/* Client-side exports. Builds a self-contained, print-ready HTML study sheet
   and downloads it — no dependency, and the user can open it and Print → Save
   as PDF. Per the spec, exports include the ORIGINAL question + answer but
   deliberately omit the AI explanation. */

import { questionId, supabase } from "./supabase";
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

// Save a generated file. On desktop this downloads normally. On iOS Safari —
// which ignores the `download` attribute on blob: URLs — `target="_blank"`
// makes the file open in a new tab the user can read and then Save/Share,
// instead of the click silently doing nothing (the bug residents hit trying to
// download poll results on their phones). The revoke is deferred a long time so
// a new-tab load on mobile isn't cut off by the blob URL being released.
function saveBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  a.target = "_blank"; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function download(filename: string, html: string) {
  saveBlob(filename, new Blob([html], { type: "text/html;charset=utf-8" }));
}

/* Live-poll team standings → CSV (opens directly in Excel/Sheets). No
   dependency; the leading BOM makes Excel read UTF-8 correctly. Open to anyone
   on either the host or a participant device. */
export function exportPollTeams(
  standings: { team: string; score: number; members: number; correct: number; answerers: number }[],
  meta: { code: string; index: number; total: number },
) {
  const cell = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows: (string | number)[][] = [
    [`Live poll ${meta.code} — team statistics`],
    [`Through question ${meta.index} of ${meta.total}`],
    [`Ranked by correct answers per person who answered, not total points`],
    [],
    ["Rank", "Team", "Players", "Answered", "Correct", "Avg per player"],
    ...standings.map((t, i) => [i + 1, t.team, t.members, t.answerers, t.correct, t.score]),
  ];
  const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
  saveBlob(`prite-poll-${meta.code}-teams.csv`, new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
}

/* Admin archive of official group-review poll sessions → CSV, one row per
   (session, question) so per-question performance is comparable across
   sessions and years. */
export function exportOfficialPollResults(rows: {
  submitted_at: string; poll_code: string; total_participants: number;
  submitter?: { full_name: string | null; email: string } | null;
  question_stats: { year: string; q_index: number; stem: string; correct: string[]; totalVotes: number; wrongVotes: number }[];
}[]) {
  const cell = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Submitted", "Poll Code", "Presenter", "Participants", "Year", "Q#", "Stem", "Correct", "Total Votes", "Wrong Votes", "Wrong %"];
  const out: (string | number)[][] = [header];
  for (const r of rows) {
    const who = r.submitter?.full_name || r.submitter?.email || "—";
    const when = new Date(r.submitted_at).toLocaleString();
    for (const qs of r.question_stats) {
      const wrongPct = qs.totalVotes > 0 ? Math.round((100 * qs.wrongVotes) / qs.totalVotes) : 0;
      out.push([when, r.poll_code, who, r.total_participants, qs.year, qs.q_index, qs.stem, qs.correct.join(", "), qs.totalVotes, qs.wrongVotes, wrongPct]);
    }
  }
  const csv = out.map((r) => r.map(cell).join(",")).join("\r\n");
  saveBlob("prite-official-poll-results.csv", new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
}

const STYLE = `
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#23262f;max-width:760px;margin:0 auto;padding:40px 28px;line-height:1.5}
  h1{font-size:22px;margin:0 0 4px} .sub{color:#6c7280;font-size:13px;margin:0 0 26px}
  .q{padding:18px 0;border-top:1px solid #ece5d8;page-break-inside:avoid}
  .eyebrow{font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#9aa0ab;margin-bottom:6px}
  .stem{font-family:Georgia,serif;font-size:15.5px;margin:0 0 10px}
  .opt{font-size:14px;padding:2px 0;color:#3a3f4b} .opt b{color:#155f39}
  .correct{color:#155f39;font-weight:600} .meta{font-size:13px;color:#6c7280;margin-top:6px}
  .wrong{color:#a33131}
  .note{background:#faf7f1;border:1px solid #ece5d8;border-radius:8px;padding:10px 13px;margin-top:9px;font-size:14px;white-space:pre-wrap}
  .expl{background:#f4f7fb;border:1px solid #dde6f0;border-radius:8px;padding:10px 13px;margin-top:9px;font-size:14px}
  .expl p{margin:0 0 8px;white-space:pre-wrap} .expl p:last-child{margin-bottom:0}
  .expl-img{max-width:100%;height:auto;display:block;margin-top:8px;border-radius:6px}
  .noexpl{font-size:13px;color:#9aa0ab;font-style:italic;margin-top:9px}
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

type PollExplQ = RawQuestion & { explanation_text?: string; explanation_images?: string[] };

function pollMissedBlock(q: PollExplQ, myChoice: string | null) {
  const correct = q.answer_letters?.length ? q.answer_letters : q.answer_letter ? [q.answer_letter] : [];
  const opts = q.options.map((o) => {
    const isC = correct.includes(o.letter);
    const isMine = myChoice === o.letter;
    return `<div class="opt${isC ? " correct" : ""}${isMine && !isC ? " wrong" : ""}">${esc(o.letter)}. ${esc(o.text)}${isC ? " ✓" : ""}${isMine && !isC ? " ← your answer" : ""}</div>`;
  }).join("");
  const images = (q.explanation_images ?? [])
    .filter((p) => !p.startsWith("<"))
    .map((p) => `<img class="expl-img" src="${esc(window.location.origin + "/" + p)}" alt="explanation figure">`)
    .join("");
  const explanation = q.explanation_text || images
    ? `<div class="expl">${q.explanation_text ? `<p>${esc(q.explanation_text)}</p>` : ""}${images}</div>`
    : `<p class="noexpl">No explanation available for this question.</p>`;
  return `<div class="q">
    <div class="eyebrow">${esc(q.year)} · Q${q.q_index}</div>
    <div class="stem">${esc(q.stem)}</div>
    ${opts}
    <div class="meta">Correct answer: <b>${correct.join(", ")}</b>${q.answer_text ? " — " + esc(q.answer_text) : ""} · ${myChoice ? `You picked ${esc(myChoice)}` : "You didn't vote"}</div>
    ${explanation}
  </div>`;
}

/* A live-poll participant's own missed questions, with explanations — unlike
   exportMissed() (personal practice history), a poll session is transient and
   nowhere else to revisit afterward, so this is the one export that includes
   the AI explanation. Images are linked back to the live site by absolute URL
   (the downloaded file is opened standalone, so a relative path would break). */
export function exportPollMissed(rows: { q: PollExplQ; myChoice: string | null }[], meta: { code: string; who: string }) {
  const body = rows.map(({ q, myChoice }) => pollMissedBlock(q, myChoice)).join("");
  const sub = `${meta.who} · Poll ${meta.code} · ${rows.length} missed question${rows.length === 1 ? "" : "s"} · exported ${new Date().toLocaleDateString()}`;
  download(`prite-poll-${meta.code}-missed.html`, shell("Questions I missed", sub, body || "<p>You didn't miss anything — nice work! 🎉</p>"));
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

/** Build the Lecture Notes field for the AnKing card: original question plus
    every AI supplement the app shows — explanation, clinical application,
    comparison table, concept diagram (pre-rendered SVG, since Anki can't run
    Mermaid), and historical context (fetched separately from Supabase). */
export function ankingLecture(q: {
  year: string; q_index: number; stem: string;
  options: { letter: string; text: string }[];
  answer_letter: string | null; answer_text: string;
  explanation_text?: string;
  clinical_application?: string;
  comparison_table?: { title?: string; headers: string[]; rows: string[][] } | null;
  diagram?: { code: string; caption?: string } | null;
}, extras?: { context?: string | null; diagramSvg?: string | null }) {
  const nl = (s: string) => esc2(s).replace(/\r?\n/g, "<br>");
  const section = (title: string, html: string) => `<br><br><b>${title}</b><br>${html}`;
  const opts = q.options.map((o) => `${esc2(o.letter)}. ${esc2(o.text)}`).join("<br>");
  const expl = q.explanation_text
    ? `<br><br><b>Explanation</b> <i>(AI-generated — can occasionally be wrong)</i><br>${nl(q.explanation_text)}`
    : "";
  const clin = q.clinical_application ? section("Clinical application", nl(q.clinical_application)) : "";
  const tbl = q.comparison_table && q.comparison_table.rows?.length
    ? section(esc2(q.comparison_table.title || "Comparison"),
        `<table border="1" cellpadding="5" cellspacing="0" style="border-collapse:collapse;">` +
        `<tr>${q.comparison_table.headers.map((h) => `<th>${esc2(h)}</th>`).join("")}</tr>` +
        q.comparison_table.rows.map((r) => `<tr>${r.map((c) => `<td>${esc2(c)}</td>`).join("")}</tr>`).join("") +
        `</table>`)
    : "";
  const diag = extras?.diagramSvg
    ? section("Concept diagram",
        `<div style="max-width:100%;overflow-x:auto;">${extras.diagramSvg}</div>` +
        (q.diagram?.caption ? `<i>${esc2(q.diagram.caption)}</i>` : ""))
    : "";
  const hist = extras?.context ? section("Historical context", nl(extras.context)) : "";
  return `<b>PRITE ${q.year} &middot; Q${q.q_index}</b><br><br>${esc2(q.stem)}<br><br>${opts}<br><br><b>Answer: ${esc2(q.answer_letter ?? "")} &mdash; ${esc2(q.answer_text)}</b>${expl}${clin}${tbl}${diag}${hist}`;
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
  saveBlob(filename, new Blob([header + "\n" + body + "\n"], { type: "text/plain;charset=utf-8" }));
}

type PptxQ = {
  year: string; q_index: number; stem: string;
  options: { letter: string; text: string }[];
  answer_letters: string[]; answer_letter: string | null; answer_text: string;
  explanation_text?: string; explanation_images?: string[];
};

// Explanation images are stored as bank-relative paths; "<...>" entries mark a
// failed export and have no real file (mirrors imgSrc() in App.tsx).
function explImgSrc(p: string) {
  return p.startsWith("<") ? "" : "/" + p;
}

/* pptxgenjs's `sizing: {type: "contain"}` never actually measures the source
   image — it substitutes the target box's own w/h as a stand-in, so "contain"
   silently becomes a plain stretch and distorts non-matching aspect ratios.
   We measure the real dimensions ourselves and compute an aspect-correct box. */
function loadImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = src;
  });
}

/* PowerPoint export. Each question gets TWO slides: the question alone, then an
   identical slide with the answer revealed — so pressing space-bar in
   presentation mode "reveals" the answer. Pass reveal=false for one slide.
   Pass includeExplanation=true to append a third slide with the main
   explanation after the reveal slide (skipped for questions with none), so a
   presenter can review a set without switching back to the webpage. */
export async function exportPptx(questions: PptxQ[], filename = "prite-questions.pptx", reveal = true, includeExplanation = false) {
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

  const addExplanationSlide = async (q: PptxQ, images: string[]) => {
    const slide = pptx.addSlide();
    slide.addText(`PRITE ${q.year}  ·  Q${q.q_index}  ·  Explanation`, { x: 0.4, y: 0.2, fontSize: 10, color: "9AA0AB" });
    let y = 0.6;
    if (q.explanation_text) {
      const textH = images.length ? 2.2 : 4.8;
      slide.addText(q.explanation_text, { x: 0.4, y, w: 9.2, h: textH, fontSize: 14, valign: "top", color: "23262F" });
      y += textH + 0.1;
    }
    if (images.length) {
      const slotH = 5.4 - y;
      const slotW = 9.2 / images.length;
      const sizes = await Promise.all(images.map(loadImageSize));
      images.forEach((src, i) => {
        const { w: natW, h: natH } = sizes[i];
        const scale = Math.min((slotW - 0.2) / natW, slotH / natH);
        const w = natW * scale, h = natH * scale;
        const slotX = 0.4 + i * slotW;
        slide.addImage({ path: src, x: slotX + (slotW - 0.2 - w) / 2, y: y + (slotH - h) / 2, w, h });
      });
    }
  };

  for (const q of questions) {
    if (reveal) addSlide(q, false);  // question, no answer
    addSlide(q, true);               // reveal slide (answer shown)
    if (includeExplanation) {
      const images = (q.explanation_images ?? []).map(explImgSrc).filter(Boolean);
      if (q.explanation_text || images.length) await addExplanationSlide(q, images);
    }
  }
  await pptx.writeFile({ fileName: filename });
}

/* Teaching-deck export: renders a study guide's AI-designed slide deck
   (StudyGuide.slides — layouts "divider" / "bullets" / "bigfact", plus AI
   illustrations in the private "study-slides" bucket) into a real .pptx —
   the pre-reading alternative to the audio overview. Deliberately BIG type
   throughout (readable from the back of a lecture hall); the "notes" text
   lands in the speaker-notes pane so a presenter could teach straight from
   it. */
type TeachingSlide = {
  layout?: string; title?: string; bullets?: string[]; big_text?: string;
  support?: string; notes?: string; image_path?: string | null;
};
type TeachingGuide = {
  title: string; intro: string; slides: TeachingSlide[];
  key_terms: string[]; session_date?: string | null;
};

const INK = "10343B", TEAL = "0E7A6B", TEAL_LT = "8FD0C6", BODY = "23262F", MUTED = "B8C4C7";

// Download one slide illustration from the private bucket as a data: URL for
// pptxgenjs. Null (slide stays text-only) on any failure.
async function slideImageData(path: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from("study-slides").download(path);
  if (error || !data) { console.warn("slideImageData", error?.message); return null; }
  return await new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
    r.onerror = () => resolve(null);
    r.readAsDataURL(data);
  });
}

export async function exportTeachingPptx(guide: TeachingGuide, filename = "prite-prereading.pptx") {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "W", width: 10, height: 5.63 });
  pptx.layout = "W";

  // Fetch every illustration up front, concurrently.
  const images = new Map<string, string>();
  await Promise.all(guide.slides.filter((sl) => sl.image_path).map(async (sl) => {
    const data = await slideImageData(sl.image_path!);
    if (data) images.set(sl.image_path!, data);
  }));

  // Title slide
  const title = pptx.addSlide();
  title.background = { color: INK };
  title.addText(guide.title, { x: 0.7, y: 1.3, w: 8.6, h: 1.8, fontSize: 40, bold: true, color: "FFFFFF", valign: "bottom" });
  title.addText("Pre-reading · doesn't give away the quiz", { x: 0.7, y: 3.35, w: 8.6, fontSize: 18, color: TEAL_LT });
  if (guide.session_date) {
    title.addText(`For the ${guide.session_date} session`, { x: 0.7, y: 3.95, w: 8.6, fontSize: 15, color: MUTED });
  }
  if (guide.intro) title.addNotes(guide.intro);

  for (const sl of guide.slides) {
    const slide = pptx.addSlide();
    const img = sl.image_path ? images.get(sl.image_path) : undefined;

    if (sl.layout === "divider") {
      // Full-bleed teal section break; image (if any) sits right, softly.
      slide.background = { color: INK };
      if (img) slide.addImage({ data: img, x: 6.1, y: 1.12, w: 3.4, h: 3.4 });
      const textW = img ? 5.2 : 8.6;
      slide.addText(sl.title ?? "", { x: 0.7, y: 1.7, w: textW, h: 1.6, fontSize: 44, bold: true, color: "FFFFFF", valign: "bottom" });
      slide.addShape("line", { x: 0.75, y: 3.5, w: 2.2, h: 0, line: { color: TEAL_LT, width: 3 } });
      if (sl.support) slide.addText(sl.support, { x: 0.7, y: 3.65, w: textW, h: 0.9, fontSize: 20, color: TEAL_LT, valign: "top" });
    } else if (sl.layout === "bigfact") {
      // One giant teaching point, centered.
      slide.addText(sl.big_text ?? sl.title ?? "", {
        x: 0.8, y: 1.15, w: 8.4, h: 2.5, fontSize: 36, bold: true, color: INK, align: "center", valign: "middle",
      });
      slide.addShape("line", { x: 4.1, y: 3.85, w: 1.8, h: 0, line: { color: TEAL, width: 3 } });
      if (sl.support) slide.addText(sl.support, { x: 1.3, y: 4.05, w: 7.4, h: 1.1, fontSize: 18, color: TEAL, align: "center", valign: "top" });
    } else {
      // "bullets" (and anything unrecognized): title + few large bullets,
      // image on the right when present.
      slide.addText(sl.title ?? "", { x: 0.6, y: 0.4, w: 8.8, h: 0.95, fontSize: 30, bold: true, color: INK, valign: "middle" });
      slide.addShape("line", { x: 0.62, y: 1.42, w: 8.76, h: 0, line: { color: TEAL, width: 2 } });
      const textW = img ? 5.3 : 8.5;
      if (img) slide.addImage({ data: img, x: 6.25, y: 1.75, w: 3.3, h: 3.3 });
      const bullets = (sl.bullets ?? []).map((b) => ({
        text: b,
        options: { bullet: { code: "2022", indent: 18 }, breakLine: true, paraSpaceAfter: 16 },
      }));
      slide.addText(bullets as any, { x: 0.8, y: 1.75, w: textW, h: 3.5, fontSize: 22, color: BODY, valign: "top" });
    }
    if (sl.notes) slide.addNotes(sl.notes);
  }

  // Key terms closer (if any)
  if (guide.key_terms?.length) {
    const slide = pptx.addSlide();
    slide.addText("Key terms to know cold", { x: 0.6, y: 0.4, w: 8.8, h: 0.95, fontSize: 30, bold: true, color: INK, valign: "middle" });
    slide.addShape("line", { x: 0.62, y: 1.42, w: 8.76, h: 0, line: { color: TEAL, width: 2 } });
    // Two columns so 10 terms still render large.
    const half = Math.ceil(guide.key_terms.length / 2);
    const cols = [guide.key_terms.slice(0, half), guide.key_terms.slice(half)];
    cols.forEach((col, c) => {
      if (!col.length) return;
      const terms = col.map((t) => ({
        text: t,
        options: { bullet: { code: "2022", indent: 18 }, breakLine: true, paraSpaceAfter: 14 },
      }));
      slide.addText(terms as any, { x: 0.8 + c * 4.4, y: 1.75, w: 4.1, h: 3.5, fontSize: 19, color: BODY, valign: "top" });
    });
  }

  await pptx.writeFile({ fileName: filename });
}

export { questionId };
