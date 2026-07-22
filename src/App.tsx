import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ShieldCheck, Trophy, NotebookPen, Users, User, Layers, Stethoscope,
  Check, X, Image as ImageIcon, Trash2, Download, Flame, ArrowRight, Monitor,
  ArrowLeft, ListChecks, LogOut, Clock, Settings as SettingsIcon,
  Sparkles, Target, RotateCcw, BarChart3, Pencil, Search, FileText, ExternalLink,
  TrendingUp, Youtube, Network, Zap, Crown, Radio, Lightbulb, Highlighter, Bug,
  ChevronDown, ChevronUp, ChevronRight, Share2, Archive, Baby, Mail, Minus, Plus, Repeat,
  Eye, EyeOff, PanelRight, PanelBottom,
  BookOpen, Volume2, Play, Pause, Square, Copy, Shuffle, GripVertical,
  Brain, Pill, HeartPulse, GraduationCap,
} from "lucide-react";
import mermaid from "mermaid";
import { nextRewardPost, RewardKind } from "./lib/motivation";
import QRCode from "qrcode";

mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose", fontFamily: "inherit" });

// Renders a Mermaid diagram from source; falls back to the raw code if it can't parse.
function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const idRef = useRef("mmd-" + Math.random().toString(36).slice(2));
  useEffect(() => {
    let alive = true;
    setSvg(null); setFailed(false);
    mermaid
      .render(idRef.current, code)
      .then((r) => { if (alive) setSvg(r.svg); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [code]);
  if (failed) return <pre style={{ whiteSpace: "pre-wrap", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 12.5, overflowX: "auto" }}>{code}</pre>;
  if (!svg) return null;
  return <div style={{ overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

// One-shot Mermaid → SVG string, for embedding concept diagrams in Anki
// exports (Anki renders inline SVG but can't run Mermaid). Null on parse
// failure or no code — the card just omits the diagram section.
async function renderDiagramSvg(code?: string | null): Promise<string | null> {
  if (!code) return null;
  try { return (await mermaid.render("mmdx-" + Math.random().toString(36).slice(2), code)).svg; }
  catch { return null; }
}
import { isConfigured, supabase, signInWithGoogle, signOut, questionId } from "./lib/supabase";
import { useAuth } from "./lib/useAuth";
import { matchRoster, matchPlannedTeam, matchNamesList, academicYearEnd, classYearLevel } from "./lib/roster";
import { recordToday, peekStreak, totalDays, ymd } from "./lib/streaks";
import { syncClientPrefs, schedulePrefsPush } from "./lib/prefsSync";
import { dueReminderPromptStage, markReminderPromptShown } from "./lib/reminderPrompt";
import { dueAiDisclaimerStage, markAiDisclaimerShown } from "./lib/aiDisclaimerPrompt";
import { isAutoReminderActive, guessedExamDate } from "./lib/reminderWindow";
import {
  makePollCode, channelName, pollJoinUrl, pollCodeFromUrl, clearPollParam, assignBalancedTeams, stableTeamLevel, pickIsCorrect,
  POLL_EVENTS, type PollState, type PollVote, type PollHello, type PollAssign, type TeamStanding, type IndividualStanding, type TeamMode,
} from "./lib/poll";
import { ImmersiveScene, ImmersiveFlash } from "./ImmersiveScene";
import { nextPollDrumrollGif } from "./lib/pollGifs";
import {
  loadQuestionBank,
  getMyAnswers, saveAnswer, clearMissedAnswers, getMyNote, saveMyNote,
  getGroupNotes, addGroupNote, deleteGroupNote,
  listProfiles, updateProfile, setTrainingLevel, getStableTeams, regenerateStableTeams, setStableTeam, removeStableTeam,
  listRosterNames, addRosterName, removeRosterName, type RosterName,
  listStudyGuideCreators, setStudyGuideCreator,
  getWeeklyTeams, regenerateWeeklyTeams,
  getQuestionStats, getLeaderboard,
  getMySettings, saveSettings,
  getAllMyNotes, getAllGroupNotes,
  getTagMissStats,
  getFlashcard, generateFlashcard, saveFlashcard, getFlashcardsForIds,
  getMyHighlights, saveMyHighlights, getQuestionContext, getContextsForIds,
  submitBugReport, listBugReports, updateBugReport, respondToBugReport,
  submitOfficialPollResults, listOfficialPollResults, clearOfficialPollResults,
  recordPollAnswer, getMyPollStats, getPollAnsweredQuestionIds,
  ensureTrackedForReview, getDueReviewCards, gradeReviewCard,
  type AnswerRow, type GroupNote as DbGroupNote, type Profile,
  type QuestionStats, type LeaderRow, type Settings, type TagMissRow, type Flashcard, type HlRange, type BugReport,
  type OfficialPollResult, type QuestionStat, type SrsRow, type PollStats,
} from "./lib/db";
import { exportMyNotes, exportGroupNotes, exportMissed, ankingLecture, exportPptx, exportTeachingPptx, exportPollTeams, exportOfficialPollResults, exportPollMissed } from "./lib/exports";
import { loadTests, saveTest, renameTest, deleteTest, type SavedTest } from "./lib/tests";
import {
  generateStudyGuide, getStudyGuide, getStudyGuideAudioUrl, listStudyGuidesForTests, listLibraryStudyGuides, canGenerateStudyGuides,
  getOwnAiKeys, setOwnAiKeys, type OwnAiKeys,
  studyGuideUrl, studyGuideIdFromUrl, clearStudyParam, type StudyGuide, type LibraryStudyGuide,
} from "./lib/studyGuides";
import { SRS_GRADES, intervalLabel, sm2Next, SRS_DEFAULT, type SrsGrade, type SrsState } from "./lib/srs";

/* ----------------------------------------------------------------------
   PRITE daily question screen — now driven by the REAL extracted bank
   (public/data/questions.json + /images/<year>/...). ~3,590 questions,
   2014–2025. No backend yet: notes are local/ephemeral; there is no class
   answer distribution, flashcard, or leaderboard data, so those are shown
   as "coming with the backend" rather than faked.
---------------------------------------------------------------------- */

const T = {
  ink: "#1b1e2b", inkSoft: "#252a3a", inkLine: "#33384b",
  paper: "#faf7f1", paperEdge: "#ece5d8", card: "#ffffff",
  text: "#23262f", muted: "#6c7280", faint: "#9aa0ab",
  teal: "#0e7a6b", tealDeep: "#0b5d52", tealSoft: "#e2efeb",
  correctLine: "#1a7a4a", correctBg: "#e7f2ea", correctText: "#155f39",
  wrongLine: "#b04a30", wrongBg: "#f6e8e2", wrongText: "#8a3722",
  gold: "#bf8a30", goldSoft: "#f0e3c1",
};

type RawOption = { letter: string; text: string };
type QTags = {
  diagnosis?: string[]; medication?: string[]; psychotherapy?: string[];
  neuro?: string[]; historical?: string[]; setting?: string | null;
  /** Curated DSM/PRITE topic taxonomy (multi-label), AI-classified — see
      extraction/topic_classify pipeline. Distinct from prite_category, which
      is the broad exam-blueprint section. */
  topics?: string[];
};
type RawQuestion = {
  deck: string; year: string; q_index: number; slide_number: number;
  stem: string; options: RawOption[];
  answer_letter: string | null; answer_letters: string[]; multi_select: boolean;
  answer_text: string; answer_source: string; answer_raw: string;
  explanation_text: string; figure_images: string[]; explanation_images: string[];
  clinical_application?: string; video_query?: string;
  diagram?: { code: string; caption?: string } | null;
  comparison_table?: { title?: string; headers: string[]; rows: string[][] } | null;
  flags: string[];
  prite_category?: string; prite_label?: string; tags?: QTags;
  /** Set only when this stem recurs (verbatim or near-verbatim) in another
      year's exam — see extraction/detect_repeats.mjs. count includes this
      occurrence; years lists every year the group appeared in. */
  repeat_count?: number; repeat_years?: string[];
};

type GroupNote = { author: string; role: string; time: string; text: string };

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function imgSrc(p: string) {
  return p.startsWith("<") ? "" : "/" + p; // skip failed-export placeholders
}

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ---- "Ask AI": open an external AI with a pre-filled prompt about this question ----
type AiStyle = "explain" | "eli10" | "analogies" | "connections" | "historical";
const AI_STYLES: [AiStyle, string][] = [
  ["explain", "Explain"],
  ["eli10", "Explain like I'm 10"],
  ["analogies", "Use analogies"],
  ["connections", "Connect to other topics"],
  ["historical", "Historical context"],
];
const AI_STYLE_TEXT: Record<AiStyle, string> = {
  explain: "Explain why the correct answer is right and why each of the other options is wrong.",
  eli10: "Explain this like I am ten years old, using simple everyday language.",
  analogies: "Explain this using vivid, memorable analogies.",
  connections: "Explain this and make lots of connections to related psychiatry, pharmacology, and neuroscience concepts so it sticks.",
  historical: "Explain this in its historical context — how the diagnosis, the treatment, or the guideline was discovered and how the understanding evolved over time.",
};
const AI_TARGETS: { key: string; label: string; url: (p: string) => string }[] = [
  { key: "google", label: "Google AI", url: (p) => `https://www.google.com/search?udm=50&q=${encodeURIComponent(p)}` },
  { key: "openevidence", label: "OpenEvidence", url: (p) => `https://www.openevidence.com/search?q=${encodeURIComponent(p)}` },
  { key: "chatgpt", label: "ChatGPT", url: (p) => `https://chatgpt.com/?q=${encodeURIComponent(p)}` },
  { key: "claude", label: "Claude", url: (p) => `https://claude.ai/new?q=${encodeURIComponent(p)}` },
  { key: "grok", label: "Grok", url: (p) => `https://grok.com/?q=${encodeURIComponent(p)}` },
];
function questionRef(q: RawQuestion, revealed: boolean): string {
  const opts = q.options.map((o) => `${o.letter}. ${o.text}`).join("\n");
  const letters = q.answer_letters && q.answer_letters.length ? q.answer_letters : q.answer_letter ? [q.answer_letter] : [];
  const ans = revealed && letters.length
    ? `\nThe correct answer is ${letters.join(", ")}${q.answer_text ? `: ${q.answer_text}` : ""}.\n`
    : "";
  return `${q.stem}\n\n${opts}\n${ans}`;
}
function askAiPrompt(q: RawQuestion, style: AiStyle, revealed: boolean): string {
  return `I'm a psychiatry resident studying for the PRITE exam. Here is a practice question:\n\n${questionRef(q, revealed)}\n${AI_STYLE_TEXT[style]}`;
}
// A user's own free-text question, with the current question attached as reference.
function askAiCustom(q: RawQuestion, text: string, revealed: boolean): string {
  return `${text.trim()}\n\n--- Reference: the PRITE practice question I'm looking at ---\n\n${questionRef(q, revealed)}`;
}
// "I have no clue" — ask the AI to teach the underlying topic from scratch.
function askAiNoClue(q: RawQuestion, revealed: boolean): string {
  return `I'm a psychiatry resident studying for the PRITE exam and I honestly have no idea how to approach this question. Please teach me the core concept it's testing from scratch, in plain language — the key facts and the way to reason about it — and then walk me to the answer so I actually understand it.\n\n${questionRef(q, revealed)}`;
}
// Open a URL in a *background* tab (keep the user on the quiz). Synthesises a
// ⌘/Ctrl-click on a throwaway anchor — the browser gesture that opens a background
// tab — and falls back to window.open. Returns focus to the quiz either way.
function openBgTab(url: string) {
  try {
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.dispatchEvent(new MouseEvent("click", {
      bubbles: true, cancelable: true, view: window, button: 0,
      ctrlKey: true, metaKey: true,
    }));
    document.body.removeChild(a);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  try { window.focus(); } catch { /* no-op */ }
}

// Green (few wrong answers, fine to skip) → orange (many wrong, review this
// one) — for the poll answer-key's at-a-glance review-priority accent.
function wrongPctColor(pct: number): string {
  const t = Math.max(0, Math.min(1, pct));
  const from = [72, 199, 142], to = [224, 138, 60];
  const mix = (i: number) => Math.round(from[i] + (to[i] - from[i]) * t);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

// Fisher-Yates — unbiased shuffle, doesn't mutate the input.
function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Daily sets lead with the most recently tested exams (2022 → 2025), since those
// best reflect what's likely on the upcoming PRITE. Older years follow,
// most-recent-first. Lower rank = served sooner.
const PRIORITY_YEARS = ["2022", "2023", "2024", "2025"];
function yearRank(year: string): number {
  const i = PRIORITY_YEARS.indexOf(year);
  return i !== -1 ? i : 4 + (2025 - (Number(year) || 0));
}

type Span = { start: number; end: number };

// Offset of (node, offset) within container's full text — walks text nodes so
// selection math stays correct even across already-highlighted <mark> spans.
function textOffset(container: HTMLElement, node: Node, offset: number): number {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let total = 0, n: Node | null;
  while ((n = walker.nextNode())) {
    if (n === node) return total + offset;
    total += n.textContent?.length ?? 0;
  }
  return total + offset;
}

// Clamp, drop empties, sort, and coalesce overlapping/touching ranges.
function normalizeRanges(ranges: Span[], len: number): Span[] {
  const cleaned = ranges
    .map((r) => ({ start: Math.max(0, Math.min(r.start, len)), end: Math.max(0, Math.min(r.end, len)) }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const r of cleaned) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

// A paragraph you can highlight by selecting text; click a highlight to remove
// it. Highlights are reported back as plain {start,end} offsets via onChange.
function HighlightableText({ text, ranges, editable, onChange, style }: {
  text: string; ranges: Span[]; editable: boolean;
  onChange: (next: Span[]) => void; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLParagraphElement | null>(null);

  const addSelection = () => {
    if (!editable) return;
    const sel = window.getSelection();
    const el = ref.current;
    if (!sel || sel.isCollapsed || !el) return;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return;
    let start = textOffset(el, r.startContainer, r.startOffset);
    let end = textOffset(el, r.endContainer, r.endOffset);
    if (start > end) [start, end] = [end, start];
    if (end <= start) return;
    sel.removeAllRanges();
    onChange(normalizeRanges([...ranges, { start, end }], text.length));
  };

  const norm = normalizeRanges(ranges, text.length);
  const segs: React.ReactNode[] = [];
  let cursor = 0;
  norm.forEach((r, i) => {
    if (r.start > cursor) segs.push(<span key={`p${i}`}>{text.slice(cursor, r.start)}</span>);
    segs.push(
      <mark
        key={`h${i}`}
        style={s.hlMark}
        onClick={() => editable && onChange(norm.filter((x) => x.start !== r.start || x.end !== r.end))}
        title={editable ? "Click to remove highlight" : undefined}
      >
        {text.slice(r.start, r.end)}
      </mark>
    );
    cursor = r.end;
  });
  if (cursor < text.length) segs.push(<span key="tail">{text.slice(cursor)}</span>);

  return (
    <p ref={ref} style={{ ...style, ...(editable ? s.stemSelectable : {}) }} onMouseUp={addSelection}>
      {segs}
    </p>
  );
}

function renderClozeRaw(text: string) {
  return text.split(/(\{\{c\d::[^}]*\}\})/g).map((p, i) => {
    const m = p.match(/^\{\{(c\d)::([^}]*)\}\}$/);
    if (!m) return <span key={i}>{p}</span>;
    return (
      <span key={i}>
        <span style={{ color: T.faint }}>{`{{${m[1]}::`}</span>
        <span style={{ color: T.teal, fontWeight: 700 }}>{m[2]}</span>
        <span style={{ color: T.faint }}>{`}}`}</span>
      </span>
    );
  });
}
function renderClozePreview(text: string) {
  return text.split(/(\{\{c\d::[^}]*\}\})/g).map((p, i) => {
    const m = p.match(/^\{\{(c\d)::([^}]*)\}\}$/);
    if (!m) return <span key={i}>{p}</span>;
    return <span key={i} style={s.blank}>[ {m[1]} ]</span>;
  });
}
/** The fully "solved" sentence — cloze markup resolved to plain text, with
    the previously-blanked words called out. Used once a card is revealed. */
function renderClozeResolved(text: string) {
  return text.split(/(\{\{c\d::[^}]*\}\})/g).map((p, i) => {
    const m = p.match(/^\{\{(c\d)::([^}]*)\}\}$/);
    if (!m) return <span key={i}>{p}</span>;
    return <b key={i} style={{ color: T.teal }}>{m[2]}</b>;
  });
}

function isSameDay(iso: string) {
  const d = new Date(iso), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function daysUntil(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - start) / 86400000);
}

// Standard-normal CDF (Abramowitz & Stegun 26.2.17). The PRITE-score predictor
// uses it to turn an accuracy z-score into an estimated percentile.
function normCdf(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p; // p is now Φ(z), the lower-tail probability
}
const clampPct = (n: number) => Math.min(99, Math.max(1, Math.round(n)));
function ordinal(n: number) {
  const r = n % 100;
  if (r >= 11 && r <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

const TIMER_MIN = 20, TIMER_MAX = 120;
const clampSecs = (n: number) => Math.min(TIMER_MAX, Math.max(TIMER_MIN, Math.round(n) || 60));

function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* best-effort */ }
}
function fmtTime(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function streakMessage(kind: "login" | "completion", streak: number): string {
  if (kind === "login") {
    if (streak >= 14) return "Two weeks of showing up. Remarkable consistency.";
    if (streak >= 7) return "A full week of logins — the habit is real.";
    return "Glad you're back. Consistency compounds.";
  }
  if (streak >= 14) return "Legendary — two weeks of daily sets unbroken!";
  if (streak >= 7) return "A full week of daily sets. You're on fire.";
  if (streak >= 5) return "Five days and climbing. Keep the chain alive!";
  if (streak >= 3) return "Three in a row — the habit is forming!";
  return "Daily set complete. Nice work.";
}

export default function App() {
  const [all, setAll] = useState<RawQuestion[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [year, setYear] = useState<string>("all");
  const [qi, setQi] = useState(0);

  const [picked, setPicked] = useState<string[]>([]);
  const [crossed, setCrossed] = useState<string[]>([]); // options crossed out (right-click), per question
  const [revealed, setRevealed] = useState(false);
  const [tab, setTab] = useState("explanation");
  // "Ask AI" panel: open/closed, chosen explanation style, and free-text question
  const [askOpen, setAskOpen] = useState(false);
  const [askStyle, setAskStyle] = useState<AiStyle>("explain");
  const [askText, setAskText] = useState("");
  const [myNote, setMyNote] = useState("");
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [jump, setJump] = useState("");

  const confettiRef = useRef<HTMLCanvasElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [ind, setInd] = useState({ left: 0, width: 0, top: 0 });

  // --- streak rewards (client-side, see lib/streaks.ts) ---
  const [streakReward, setStreakReward] = useState<{ kind: "login" | "completion"; streak: number; level: number } | null>(null);
  const [doneStreak, setDoneStreak] = useState(0); // current daily-completion streak, for the top-bar chip
  const loginCheckedRef = useRef(false);
  const completionCelebratedRef = useRef<string | null>(null);
  const [reminderPromptStage, setReminderPromptStage] = useState<1 | 2 | 3 | null>(null);
  const reminderPromptCheckedRef = useRef(false);
  const [aiDisclaimerStage, setAiDisclaimerStage] = useState<1 | 2 | null>(null);
  const aiDisclaimerCheckedRef = useRef(false);

  // --- exam mode + timer (UI prefs, kept in localStorage to avoid a DB migration) ---
  const [examMode, setExamMode] = useState<boolean>(() => readPref("pd_exam_mode", false));
  const [deskFlash, setDeskFlash] = useState<{ dir: "in" | "out"; token: number }>({ dir: "in", token: 0 }); // desk fly-in/out when toggling exam focus mode
  const [examReview, setExamReview] = useState(false); // entered the post-set review phase
  const [timerOn, setTimerOn] = useState<boolean>(() => readPref("pd_timer_on", false));
  const [timerSecs, setTimerSecs] = useState<number>(() => clampSecs(readPref("pd_timer_secs", 60)));
  const [secsDraft, setSecsDraft] = useState<string>(() => String(clampSecs(readPref("pd_timer_secs", 60))));
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const commitSecs = () => { const n = clampSecs(Number(secsDraft)); setTimerSecs(n); setSecsDraft(String(n)); };

  // --- study guides (prep page + audio overview generated from a saved test) ---
  const [openStudyGuideId, setOpenStudyGuideId] = useState<string | null>(null); // reading/listening the shared page
  const [guideToShare, setGuideToShare] = useState<{ guide: StudyGuide; test: SavedTest } | null>(null); // opened from the panel to view/copy the link
  const [guideCreateFor, setGuideCreateFor] = useState<{ test: SavedTest; force: boolean } | null>(null); // date-picker modal before kicking off generation
  // latest known guide per saved_test_id — generation runs in the background
  // (see generate-study-guide's use of EdgeRuntime.waitUntil), so this is kept
  // fresh by polling rather than by awaiting the kickoff call.
  const [guidesByTest, setGuidesByTest] = useState<Record<string, StudyGuide>>({});
  const [seenGuideIds, setSeenGuideIds] = useState<Set<string>>(() => new Set(readPref("pd_seen_study_guides", [] as string[])));
  const [pollGen, setPollGen] = useState(0); // bump to (re)start the progress poll after kicking off a generation
  // residency-wide library of every finished guide, any speaker — not just yours
  const [showGuideLibrary, setShowGuideLibrary] = useState(false);
  const [libraryGuides, setLibraryGuides] = useState<LibraryStudyGuide[] | null>(null); // null = not loaded yet
  // only admins + the education-chief allowlist may GENERATE guides (they cost
  // money); everyone can still read the library. Server re-checks regardless.
  const [canGenGuides, setCanGenGuides] = useState(false);
  useEffect(() => { writePref("pd_seen_study_guides", [...seenGuideIds]); schedulePrefsPush(); }, [seenGuideIds]);

  // --- live crowd poll (Supabase Realtime, see lib/poll.ts) ---
  const [hostCode, setHostCode] = useState<string | null>(null);   // big screen is hosting
  const [joinCode, setJoinCode] = useState<string | null>(null);   // this device is a participant
  const [hostClosing, setHostClosing] = useState(false);           // play the poll pull-out before unmounting the host
  const [srsClosing, setSrsClosing] = useState(false);             // …and the flashcard review
  const [hostSet, setHostSet] = useState<RawQuestion[] | null>(null); // poll a saved test instead of the current set
  const [hostFromTests, setHostFromTests] = useState(false); // hosting was launched from the saved-tests panel — reopen it when the poll (or the team-mode prompt) closes
  const [teamMode, setTeamMode] = useState<TeamMode>("self");      // how teams get formed for the session about to start
  const [teamModePrompt, setTeamModePrompt] = useState<RawQuestion[] | null | false>(false); // pending "Host poll" click, awaiting the team-mode choice (false = not prompting; null/array = the set to host once chosen)
  const [showTeamEditor, setShowTeamEditor] = useState(false); // admin hand-editing of the season rosters
  const [stableTeams, setStableTeams] = useState<Record<string, string>>({}); // profile_id -> team name, the season-long roster
  const [weeklyTeams, setWeeklyTeams] = useState<Record<string, string>>({}); // profile_id -> team name, this week's admin-randomized mixer pairing
  const [weeklyGeneratedAt, setWeeklyGeneratedAt] = useState<string | null>(null);
  const [weeklyGeneratedBy, setWeeklyGeneratedBy] = useState<string | null>(null);
  const startHosting = (mode: TeamMode) => {
    if (teamModePrompt === false) return;
    setTeamMode(mode);
    setHostSet(teamModePrompt);
    setHostCode(makePollCode());
    setTeamModePrompt(false);
  };
  // Admin: (re)build the season-long roster from everyone's current training
  // level — one R1, one R2, one R3, one R4-or-fellow per team — and persist it
  // so it stays the same across sessions until this is run again.
  const runGenerateStableTeams = async (): Promise<boolean> => {
    const all = await listProfiles();
    const entries = all
      .filter((p) => p.status === "approved" && !p.is_education_chief && p.role !== "alumni" && p.role !== "test")
      .map((p) => ({ voter: p.id, level: stableTeamLevel(p.training_level) }))
      .filter((e): e is { voter: string; level: string } => e.level !== null);
    if (!entries.length) return false;
    const ok = await regenerateStableTeams(assignBalancedTeams(entries));
    if (ok) setStableTeams(await getStableTeams());
    return ok;
  };

  // Admin: randomize this week's mixer pairing — same one-per-PGY-year
  // balancing as the season roster, but re-rolled on demand (typically weekly,
  // ahead of Tuesday didactics) so residents keep meeting new people. Persists
  // in weekly_teams until an admin re-randomizes.
  // Returns null on success, or an error message to show in the modal.
  const runGenerateWeeklyTeams = async (): Promise<string | null> => {
    const all = await listProfiles();
    const entries = all
      .filter((p) => p.status === "approved" && !p.is_education_chief && p.role !== "alumni" && p.role !== "test")
      .map((p) => ({ voter: p.id, level: stableTeamLevel(p.training_level) }))
      .filter((e): e is { voter: string; level: string } => e.level !== null);
    if (!entries.length) return all.length ? "No approved residents with a PGY year set" : "Couldn't load the resident list";
    const err = await regenerateWeeklyTeams(assignBalancedTeams(entries));
    if (!err) {
      const { teams, generatedAt, generatedBy } = await getWeeklyTeams();
      setWeeklyTeams(teams); setWeeklyGeneratedAt(generatedAt); setWeeklyGeneratedBy(generatedBy);
    }
    return err;
  };

  // Build the plain-text team list for the didactics email:
  //   Team 1: Alice Smith (R1), Bob Jones (R2), …
  const teamListText = async (teams: Record<string, string>, header: string): Promise<string | null> => {
    if (!Object.keys(teams).length) return null;
    const all = await listProfiles();
    const byId = new Map(all.map((p) => [p.id, p]));
    const grouped = new Map<string, { name: string; level: string | null }[]>();
    for (const [pid, teamName] of Object.entries(teams)) {
      const p = byId.get(pid);
      const name = p?.full_name || p?.email || "Unknown";
      if (!grouped.has(teamName)) grouped.set(teamName, []);
      grouped.get(teamName)!.push({ name, level: p?.training_level ?? null });
    }
    const levelRank: Record<string, number> = { R1: 1, R2: 2, R3: 3, R4: 4, F1: 5, F2: 6 };
    const teamNames = [...grouped.keys()].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }));
    const lines = teamNames.map((tn) => {
      const members = grouped.get(tn)!
        .sort((a, b) => (levelRank[a.level ?? ""] ?? 9) - (levelRank[b.level ?? ""] ?? 9))
        .map((m) => (m.level ? `${m.name} (${m.level})` : m.name));
      return `${tn}: ${members.join(", ")}`;
    });
    return `${header}\n\n${lines.join("\n")}`;
  };
  const weeklyPairingsText = async (): Promise<string | null> =>
    teamListText((await getWeeklyTeams()).teams, "PRITE Daily — this week's didactics teams");
  const stableRosterText = async (): Promise<string | null> =>
    teamListText(await getStableTeams(), "PRITE Daily — season poll teams");

  // --- saved tests (hand-picked sets for class sessions, see lib/tests.ts) ---
  const [savedTests, setSavedTests] = useState<SavedTest[]>([]);
  const [showTests, setShowTests] = useState(false);
  useEffect(() => { writePref("pd_exam_mode", examMode); schedulePrefsPush(); }, [examMode]);
  useEffect(() => { writePref("pd_timer_on", timerOn); schedulePrefsPush(); }, [timerOn]);
  useEffect(() => { writePref("pd_timer_secs", timerSecs); schedulePrefsPush(); }, [timerSecs]);

  // --- auth + persistence ---
  const { session, profile, loading: authLoading, reloadProfile } = useAuth();
  const signedIn = Boolean(session);
  const approved = !isConfigured || profile?.status === "approved";
  const persist = isConfigured && signedIn && approved;
  // A ?poll=CODE link opened while signed OUT goes to the guest join flow
  // instead of the sign-in wall (read once at mount; signed-in users keep the
  // existing auto-join effect below, which also clears the URL param).
  const [guestPollCode, setGuestPollCode] = useState<string | null>(() => (isConfigured ? pollCodeFromUrl() : null));
  // Mobile: the header actions, library buttons and study toggles collapse
  // behind a "Menu" button (≤680px, via the .mobExtra CSS class) so the top of
  // the screen isn't a wall of pills. Desktop is unaffected.
  const [mobMenuOpen, setMobMenuOpen] = useState(false);

  // Poll every saved test's study-guide row while any of them are still
  // generating — a recursive timeout (not setInterval) so it naturally stops
  // once nothing's in flight, and restarts on pollGen bump or when the test
  // list changes. Works across tab closes/reopens since progress lives in
  // the DB, not in this component's state.
  const savedTestIdsKey = savedTests.map((t) => t.id).join(",");
  useEffect(() => {
    if (!persist || !savedTestIdsKey) return;
    let alive = true;
    const testIds = savedTestIdsKey.split(",");
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const map = await listStudyGuidesForTests(testIds);
      if (!alive) return false;
      setGuidesByTest((prev) => ({ ...prev, ...map }));
      return Object.values(map).some((g) => g.status === "generating");
    };
    const loop = async () => { if (alive && await tick()) timer = setTimeout(loop, 3000); };
    loop();
    return () => { alive = false; clearTimeout(timer); };
  }, [persist, savedTestIdsKey, pollGen]);

  const readyUnseenGuideCount = Object.values(guidesByTest).filter((g) => g.text_ready && !seenGuideIds.has(g.id)).length;

  // load the residency-wide library lazily, the first time the panel opens
  useEffect(() => {
    if (!showGuideLibrary || libraryGuides !== null) return;
    listLibraryStudyGuides().then(setLibraryGuides);
  }, [showGuideLibrary, libraryGuides]);

  // can this account generate guides? (admin or education-chief allowlist)
  useEffect(() => {
    if (!session) { setCanGenGuides(false); return; }
    let cancelled = false;
    canGenerateStudyGuides().then((ok) => { if (!cancelled) setCanGenGuides(ok); });
    return () => { cancelled = true; };
  }, [session]);

  const [answers, setAnswers] = useState<Record<string, AnswerRow>>({});
  // Questions credited from live polls — kept separate from `answers` (polls
  // don't feed mastery/SRS), but merged into the displayed "done" total so
  // class participation visibly counts, with a small badge for how much of
  // it came from polls specifically.
  const [pollAnsweredIds, setPollAnsweredIds] = useState<string[]>([]);
  const [groupNotes, setGroupNotes] = useState<DbGroupNote[]>([]);
  const [showApprovals, setShowApprovals] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stats, setStats] = useState<QuestionStats | null>(null);
  const [showBoard, setShowBoard] = useState(false);
  const [boardClosing, setBoardClosing] = useState(false); // play the summit pull-out before closing the leaderboard
  const [showCapite, setShowCapite] = useState(false); // "coming soon" modal — CAPITE bank isn't built yet
  const [psychMode, setPsychMode] = useState<"general" | "child">("general"); // General/Child Psychiatry toggle
  const selectChildPsych = () => { setPsychMode("child"); setShowCapite(true); };
  const closeCapite = () => { setShowCapite(false); setPsychMode("general"); }; // bounces back — nothing to switch to yet
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState<"today" | "browse" | "custom">("today");
  const [todayQueue, setTodayQueue] = useState<RawQuestion[]>([]);
  const [customQueue, setCustomQueue] = useState<RawQuestion[]>([]);
  const [customLabel, setCustomLabel] = useState<string>("");
  const [answersLoaded, setAnswersLoaded] = useState(false);
  const [prefsSynced, setPrefsSynced] = useState(false); // account-synced localStorage prefs merged (see lib/prefsSync)
  const [zoomImg, setZoomImg] = useState<string | null>(null); // figure/explanation image enlarged in a lightbox
  const [reviewMode, setReviewMode] = useState(false);
  const [showMissed, setShowMissed] = useState(false);
  const [allMyNotes, setAllMyNotes] = useState<Record<string, string>>({});
  const [showInsights, setShowInsights] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showDeck, setShowDeck] = useState(false);
  const [card, setCard] = useState<Flashcard | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [editCard, setEditCard] = useState<{ cloze: string; extra: string } | null>(null);
  const [highlights, setHighlights] = useState<HlRange[]>([]);
  const [context, setContext] = useState<string | null>(null); // null = not yet loaded
  const [showReport, setShowReport] = useState(false);     // per-question "report a problem"
  const [showSiteReport, setShowSiteReport] = useState(false); // general "report a site problem" (footer)
  const [showBugs, setShowBugs] = useState(false);        // admin bug-report triage
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [showOfficialResults, setShowOfficialResults] = useState(false); // admin "official" poll-results archive
  const [officialResults, setOfficialResults] = useState<OfficialPollResult[]>([]);
  const [showSrs, setShowSrs] = useState(false);          // spaced-repetition review panel
  const [srsDue, setSrsDue] = useState<SrsRow[]>([]);      // cards due right now (drives the header badge + panel queue)
  const refreshSrsDue = () => { if (persist) getDueReviewCards().then(setSrsDue); };
  const answersRef = useRef(answers);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // load all my prior answers once approved (to restore progress + mark done)
  useEffect(() => {
    if (persist) {
      setAnswersLoaded(false);
      getMyAnswers().then((a) => { setAnswers(a); setAnswersLoaded(true); });
      getMySettings().then((st) => {
        setSettings(st);
        // Merge the account's synced prefs (streak days, timer/exam prefs,
        // nag stages, …) into localStorage, then reflect the merged values
        // into already-initialized state. Streak/nag effects wait on
        // prefsSynced so they always see the cross-device history.
        const uid = profile?.id ?? session?.user?.id;
        if (uid) {
          const merged = syncClientPrefs(uid, st?.client_prefs);
          setExamMode(merged.exam_mode ?? false);
          setTimerOn(merged.timer_on ?? false);
          setTimerSecs(clampSecs(merged.timer_secs ?? 60));
          setSecsDraft(String(clampSecs(merged.timer_secs ?? 60)));
          setSeenGuideIds(new Set(merged.seen_study_guides));
        }
        setPrefsSynced(true);
      });
      getDueReviewCards().then(setSrsDue);
      loadTests().then(setSavedTests);
      getPollAnsweredQuestionIds().then(setPollAnsweredIds);
    } else { setAnswers({}); setAnswersLoaded(false); setSettings(null); setSrsDue([]); setSavedTests([]); setPrefsSynced(false); setPollAnsweredIds([]); }
  }, [persist]); // eslint-disable-line

  // build today's set: due-review (missed, past the recycle interval) first,
  // then new unanswered, capped at the regimen. Built from an answers snapshot
  // so answering doesn't reshuffle it mid-session.
  // extra=true ignores the daily cap (an explicit "give me another set").
  // count overrides the size for a one-off bonus set ("do N more today")
  // WITHOUT touching the saved daily-goal (regimen) setting.
  const buildToday = useCallback((extra = false, count?: number) => {
    if (!all) return;
    const regimen = settings?.regimen ?? 10;
    const recycle = settings?.recycle_missed ?? true;
    const reviewCap = settings?.review_per_day ?? 3;
    const afterMs = (settings?.recycle_after_days ?? 14) * 86400000;
    const now = Date.now();
    const a = answersRef.current;
    const answeredToday = Object.values(a).filter((r) => isSameDay(r.updated_at)).length;
    const remaining = count != null ? count : extra ? regimen : Math.max(0, regimen - answeredToday);
    const due: RawQuestion[] = [], fresh: RawQuestion[] = [];
    for (const qq of all) {
      const id = questionId(qq.year, qq.q_index);
      const row = a[id];
      if (!row) fresh.push(qq);
      // Recycle on the LATEST attempt, not first_correct — first_correct never
      // changes, so keying on it re-queued a question forever (every recycle
      // window, at the front of Today) even after it was re-answered right.
      else if (recycle && !row.correct && !row.cleared && now - Date.parse(row.updated_at) >= afterMs) due.push(qq);
    }
    // serve recent exams first (2022 → 2025, then older); stable sort keeps
    // each year's questions in their natural order
    fresh.sort((x, y) => yearRank(x.year) - yearRank(y.year));
    // include up to `reviewCap` due-review questions, fill the rest with new
    const reviewCount = Math.min(reviewCap, due.length, remaining);
    const fresher = fresh.slice(0, Math.max(0, remaining - reviewCount));
    setReviewMode(false);
    setTodayQueue([...due.slice(0, reviewCount), ...fresher]);
  }, [all, settings]);

  // build a review-only set from every currently-missed question, presented
  // fresh (answer hidden) for a second attempt
  const startReview = useCallback(() => {
    if (!all) return;
    const a = answersRef.current;
    const missed = all.filter((qq) => {
      const row = a[questionId(qq.year, qq.q_index)];
      return row && !row.correct && !row.cleared;
    });
    setReviewMode(true);
    setTodayQueue(missed.slice(0, 30));
    setMode("today"); setQi(0);
  }, [all]);

  useEffect(() => {
    if (persist && answersLoaded) buildToday();
  }, [persist, answersLoaded, buildToday]);

  // admins: load the member list (for the approvals panel + pending badge)
  const adminLoggedIn = isConfigured && !!profile?.is_admin;
  useEffect(() => {
    if (adminLoggedIn) listProfiles().then(setProfiles);
  }, [adminLoggedIn, showApprovals]);

  // Season-long stable-team roster: any approved member may need to look up
  // their own team, and admins need it to show/regenerate it from the modal.
  useEffect(() => {
    if (isConfigured && signedIn && approved) getStableTeams().then(setStableTeams);
  }, [isConfigured, signedIn, approved]);

  // This week's mixer pairing: participants look up their own team when a
  // "weekly" poll starts; admins see/copy/re-roll it from the host modal.
  useEffect(() => {
    if (!(isConfigured && signedIn && approved)) return;
    getWeeklyTeams().then(({ teams, generatedAt, generatedBy }) => { setWeeklyTeams(teams); setWeeklyGeneratedAt(generatedAt); setWeeklyGeneratedBy(generatedBy); });
  }, [isConfigured, signedIn, approved]);

  // Load bug reports: admins get everyone's (triage panel + open-count badge),
  // regular members get their own (RLS-scoped) so they can see admin replies.
  useEffect(() => {
    if (isConfigured && signedIn && approved) listBugReports().then(setBugs);
  }, [isConfigured, signedIn, approved, adminLoggedIn, showBugs]);
  const openBugs = bugs.filter((b) => b.status === "open").length;
  const actOnBug = async (id: string, status: string) => {
    await updateBugReport(id, status);
    listBugReports().then(setBugs);
  };
  const replyToBug = async (id: string, text: string) => {
    await respondToBugReport(id, text);
    listBugReports().then(setBugs);
  };

  // admins: load official poll-result submissions (for the archive panel)
  useEffect(() => {
    if (adminLoggedIn) listOfficialPollResults().then(setOfficialResults);
  }, [adminLoggedIn, showOfficialResults]);

  const actOnProfile = async (id: string, patch: Partial<Pick<Profile, "status" | "role" | "is_admin" | "is_education_chief" | "training_level">>) => {
    await updateProfile(id, patch);
    listProfiles().then(setProfiles);
  };

  // Load the real bank. When Supabase is configured the bank lives in a private
  // Storage bucket, so we wait until the user is signed in + approved before
  // requesting it (anonymous visitors can no longer pull questions.json). In
  // local-only mode (no backend) it loads the bundled file immediately.
  useEffect(() => {
    if (isConfigured && !(signedIn && approved)) return;
    let alive = true;
    loadQuestionBank()
      .then((data) => { if (alive) setAll(data as RawQuestion[]); })
      .catch((e) => { if (alive) setLoadErr(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, [signedIn, approved]);

  const years = useMemo(
    () => (all ? Array.from(new Set(all.map((q) => q.year))).sort() : []),
    [all]
  );
  const browseSet = useMemo(
    () => (all ? (year === "all" ? all : all.filter((q) => q.year === year)) : []),
    [all, year]
  );
  const byId = useMemo(() => {
    const m = new Map<string, RawQuestion>();
    if (all) for (const qq of all) m.set(questionId(qq.year, qq.q_index), qq);
    return m;
  }, [all]);
  const inToday = persist && mode === "today";
  // custom sets work signed-out too (e.g. studying a saved test in local mode)
  const inCustom = mode === "custom" && customQueue.length > 0;
  const inPractice = inToday || inCustom; // exam mode + timer apply only here
  const set = inToday ? todayQueue : inCustom ? customQueue : browseSet;
  const q = set[qi];
  // stable id of the on-screen question — effects key on THIS (not qi/mode) so
  // per-question state always resets, even when the set changes under an index
  const navQid = q ? questionId(q.year, q.q_index) : null;
  // explanations stay hidden while answering an exam-mode set (until review)
  const examActive = examMode && inPractice && !examReview;
  const showAnswer = revealed && !examActive;

  // reset tab + load this question's notes (mine + group) on navigation
  useEffect(() => {
    setTab("explanation"); setDraft(""); setStats(null); setCard(null); setEditCard(null); setContext(null); setCrossed([]);
    setAskOpen(false); setAskText("");
    if (navQid && persist) {
      getMyNote(navQid).then(setMyNote);
      getGroupNotes(navQid).then(setGroupNotes);
      getMyHighlights(navQid).then(setHighlights);
    } else { setMyNote(""); setGroupNotes([]); setHighlights([]); }
  }, [navQid, persist]); // eslint-disable-line

  // lazy-load the shared historical-context blurb when its tab is opened
  useEffect(() => {
    if (tab !== "context" || !persist || context !== null) return;
    const cur = set[qi];
    if (cur) getQuestionContext(questionId(cur.year, cur.q_index)).then((c) => setContext(c ?? ""));
  }, [tab, qi, persist, mode]); // eslint-disable-line

  // lazy-load the cached flashcard when the Flashcard tab is opened
  useEffect(() => {
    if (tab !== "flash" || !persist || card) return;
    const cur = set[qi];
    if (cur) getFlashcard(questionId(cur.year, cur.q_index)).then((c) => { if (c) setCard(c); });
  }, [tab, qi, persist, mode]); // eslint-disable-line

  // per-question class stats: fetch once the answer is actually shown
  useEffect(() => {
    if (!showAnswer || !persist) { setStats(null); return; }
    const cur = set[qi];
    if (!cur) return;
    getQuestionStats(questionId(cur.year, cur.q_index)).then(setStats);
  }, [showAnswer, qi, year, persist, mode]); // eslint-disable-line

  // leaderboard: (re)load whenever the modal opens
  useEffect(() => {
    if (showBoard && persist) getLeaderboard().then(setLeaders);
  }, [showBoard, persist]);

  // restore a prior answer (reveal state) on navigation. In review mode the
  // question is presented FRESH (answer hidden) so you get another attempt —
  // and likewise, in Today mode, a prior answer from an EARLIER day (i.e. a
  // recycled missed question) presents fresh: auto-revealing it made the
  // recycled question unanswerable, so it never counted toward the day and
  // stayed "due" at the front of the set on every sign-in. Browse/custom
  // still show any prior answer, and anything answered today stays revealed.
  // Keyed on the question ID itself (not `answers`) so submitting an answer
  // doesn't re-hide what you just revealed — and so picks always reset even
  // when the set changes underneath the same index (stale-highlight bug).
  useEffect(() => {
    const prior = navQid ? answers[navQid] : undefined;
    const showPrior = prior && !reviewMode && (!inToday || isSameDay(prior.updated_at));
    if (showPrior && prior) { setPicked(prior.picked); setRevealed(true); }
    else { setPicked([]); setRevealed(false); }
  }, [navQid, reviewMode, answersLoaded]); // eslint-disable-line

  // Drop keyboard focus when the question changes. The option <button>s are
  // keyed by letter, so React reuses the same element across questions — a
  // focus ring left on (say) option B would otherwise carry onto B of the
  // next question and look like a pre-selected answer.
  useEffect(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el && el.classList.contains("opt")) el.blur();
  }, [navQid]);

  useEffect(() => {
    if (qi >= set.length && set.length) setQi(0);
  }, [set.length]); // eslint-disable-line

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const el = tabRefs.current[tab];
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth, top: el.offsetTop + el.offsetHeight - 1 });
  }, [tab, revealed, qi]);

  const fire = (msg: string) => setToast(msg);

  const prefersReduced = () =>
    typeof window !== "undefined" && window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Escalating celebration. level 1 = a single modest burst (used for a correct
  // answer); higher levels add more bursts, particles, sparkle/glow and richer
  // palettes so longer streaks feel visibly cooler. Capped at level 5.
  const fireCelebration = (level: number) => {
    const canvas = confettiRef.current;
    if (!canvas || prefersReduced()) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const L = Math.max(1, Math.min(5, Math.round(level)));
    const base = [T.teal, T.gold, "#e07a5f", "#1a7a4a", "#ffffff", T.tealDeep, "#f2c14e"];
    const gold = [T.gold, "#f2c14e", "#ffd76a", "#ffffff", "#e6a817", T.teal];
    const rainbow = ["#e07a5f", "#f2c14e", T.gold, "#1a7a4a", T.teal, "#5b8def", "#a06cd5", "#ffffff"];
    const cfg = {
      1: { bursts: 1, per: 130, ttl: 105, speed: 9, colors: base, glow: false, gravity: 0.18 },
      2: { bursts: 2, per: 120, ttl: 120, speed: 10, colors: base, glow: false, gravity: 0.16 },
      3: { bursts: 4, per: 120, ttl: 130, speed: 11, colors: gold, glow: true, gravity: 0.15 },
      4: { bursts: 7, per: 130, ttl: 140, speed: 12, colors: rainbow, glow: true, gravity: 0.14 },
      5: { bursts: 11, per: 140, ttl: 150, speed: 13, colors: rainbow, glow: true, gravity: 0.13 },
    }[L]!;

    type P = {
      ox: number; oy: number; x: number; y: number; vx: number; vy: number;
      g: number; size: number; rot: number; vr: number; color: string;
      rect: boolean; delay: number; life: number; ttl: number;
    };
    const parts: P[] = [];
    for (let b = 0; b < cfg.bursts; b++) {
      // First burst centered-high; extras scattered across the upper screen.
      const cx = b === 0 ? W / 2 : W * (0.12 + Math.random() * 0.76);
      const cy = b === 0 ? H * 0.32 : H * (0.16 + Math.random() * 0.42);
      const delay = b === 0 ? 0 : 6 + b * 9 + ((Math.random() * 6) | 0);
      for (let i = 0; i < cfg.per; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = cfg.speed * (0.45 + Math.random() * 0.95);
        parts.push({
          ox: cx + (Math.random() - 0.5) * 60, oy: cy + (Math.random() - 0.5) * 22,
          x: 0, y: 0,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - (3 + Math.random() * 5),
          g: cfg.gravity + Math.random() * 0.12, size: 4 + Math.random() * (6 + L),
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.38,
          color: cfg.colors[(Math.random() * cfg.colors.length) | 0],
          rect: Math.random() > 0.45, delay, life: 0, ttl: cfg.ttl + Math.random() * 45,
        });
      }
    }
    for (const p of parts) { p.x = p.ox; p.y = p.oy; }

    const maxFrames = 240 + cfg.bursts * 12;
    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      let alive = false;
      for (const p of parts) {
        if (frame < p.delay) { alive = true; continue; } // waiting to launch
        if (p.life > p.ttl) continue;
        alive = true; p.life++;
        p.vy += p.g; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - p.life / p.ttl);
        if (cfg.glow) { ctx.shadowBlur = 8; ctx.shadowColor = p.color; }
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
        if (p.rect) ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        else { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      frame++;
      if (alive && frame < maxFrames) requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, W, H);
    };
    requestAnimationFrame(draw);
  };

  // Correct-answer pop reuses the modest level-1 celebration.
  const fireConfetti = () => fireCelebration(1);

  const completionLevel = (streak: number) =>
    streak >= 14 ? 5 : streak >= 7 ? 4 : streak >= 5 ? 3 : streak >= 3 ? 2 : 1;

  // Login streak: fires once per app load, after the cross-device prefs merge
  // so the streak math sees days recorded on other computers. Also seeds the
  // completion-streak chip.
  useEffect(() => {
    if (!persist || !prefsSynced || loginCheckedRef.current) return;
    loginCheckedRef.current = true;
    const uid = profile?.id ?? session?.user?.id ?? "anon";
    setDoneStreak(peekStreak(uid, "completion"));
    const { streak, isNew } = recordToday(uid, "login");
    if (isNew && streak >= 2) {
      const level = streak >= 14 ? 3 : streak >= 7 ? 2 : 1;
      setStreakReward({ kind: "login", streak, level });
      fireCelebration(level);
    }
  }, [persist, prefsSynced, profile?.id, session?.user?.id]);

  // Nudge to opt into daily reminder emails: on day 2 of use, again at 2 weeks,
  // again at 4 weeks, then never again — skipped entirely if reminders are
  // already effectively on (explicit true, or auto-on within the exam window).
  useEffect(() => {
    if (!persist || !settings || !prefsSynced || reminderPromptCheckedRef.current) return;
    reminderPromptCheckedRef.current = true;
    const effectiveOn = settings.daily_reminder === true ? true
      : settings.daily_reminder === false ? false
      : isAutoReminderActive(settings.exam_date);
    if (effectiveOn) return;
    const uid = profile?.id ?? session?.user?.id ?? "anon";
    const stage = dueReminderPromptStage(uid, totalDays(uid, "login"));
    if (stage) setReminderPromptStage(stage);
  }, [persist, settings, prefsSynced, profile?.id, session?.user?.id]);

  const dismissReminderPrompt = () => {
    const uid = profile?.id ?? session?.user?.id ?? "anon";
    if (reminderPromptStage) markReminderPromptShown(uid, reminderPromptStage);
    setReminderPromptStage(null);
  };
  const acceptReminderPrompt = () => {
    const uid = profile?.id ?? session?.user?.id ?? "anon";
    if (reminderPromptStage) markReminderPromptShown(uid, reminderPromptStage);
    saveSettingsNow({ daily_reminder: true });
    setReminderPromptStage(null);
  };

  // Caution notice about AI-generated explanations: shown twice in the first
  // week of use (day 1, day 4), then never again.
  useEffect(() => {
    if (!persist || !prefsSynced || aiDisclaimerCheckedRef.current) return;
    aiDisclaimerCheckedRef.current = true;
    const uid = profile?.id ?? session?.user?.id ?? "anon";
    const stage = dueAiDisclaimerStage(uid, totalDays(uid, "login"));
    if (stage) setAiDisclaimerStage(stage);
  }, [persist, prefsSynced, profile?.id, session?.user?.id]);

  const dismissAiDisclaimer = () => {
    const uid = profile?.id ?? session?.user?.id ?? "anon";
    if (aiDisclaimerStage) markAiDisclaimerShown(uid, aiDisclaimerStage);
    setAiDisclaimerStage(null);
  };
  const reportFromAiDisclaimer = () => {
    dismissAiDisclaimer();
    setShowSiteReport(true);
  };

  // Completion streak: fires the first time the daily target is reached each day.
  useEffect(() => {
    if (!persist) return;
    const tgt = settings?.regimen ?? 10;
    const done = Object.values(answers).filter((a) => isSameDay(a.updated_at)).length;
    const today = ymd();
    if (done >= tgt && completionCelebratedRef.current !== today) {
      completionCelebratedRef.current = today;
      const uid = profile?.id ?? session?.user?.id ?? "anon";
      const { streak, isNew } = recordToday(uid, "completion");
      setDoneStreak(streak);
      if (isNew) {
        const level = completionLevel(streak);
        setStreakReward({ kind: "completion", streak, level });
        fireCelebration(level);
      }
    }
  }, [persist, answers, settings?.regimen, profile?.id, session?.user?.id]);

  // Auto-dismiss the streak reward card.
  useEffect(() => {
    if (!streakReward) return;
    const t = setTimeout(() => setStreakReward(null), streakReward.kind === "completion" ? 4200 : 5400);
    return () => clearTimeout(t);
  }, [streakReward]);

  // --- per-question timer ---
  // finalize() is defined after the auth-gate early returns, so we reach it
  // through a ref that the render keeps current.
  const finalizeRef = useRef<(timedOut: boolean) => void>(() => {});
  // Run a fresh countdown for each unanswered question in a practice mode.
  useEffect(() => {
    if (!timerOn || !inPractice || examReview || revealed || !q) { setTimeLeft(null); return; }
    setTimeLeft(timerSecs);
    const id = setInterval(() => {
      setTimeLeft((t) => (t == null ? t : t <= 1 ? 0 : t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [timerOn, inPractice, examReview, revealed, qi, mode, timerSecs, q?.year, q?.q_index]); // eslint-disable-line
  // When time runs out, lock the question in (auto-submit, like the real exam).
  useEffect(() => {
    if (timeLeft === 0 && !revealed) finalizeRef.current(true);
  }, [timeLeft, revealed]);

  // Auto-join a poll when arriving via a ?poll=CODE link.
  useEffect(() => {
    if (!persist) return;
    const code = pollCodeFromUrl();
    if (code) { setJoinCode(code); clearPollParam(); }
  }, [persist]); // eslint-disable-line

  // Auto-open a study guide when arriving via a ?study=<id> link.
  useEffect(() => {
    if (!persist) return;
    const id = studyGuideIdFromUrl();
    if (id) { setOpenStudyGuideId(id); clearStudyParam(); }
  }, [persist]); // eslint-disable-line

  // Auto-open Settings when arriving via the reminder email's "Change
  // frequency" link (?openSettings=1).
  useEffect(() => {
    if (!persist || !settings) return;
    const u = new URL(window.location.href);
    if (u.searchParams.get("openSettings")) {
      setShowSettings(true);
      u.searchParams.delete("openSettings");
      window.history.replaceState({}, "", u.toString());
    }
  }, [persist, settings]);

  // Motivation reward: when the daily set (or an exam-mode set) first flips
  // to complete, pop a random reel from the saved Instagram "Motivation"
  // collection. Mirrors the dayComplete/examSetComplete math below, but lives
  // up here because hooks can't sit past the auth-gate early returns. The ref
  // gates it to once per completion (re-arms when a new set starts).
  // (?reward=1 in the URL pops the chooser immediately — handy for previewing)
  const [reward, setReward] = useState<boolean>(() =>
    !!new URLSearchParams(window.location.search).get("reward"));
  const [birdOn, setBirdOn] = useState(false); // the hand-drawn bird is flying around
  const rewardArmed = useRef(true);
  const rewardTarget = settings?.regimen ?? 10;
  const rewardDoneToday = Object.values(answers).filter((a) => isSameDay(a.updated_at)).length;
  const rewardSetAnswered = inPractice ? set.filter((qq) => answers[questionId(qq.year, qq.q_index)]).length : 0;
  const rewardDailyDone = inToday && rewardDoneToday >= rewardTarget;
  const rewardExamDone = examMode && inPractice && set.length > 0 && rewardSetAnswered >= set.length;
  const rewardSetDone = rewardDailyDone || rewardExamDone;
  useEffect(() => {
    if (rewardSetDone && rewardArmed.current) {
      rewardArmed.current = false;
      // The daily set is "done" again on every revisit that day (the answers
      // are still today's), so gate its reward to once per local calendar day
      // (pd_reward_shown_day, account-synced). Exam-mode sets are genuinely
      // new completions each time and always celebrate.
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (rewardDailyDone && !rewardExamDone) {
        // raw string key (not JSON) — prefsSync reads/writes it with readStr/setItem
        let shown = "";
        try { shown = localStorage.getItem("pd_reward_shown_day") || ""; } catch { /* ignore */ }
        if (shown === today) return;
        try { localStorage.setItem("pd_reward_shown_day", today); } catch { /* best-effort */ }
        schedulePrefsPush();
      }
      setReward(true);
    }
    if (!rewardSetDone) rewardArmed.current = true;
  }, [rewardSetDone, rewardDailyDone, rewardExamDone]);

  // Scroll edge effect: the translucent top bar only casts a shadow once
  // content is actually scrolled underneath it (no hard divider at rest).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 6);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  // --- auth gate (only when Supabase is configured) ---
  if (isConfigured && authLoading) return <Center>Signing you in…</Center>;
  if (isConfigured && !session && guestPollCode)
    return <GuestPoll code={guestPollCode} onClose={() => { setGuestPollCode(null); clearPollParam(); }} />;
  // A participant joining a live poll takes over the whole screen as its OWN
  // page — NOT a fixed overlay layered on the app. A real full-screen page
  // scrolls the document natively, which is the only thing iOS Safari handles
  // reliably (the fixed-overlay + inner-scroll-container version kept trapping
  // touch scroll on phones). Nothing of the main app is mounted behind it.
  if (isConfigured && session && joinCode)
    return (
      <PollParticipant
        code={joinCode}
        voter={profile?.id ?? session?.user?.id ?? "anon"}
        trainingLevel={profile?.training_level ?? null}
        stableTeam={profile ? stableTeams[profile.id] ?? null : null}
        weeklyTeam={profile ? weeklyTeams[profile.id] ?? null : null}
        byId={byId}
        displayName={profile?.full_name || profile?.email || session?.user.email || "You"}
        onClose={() => setJoinCode(null)}
      />
    );
  if (isConfigured && !session) return <SignIn />;
  if (isConfigured && session && (!profile || profile.status !== "approved"))
    return <Pending email={session.user.email ?? ""} status={profile?.status ?? "pending"} />;
  if (isConfigured && session && profile && profile.status === "approved" && !profile.training_level)
    return <TrainingLevelGate onSaved={reloadProfile} />;

  if (loadErr) return <Center>Couldn’t load the question bank: {loadErr}</Center>;
  if (!all) return <Center>Loading the PRITE bank…</Center>;
  // "Caught up today" is no longer a full-page takeover (that felt like leaving
  // the site). It now renders as a card in the normal app shell — the header,
  // nav and study bar stay put, and only the question slot is swapped for the
  // caught-up card below. So we only hard-return for the genuinely empty states.
  if (!q && persist && mode === "today" && !answersLoaded) return <Center>Building today’s set…</Center>;
  if (!q && !(persist && mode === "today")) return <Center>No questions for this filter.</Center>;

  const correctSet = q ? (q.answer_letters && q.answer_letters.length ? q.answer_letters
    : q.answer_letter ? [q.answer_letter] : []) : [];
  const isCorrect =
    revealed && picked.length > 0 &&
    picked.length === correctSet.length && picked.every((l) => correctSet.includes(l));

  const togglePick = (key: string) => {
    if (revealed) return;
    setPicked((cur) =>
      q.multi_select
        ? (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key])
        : [key]
    );
  };
  // right-click an option to cross it out (process of elimination); right-click
  // again to restore. Local to the current question; resets on navigation.
  const toggleCross = (key: string) =>
    setCrossed((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const finalize = async (timedOut = false) => {
    if (revealed) return;
    if (!timedOut && !picked.length) return; // need a pick unless the clock ran out
    setRevealed(true);
    const right =
      picked.length > 0 &&
      picked.length === correctSet.length && picked.every((l) => correctSet.includes(l));
    // Hold the celebration until review when explanations are deferred.
    if (right && !examActive) setTimeout(fireConfetti, 140);
    if (persist && q) {
      const qid = questionId(q.year, q.q_index);
      const saved = await saveAnswer(qid, picked, right);
      if (saved) setAnswers((m) => ({ ...m, [qid]: saved }));
      if (!right) { ensureTrackedForReview(qid).then(refreshSrsDue); }
    }
    // Exam mode hides the result, so move straight to the next question.
    if (examActive && qi < set.length - 1) {
      setTimeout(() => setQi((i) => Math.min(i + 1, set.length - 1)), timedOut ? 650 : 220);
    }
  };
  finalizeRef.current = finalize;
  const submit = () => finalize(false);

  const go = (delta: number) => setQi((i) => (i + delta + set.length) % set.length);
  const doJump = () => {
    const n = parseInt(jump, 10);
    if (!isNaN(n) && n >= 1 && n <= set.length) setQi(n - 1);
    setJump("");
  };

  const hasExpl = q ? (q.explanation_text || q.explanation_images.length > 0) : false;
  const hasDiagram = q ? !!(q.diagram?.code || (q.comparison_table && q.comparison_table.rows?.length)) : false;
  const tabs: [string, string, React.ReactNode][] = [
    ["explanation", "Explanation", <Layers size={14} strokeWidth={2.2} />],
    ["practice", "In practice", <Stethoscope size={14} strokeWidth={2.2} />],
    ["context", "Context", <Lightbulb size={14} strokeWidth={2.2} />],
    ...(hasDiagram
      ? ([["diagram", "Diagram", <Network size={14} strokeWidth={2.2} />]] as [string, string, React.ReactNode][])
      : []),
    ["video", "Video", <Youtube size={14} strokeWidth={2.2} />],
    ["mine", "My notes", <NotebookPen size={14} strokeWidth={2.2} />],
    ["group", "Group notes", <Users size={14} strokeWidth={2.2} />],
    ["flash", "Flashcard", <Sparkles size={14} strokeWidth={2.2} />],
  ];

  const qid = q ? questionId(q.year, q.q_index) : "";
  const isAdmin = !!profile?.is_admin;
  const pendingCount = profiles.filter((p) => p.status === "pending").length;
  const answeredCount = Object.keys(answers).length;
  // Poll-answered questions count toward the total too (union with practice —
  // a question answered both ways isn't double-counted), with pollCreditCount
  // tracking how many of the total came from a poll for the small badge.
  const pollOnlyCount = pollAnsweredIds.filter((id) => !(id in answers)).length;
  const totalDoneCount = answeredCount + pollOnlyCount;
  const pollCreditCount = pollAnsweredIds.length;
  // progress is derived from answers dated today (persists across refresh),
  // not from the live queue (which rebuilds and drops answered questions)
  const target = settings?.regimen ?? 10;
  const doneToday = Object.values(answers).filter((a) => isSameDay(a.updated_at)).length;
  const dayComplete = inToday && doneToday >= target;
  const missedOutstanding = Object.values(answers).filter((a) => !a.correct && !a.cleared).length;

  // exam-mode progress across the current set
  const setRows = inPractice ? set.map((qq) => answers[questionId(qq.year, qq.q_index)]) : [];
  const setAnswered = setRows.filter(Boolean).length;
  const examSetComplete = examMode && inPractice && set.length > 0 && setAnswered >= set.length;
  const examScore = setRows.filter((r) => r && r.correct).length;
  // Falls back to the residency's assumed PRITE date (Oct 6, see
  // reminderWindow.ts) when the user hasn't set their own — same default the
  // Settings date box now displays.
  const examDays = settings ? daysUntil(settings.exam_date || guessedExamDate()) : null;
  const switchMode = (m: "today" | "browse" | "custom") => { setMode(m); setQi(0); setReviewMode(false); };

  // Clicking the PRITE Daily wordmark: back to the home screen — today's set,
  // every overlay panel closed, scrolled to the top. Deliberately doesn't
  // touch live poll / exam state, so a stray click can't blow up a session.
  const goHome = () => {
    setShowTests(false); setShowBoard(false); setShowStats(false); setShowInsights(false);
    setShowApprovals(false); setShowBugs(false); setShowOfficialResults(false); setShowSettings(false);
    setShowGuideLibrary(false); setShowDeck(false); setShowMissed(false); setShowSrs(false);
    setShowCapite(false); setOpenStudyGuideId(null); setHostFromTests(false);
    switchMode("today");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // start a custom study session from a hand-picked set (from the Search modal)
  const startCustom = (qs: RawQuestion[], label: string) => {
    if (!qs.length) return;
    setCustomQueue(qs);
    setCustomLabel(label);
    setMode("custom"); setQi(0); setReviewMode(false);
    setShowDeck(false);
    fire(`Studying ${qs.length} question${qs.length === 1 ? "" : "s"}${label ? ` · ${label}` : ""}`);
  };
  // Kick off (or regenerate) the study guide for a saved test. Generation
  // runs server-side in the background — this call returns almost instantly
  // once the placeholder row is written, so there's nothing to await here.
  // You can close the panel; the poll loop above picks up progress, and the
  // Tests button badges once it's ready. Only stem + topic tags are sent to
  // the model — never options/answer/explanation — so it can't spoil the quiz.
  const buildStudyGuide = async (t: SavedTest, force = false, sessionDate: string | null = null, slidesOnly = false) => {
    const qs = t.qids.map((id) => byId.get(id)).filter(Boolean) as RawQuestion[];
    if (!qs.length) { fire("None of this test's questions are in the current bank"); return; }
    // regenerating: forget we'd already "seen" the old ready guide, so the
    // badge reappears once the fresh one lands (same row id, reused).
    const existingId = guidesByTest[t.id]?.id;
    if (existingId) setSeenGuideIds((prev) => { const n = new Set(prev); n.delete(existingId); return n; });
    const topics = qs.map((q) => ({ stem: q.stem, prite_category: q.prite_category, prite_label: q.prite_label, topics: q.tags?.topics }));
    const result = await generateStudyGuide(t.id, t.name, topics, force, sessionDate, slidesOnly);
    if ("error" in result) { fire(`Couldn't build the ${slidesOnly ? "slides" : "study guide"}: ${result.error}`); return; }
    setGuidesByTest((prev) => ({ ...prev, [t.id]: result }));
    setPollGen((n) => n + 1);
    if (slidesOnly) {
      if (result.status === "ready" && (result.slides?.length ?? 0) > 0) downloadTeachingDeck(t, result); // already cached
      else fire(`Writing "${t.name}"'s prep slides — feel free to close this. The Tests button will show when they're ready.`);
      return;
    }
    if (result.status === "ready") setGuideToShare({ guide: result, test: t }); // already cached — nothing to wait for
    else fire(`Writing "${t.name}"'s study guide — feel free to close this. The Tests button will show when it's ready.`);
  };

  const downloadTeachingDeck = async (t: SavedTest, guide: StudyGuide) => {
    try {
      await exportTeachingPptx(guide, `${guide.title.replace(/[^\w\- ]+/g, "").trim() || "prite-prereading"}.pptx`);
      fire(`Built "${t.name}"'s prep slides as PowerPoint`);
    } catch (e) { fire("Slides export failed"); console.warn(e); }
  };

  // clicking the Custom toggle: jump back into an existing set, or open the picker
  const goCustom = () => {
    if (customQueue.length) switchMode("custom");
    else setShowDeck(true);
  };
  const saveSettingsNow = async (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    await saveSettings(patch);
  };
  const displayName = profile?.full_name || profile?.email || session?.user.email || "You";
  const isAnswered = Boolean(answers[qid]);

  const saveNoteNow = () => { if (persist) saveMyNote(qid, myNote); };
  // selection highlights for the stem — persisted per user + question
  const updateHighlights = (next: Span[]) => {
    const hl: HlRange[] = next.map((r) => ({ field: "stem", start: r.start, end: r.end }));
    setHighlights(hl);
    if (persist) saveMyHighlights(qid, hl);
  };
  const doExportMine = async () => {
    if (myNote.trim()) await saveMyNote(qid, myNote); // flush the current one first
    const notes = await getAllMyNotes();
    if (!notes.length) { fire("No notes to export yet"); return; }
    exportMyNotes(notes, byId, answers, displayName);
    fire(`Exported ${notes.length} note${notes.length === 1 ? "" : "s"} → study sheet`);
  };
  const doExportGroup = async () => {
    const g = await getAllGroupNotes();
    if (!g.length) { fire("No group notes to export yet"); return; }
    exportGroupNotes(g, byId);
    fire(`Exported ${g.length} group comment${g.length === 1 ? "" : "s"}`);
  };
  const missedIds = Object.entries(answers).filter(([, a]) => !a.correct && !a.cleared).map(([id]) => id);
  const openMissed = async () => {
    const notes = await getAllMyNotes();
    setAllMyNotes(Object.fromEntries(notes.map((n) => [n.question_id, n.text])));
    setShowMissed(true);
  };
  const onGradeSrs = async (qid: string, grade: SrsGrade) => {
    await gradeReviewCard(qid, grade);
    setSrsDue((cur) => cur.filter((r) => r.question_id !== qid));
  };
  const doExportMissed = () => {
    exportMissed(missedIds, byId, answers, allMyNotes, displayName);
    fire(`Exported ${missedIds.length} missed question${missedIds.length === 1 ? "" : "s"}`);
  };
  const clearMissed = async () => {
    const n = missedIds.length;
    if (!n) { fire("No learning opportunities to clear"); return; }
    if (!window.confirm(`Clear all ${n} learning opportunit${n === 1 ? "y" : "ies"}? Your history is kept — these just won't show up as learning opportunities anymore.`)) return;
    if (persist) await clearMissedAnswers();
    // keep the rows, just mark the currently-missed ones cleared
    const next = Object.fromEntries(
      Object.entries(answers).map(([id, a]) => [id, a.correct ? a : { ...a, cleared: true }])
    );
    answersRef.current = next;
    setAnswers(next);
    setShowMissed(false);
    buildToday();
    fire(`Cleared ${n} learning opportunit${n === 1 ? "y" : "ies"}`);
  };
  const doGenerateCard = async (force = false) => {
    setCardBusy(true);
    const res = await generateFlashcard({
      question_id: qid, stem: q.stem, options: q.options,
      answer_letter: q.answer_letter, answer_text: q.answer_text, force,
    });
    setCardBusy(false);
    if ("error" in res) { fire("Flashcard error: " + res.error); return; }
    setCard(res); setEditCard(null);
    if (!force) fire(res.cached ? "Loaded the class card" : "Card generated & cached for the class");
  };
  const doSaveCard = async () => {
    if (!editCard) return;
    await saveFlashcard(qid, editCard.cloze, editCard.extra);
    setCard({ question_id: qid, cloze_text: editCard.cloze, extra: editCard.extra });
    setEditCard(null);
    fire("Canonical card updated for the class");
  };
  const doDownloadCard = async () => {
    if (!card) return;
    fire("Building .apkg…");
    const { buildApkg } = await import("./lib/apkg");
    const [ctx, diagramSvg] = await Promise.all([getQuestionContext(qid), renderDiagramSvg(q.diagram?.code)]);
    await buildApkg([{ questionId: qid, cloze: card.cloze_text, lecture: ankingLecture(q, { context: ctx, diagramSvg }) }], `prite-${qid}.apkg`);
    fire("Downloaded — double-click to import into Anki");
  };
  const postGroupNote = async () => {
    if (!draft.trim() || !persist) return;
    await addGroupNote(qid, draft.trim());
    setDraft("");
    setGroupNotes(await getGroupNotes(qid));
  };
  const removeGroupNote = async (id: string) => {
    await deleteGroupNote(id);
    setGroupNotes((ns) => ns.filter((n) => n.id !== id));
  };

  return (
    <div style={s.root} className={mobMenuOpen ? "mobMenuOpen" : undefined}>
      <style>{CSS}</style>

      {/* Top bar */}
      <header style={{ ...s.top, ...(scrolled ? s.topScrolled : {}) }}>
        <div style={s.topInner} className="topInner">
          {/* Wordmark = home button. Mark AND name ride an endlessly drifting
              AI-painted cloud horizon: the strip is tiled mirror-image pairs
              (each seam is its own reflection, so the scroll never shows a
              seam) and translateX loops half the track width. The mark and
              the name each bob on their own slightly offset float cycle, like
              two things floating on the same sky. */}
          <button style={s.brand} className="brandHome" onClick={goHome} title="Back to the home screen">
            <span className="cloudWrap" aria-hidden>
              <span className="cloudTrack">
                <img src="/brand-clouds.jpg" alt="" /><img src="/brand-clouds.jpg" alt="" />
                <img src="/brand-clouds.jpg" alt="" /><img src="/brand-clouds.jpg" alt="" />
              </span>
            </span>
            <span style={s.brandMark} className="brandFloat">
              <Stethoscope size={16} strokeWidth={2.4} style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.45))" }} />
            </span>
            <span style={s.brandName} className="brandFloatSlow">PRITE&nbsp;<span style={{ color: "#cfd6df", fontWeight: 500 }}>Daily</span></span>
          </button>
          <div style={s.topMeta} className="topMeta">
            <button
              className="mobMenuBtn"
              style={s.approveBtn}
              onClick={() => setMobMenuOpen((v) => !v)}
              title={mobMenuOpen ? "Hide the menu" : "Show all menu options"}
            >
              {mobMenuOpen ? <ChevronUp size={13} strokeWidth={2.4} /> : <ChevronDown size={13} strokeWidth={2.4} />} Menu
            </button>
            <span style={s.countdown}>
              {examDays !== null
                ? <><span style={{ ...s.countNum, color: examDays <= 14 ? "#e07a5f" : T.gold }}>{examDays}</span> {examDays === 1 ? "day" : "days"} to exam</>
                : <><span style={s.countNum}>{all.length}</span> questions</>}
              {persist && (
                <>
                  {" "}· <span style={s.countNum}>{totalDoneCount}</span> done
                  {pollCreditCount > 0 && (
                    <span style={s.pollCreditNum} title={`${pollCreditCount} of those were answered in a live class poll`}>+{pollCreditCount} 🎤</span>
                  )}
                </>
              )}
              {persist && doneStreak > 0 && (
                <> · <span style={s.streakChip} title={`${doneStreak}-day daily streak`}><span className="flameFlicker"><Flame size={11} strokeWidth={2.6} /></span> {doneStreak}</span></>
              )}
            </span>
            {persist ? (
              <span style={s.who} className="topActions mobExtra">
                <span style={s.navSegRow} className="topActBtn" title="General Psychiatry (PRITE) vs. Child & Adolescent Psychiatry (CAPITE)">
                  <button
                    style={{ ...s.navSegBtn, ...(psychMode === "general" ? s.navSegOn : {}) }}
                    onClick={() => setPsychMode("general")}
                  >
                    <Stethoscope size={12} strokeWidth={2.3} /> <span className="btnTxt">General</span>
                  </button>
                  <button
                    style={{ ...s.navSegBtn, ...(psychMode === "child" ? s.navSegOn : {}) }}
                    onClick={selectChildPsych}
                  >
                    <Baby size={12} strokeWidth={2.3} /> <span className="btnTxt">Child</span>
                  </button>
                </span>
                <button style={s.approveBtn} className="topActBtn" onClick={() => setShowBoard(true)} title="Leaderboard">
                  <Trophy size={13} strokeWidth={2.3} /> <span className="btnTxt">Leaderboard</span>
                </button>
                <button style={s.approveBtn} className="topActBtn" onClick={() => setShowStats(true)} title="Personal Statistics">
                  <TrendingUp size={13} strokeWidth={2.3} /> <span className="btnTxt">Personal Statistics</span>
                </button>
                <button style={s.approveBtn} className="topActBtn" onClick={() => setShowInsights(true)} title="Residency Insights">
                  <BarChart3 size={13} strokeWidth={2.3} /> <span className="btnTxt">Residency Insights</span>
                </button>
                {isAdmin && (
                  <button style={s.approveBtn} className="topActBtn" onClick={() => setShowApprovals(true)} title="Approvals">
                    <ShieldCheck size={13} strokeWidth={2.3} /> <span className="btnTxt">Approvals</span>
                    {pendingCount > 0 && <span style={s.pendingBadge}>{pendingCount}</span>}
                  </button>
                )}
                {isAdmin && (
                  <button style={s.approveBtn} className="topActBtn" onClick={() => setShowBugs(true)} title="Bug reports">
                    <Bug size={13} strokeWidth={2.3} /> <span className="btnTxt">Reports</span>
                    {openBugs > 0 && <span style={s.pendingBadge}>{openBugs}</span>}
                  </button>
                )}
                {!isAdmin && bugs.length > 0 && (
                  <button style={s.approveBtn} className="topActBtn" onClick={() => setShowBugs(true)} title="Your bug reports & feature requests — and any replies from the admins">
                    <Bug size={13} strokeWidth={2.3} /> <span className="btnTxt">My reports</span>
                    {bugs.some((b) => b.admin_response) && <span style={s.pendingBadge}>{bugs.filter((b) => b.admin_response).length}</span>}
                  </button>
                )}
                {isAdmin && (
                  <button style={s.approveBtn} className="topActBtn" onClick={() => setShowOfficialResults(true)} title="Official poll results & season team rosters">
                    <Archive size={13} strokeWidth={2.3} /> <span className="btnTxt">Polls & Teams</span>
                  </button>
                )}
                <button style={s.signOut} title="Settings" onClick={() => setShowSettings(true)}>
                  <SettingsIcon size={14} strokeWidth={2.2} />
                </button>
                <span style={s.avatarSm}>{(displayName[0] || "?").toUpperCase()}</span>
                <span style={s.adminTag}>
                  {isAdmin && <ShieldCheck size={11} strokeWidth={2.5} />}
                  {isAdmin ? "Admin" : (profile?.role ?? "")}
                </span>
                <button style={s.signOut} title="Sign out" onClick={() => signOut()}>
                  <LogOut size={13} strokeWidth={2.2} />
                </button>
              </span>
            ) : (
              <span style={s.adminTag}>local preview</span>
            )}
          </div>
        </div>
      </header>

      <main style={examActive ? { ...s.well, maxWidth: 880 } : s.well}>
        {/* Navigation / filter row */}
        <div style={s.nav} className={examActive ? "examDim" : undefined}>
          {persist && (
            <div style={s.modeToggle}>
              <button style={{ ...s.modeBtn, ...(mode === "today" ? s.modeOn : {}) }} onClick={() => switchMode("today")}>
                <Sparkles size={13} strokeWidth={2.2} /> Today
              </button>
              <button style={{ ...s.modeBtn, ...(mode === "custom" ? s.modeOn : {}) }} onClick={goCustom} title="Build a study set by topic, year, drug or diagnosis">
                <Target size={13} strokeWidth={2.2} /> Custom
              </button>
              <button style={{ ...s.modeBtn, ...(mode === "browse" ? s.modeOn : {}) }} onClick={() => switchMode("browse")}>
                <Layers size={13} strokeWidth={2.2} /> Browse
              </button>
            </div>
          )}
          <button style={s.deckBtn} className="mobExtra" onClick={() => setShowDeck(true)} title="Search & filter questions">
            <Search size={13} strokeWidth={2.4} /> Search
          </button>
          <button
            className="mobExtra"
            style={{ ...s.deckBtn, position: "relative" }}
            onClick={() => {
              setShowTests(true);
              // opening the panel is the "I've seen it" signal — clear the badge
              setSeenGuideIds((prev) => {
                const next = new Set(prev);
                for (const g of Object.values(guidesByTest)) if (g.text_ready) next.add(g.id);
                return next;
              });
            }}
            title="Saved tests — hand-picked sets for class sessions"
          >
            <ListChecks size={13} strokeWidth={2.4} /> Saved tests{savedTests.length ? ` (${savedTests.length})` : ""}
            {readyUnseenGuideCount > 0 && (
              <span
                title={`${readyUnseenGuideCount} study guide${readyUnseenGuideCount === 1 ? "" : "s"} ready`}
                style={{
                  position: "absolute", top: -4, right: -4, width: 9, height: 9, borderRadius: "50%",
                  background: T.gold, border: `1.5px solid ${T.ink}`,
                }}
              />
            )}
          </button>
          {persist && (
            <button style={s.deckBtn} className="mobExtra" onClick={() => setShowGuideLibrary(true)} title="Every study guide the residency has generated — read or listen to past sessions' prep material">
              <Volume2 size={13} strokeWidth={2.4} /> Study guides
            </button>
          )}
          {persist && (
            <button style={s.deckBtn} className="mobExtra" onClick={() => setShowSrs(true)} title="Spaced-repetition flashcard review of questions you've missed, right in the browser">
              <Repeat size={13} strokeWidth={2.4} /> Web flashcards{srsDue.length ? ` (${srsDue.length})` : ""}
            </button>
          )}
          {inToday ? (
            <>
              <span style={s.todayProg}>
                <Target size={13} strokeWidth={2.3} color={dayComplete ? T.teal : T.faint} />
                <b style={{ color: dayComplete ? T.teal : "#e7eaf0" }}>{doneToday}</b>
                <span style={{ color: T.faint }}>/ {target} today</span>
                <span style={s.progTrack} aria-hidden>
                  <span
                    className={"progFill" + (dayComplete ? " progFillDone" : "")}
                    style={{ ...s.progFill, width: `${Math.min(100, Math.round((doneToday / Math.max(1, target)) * 100))}%` }}
                  />
                </span>
              </span>
              {missedOutstanding > 0 && (
                <button style={s.missChip} className="mobExtra" onClick={openMissed} title="Read & review your missed questions">
                  <span className="flameFlicker"><Flame size={12} strokeWidth={2.2} color={T.gold} /></span>
                  <span>
                    {missedOutstanding} learning {missedOutstanding === 1 ? "opportunity" : "opportunities"}
                  </span>
                </button>
              )}
            </>
          ) : inCustom ? (
            <span style={s.todayProg}>
              <Target size={13} strokeWidth={2.3} color={T.teal} />
              <b style={{ color: "#e7eaf0" }}>{set.length}</b>
              <span style={{ color: T.faint }}>custom{customLabel ? ` · ${customLabel}` : ""}</span>
              <button style={s.customEdit} onClick={() => setShowDeck(true)} title="Change this set">
                <Pencil size={11} strokeWidth={2.3} /> Edit
              </button>
            </span>
          ) : (
            <select value={year} onChange={(e) => { setYear(e.target.value); setQi(0); }} style={s.sel}>
              <option value="all">All years ({all.length})</option>
              {years.map((y) => (
                <option key={y} value={y}>{y} ({all.filter((x) => x.year === y).length})</option>
              ))}
            </select>
          )}
          {set.length > 0 && (
            <div style={s.navMid}>
              <button style={s.navBtn} onClick={() => go(-1)} title="Previous"><ArrowLeft size={16} strokeWidth={2.4} /></button>
              <span style={s.navInfo}>{qi + 1} <span style={{ color: T.faint }}>/ {set.length}</span></span>
              <button style={s.navBtn} onClick={() => go(1)} title="Next"><ArrowRight size={16} strokeWidth={2.4} /></button>
            </div>
          )}
          {!inToday && (
            <div style={s.jumpWrap} className="mobExtra">
              <input
                value={jump} onChange={(e) => setJump(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doJump()}
                placeholder="Jump #" style={s.jump} inputMode="numeric"
              />
              <button style={s.jumpBtn} onClick={doJump}>Go</button>
            </div>
          )}
        </div>

        {/* Study options: hold-explanations (exam mode) + per-question timer + group poll */}
        {persist && (
          <div style={s.studyBar} className={examActive ? "examDim" : undefined}>
            {inPractice && (
              <>
                <button
                  className="mobExtra"
                  style={{ ...s.studyToggle, ...(examMode ? s.studyToggleOn : {}) }}
                  onClick={() => { setDeskFlash((f) => ({ dir: examMode ? "out" : "in", token: f.token + 1 })); setExamMode((v) => !v); setExamReview(false); }}
                  title="Focus mode — hides the clutter and holds every explanation until you finish the set"
                >
                  <ListChecks size={13} strokeWidth={2.3} /> Exam mode: {examMode ? "on" : "off"}
                </button>
                <button
                  className="mobExtra"
                  style={{ ...s.studyToggle, ...(timerOn ? s.studyToggleOn : {}) }}
                  onClick={() => setTimerOn((v) => !v)}
                  title="Countdown per question, like the real exam"
                >
                  <Clock size={13} strokeWidth={2.3} /> Timer: {timerOn ? "on" : "off"}
                </button>
                {timerOn && (
                  <span style={s.studySecs} className="mobExtra">
                    <input
                      value={secsDraft}
                      onChange={(e) => setSecsDraft(e.target.value.replace(/[^0-9]/g, ""))}
                      onBlur={commitSecs}
                      onKeyDown={(e) => e.key === "Enter" && commitSecs()}
                      style={s.secsInput}
                      inputMode="numeric"
                      title="Seconds per question (20–120)"
                    />
                    <span style={{ color: T.faint }}>sec/question (20–120)</span>
                  </span>
                )}
              </>
            )}
            <button
              className="mobExtra"
              style={s.studyToggle}
              onClick={() => { setHostFromTests(false); setTeamModePrompt(null); }}
              title="Run a live poll on a big screen — residents vote from their phones"
            >
              <Radio size={13} strokeWidth={2.3} /> Host poll
            </button>
            {/* Join poll stays visible on mobile — it's the main phone action
                during didactics (guests/QR links bypass it, but residents use it) */}
            <button
              style={s.studyToggle}
              onClick={() => { const c = window.prompt("Enter the poll code shown on the big screen:"); if (c && c.trim()) setJoinCode(c.trim().toUpperCase()); }}
              title="Join a poll from your phone"
            >
              <Users size={13} strokeWidth={2.3} /> Join poll
            </button>
            {timerOn && inPractice && timeLeft != null && !revealed && (
              <span className={timeLeft <= 10 ? "timerLow" : undefined} style={{ ...s.timerPill, ...(timeLeft <= 10 ? s.timerPillLow : {}) }}>
                <Clock size={12} strokeWidth={2.5} /> {fmtTime(timeLeft)}
              </span>
            )}
          </div>
        )}

        {examSetComplete && !examReview && (
          <div style={s.doneBanner} className="slidein">
            <span style={s.doneIcon}><Check size={15} strokeWidth={3} color="#fff" /></span>
            <span><b>Set complete — {examScore}/{set.length} correct.</b> Review every question with its explanation.</span>
            <button style={s.doneBtn} onClick={() => { setExamReview(true); setQi(0); }}><Layers size={13} strokeWidth={2.3} /> Review answers</button>
            <button style={{ ...s.doneBtn, background: "transparent" }} onClick={() => setReward(true)} title="Pick a little reward"><Flame size={13} strokeWidth={2.3} /> Reward</button>
          </div>
        )}

        {examReview && (
          <div style={s.reviewBar} className="slidein">
            <span><b style={{ color: "#e7eaf0" }}>Reviewing answers</b> · {examScore}/{set.length} correct — explanations now shown.</span>
            <button style={{ ...s.doneBtn, background: "transparent" }} onClick={() => setExamReview(false)}>Exit review</button>
          </div>
        )}

        {dayComplete && !examReview && (
          <div style={s.doneBanner} className="slidein">
            <span style={s.doneIcon}><Check size={15} strokeWidth={3} color="#fff" /></span>
            <span><b>That's your {target} for today.</b> Nice work — come back tomorrow for a fresh set.</span>
            <button style={s.doneBtn} onClick={() => { buildToday(true); setQi(0); }}><RotateCcw size={13} strokeWidth={2.3} /> Another set</button>
            <button style={{ ...s.doneBtn, background: "transparent" }} onClick={() => switchMode("browse")}>Browse all</button>
            <button style={{ ...s.doneBtn, background: "transparent" }} onClick={() => setReward(true)} title="Pick a little reward"><Flame size={13} strokeWidth={2.3} /> Reward</button>
          </div>
        )}

        {q ? (
        <>
        {/* Provenance line */}
        <div style={s.progressRow} className={examActive ? "examDim" : undefined}>
          <span style={s.qeyebrow}>{q.year} · Q{q.q_index} <span style={{ color: T.faint }}>(slide {q.slide_number})</span></span>
          {reviewMode && <span style={{ ...s.multiTag, color: T.teal, background: T.tealSoft }}><RotateCcw size={12} strokeWidth={2.2} /> Reviewing missed — try again</span>}
          {q.multi_select && <span style={s.multiTag}><ListChecks size={12} strokeWidth={2.2} /> Select all that apply</span>}
          {persist && (
            <button style={s.reportBtn} onClick={() => setShowReport(true)} title="Report a problem with this question">
              <Bug size={12} strokeWidth={2.2} /> Report a problem
            </button>
          )}
        </div>

        {/* Question card */}
        <section style={examActive ? { ...s.qcard, marginTop: 30, padding: "36px 38px 30px" } : s.qcard}>
          {q.figure_images.filter((p) => imgSrc(p)).length > 0 && (
            <div style={s.figRow}>
              {q.figure_images.filter((p) => imgSrc(p)).map((p, i) => (
                <img
                  key={i}
                  src={imgSrc(p)}
                  alt="question figure (click to enlarge)"
                  style={{ ...s.figImg, cursor: "zoom-in" }}
                  loading="lazy"
                  onClick={() => setZoomImg(imgSrc(p))}
                  title="Click to enlarge"
                />
              ))}
            </div>
          )}
          {/* keyed by question id so the stem + options replay their entrance
              cascade on every navigation (figures stay outside — remounting
              them would re-trigger image loads) */}
          <div key={qid} className="qIn">
          <HighlightableText
            text={q.stem}
            ranges={highlights.filter((h) => h.field === "stem")}
            editable={persist}
            onChange={updateHighlights}
            style={{ ...s.stem, marginBottom: 18, ...(examActive ? { fontSize: 23, lineHeight: 1.58 } : {}) }}
          />

          <div style={s.options}>
            {q.options.map((o, oi) => {
              const chosen = picked.includes(o.letter);
              const correct = showAnswer && correctSet.includes(o.letter);
              const wrongPick = showAnswer && chosen && !correctSet.includes(o.letter);
              const isCrossed = !showAnswer && crossed.includes(o.letter);
              const base: React.CSSProperties = { ...s.opt, ...(examActive ? { fontSize: 16.5, padding: "15px 17px" } : {}) };
              if (!showAnswer && chosen) Object.assign(base, s.optChosen);
              if (correct) Object.assign(base, s.optCorrect);
              if (wrongPick) Object.assign(base, s.optWrong);
              if (isCrossed) Object.assign(base, s.optCrossed);
              const total = stats?.attempts ?? 0;
              const cnt = stats?.distribution?.[o.letter] ?? 0;
              const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
              const showDist = showAnswer && stats && total > 0;
              return (
                <button
                  key={o.letter}
                  onClick={() => togglePick(o.letter)}
                  onContextMenu={(e) => { e.preventDefault(); if (!showAnswer) toggleCross(o.letter); }}
                  disabled={revealed}
                  style={base}
                  className={"opt" + (correct ? " pop" : "")}
                >
                  {showDist && (
                    <span
                      className="dist"
                      style={{
                        ...s.dist,
                        width: `${pct}%`,
                        animationDelay: `${oi * 70}ms`,
                        background: correct ? T.correctBg : wrongPick ? T.wrongBg : "#eef0f3",
                      }}
                    />
                  )}
                  <span style={{
                    ...s.optKey, position: "relative", zIndex: 1,
                    borderColor: correct ? T.correctLine : wrongPick ? T.wrongLine : (chosen && !showAnswer ? T.teal : T.paperEdge),
                    color: correct ? T.correctText : wrongPick ? T.wrongText : (chosen && !showAnswer ? T.teal : T.muted),
                  }}>{o.letter}</span>
                  <span style={{ ...s.optText, position: "relative", zIndex: 1, ...(isCrossed ? s.optTextCrossed : {}) }}>{o.text}</span>
                  {showAnswer && (
                    <span style={{ ...s.optRight, position: "relative", zIndex: 1 }}>
                      {showDist && <span style={{ ...s.optPct, color: correct ? T.correctText : wrongPick ? T.wrongText : T.faint }}>{pct}%</span>}
                      {correct && <Check size={16} strokeWidth={3} color={T.correctLine} />}
                      {wrongPick && <X size={16} strokeWidth={3} color={T.wrongLine} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          </div>

          {!revealed ? (
            <div style={s.actionRow}>
              <span style={s.actionHint}>
                {picked.length ? `Selected ${picked.slice().sort().join(", ")}` : (q.multi_select ? "Choose all that apply" : "Choose an answer")}
              </span>
              <button
                style={{ ...s.primary, opacity: picked.length ? 1 : 0.45, cursor: picked.length ? "pointer" : "not-allowed" }}
                onClick={submit}
              >
                {examActive ? "Lock in" : "Submit"}{q.multi_select && picked.length ? ` (${picked.length})` : ""}
              </button>
            </div>
          ) : examActive ? (
            <div style={s.lockedRow}>
              <span style={s.lockedIcon}><Check size={14} strokeWidth={3} color="#fff" /></span>
              <span style={{ fontWeight: 600, color: "#e7eaf0" }}>
                Answer locked{picked.length ? `: ${picked.slice().sort().join(", ")}` : " — no answer"}
              </span>
              <span style={s.lockedHint}>Explanations are held until you finish the set.</span>
              {qi < set.length - 1 && (
                <button style={s.doneBtn} onClick={() => go(1)}>Next <ArrowRight size={13} strokeWidth={2.3} /></button>
              )}
            </div>
          ) : (
            <div style={{ ...s.verdict, position: "relative", background: isCorrect ? T.correctBg : T.wrongBg, borderColor: isCorrect ? T.correctLine : T.wrongLine }} className="slidein">
              {isCorrect && (
                <span style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }} aria-hidden>
                  {Array.from({ length: 12 }, (_, i) => (
                    <span
                      key={i}
                      className="confetti"
                      style={{
                        "--dx": `${Math.round(Math.cos((i / 12) * Math.PI * 2) * (46 + (i % 3) * 22))}px`,
                        "--dy": `${Math.round(Math.sin((i / 12) * Math.PI * 2) * (30 + (i % 4) * 14)) - 34}px`,
                        "--rot": `${(i % 2 ? 1 : -1) * (140 + i * 25)}deg`,
                        background: [T.teal, T.gold, "#e07a5f", T.correctLine][i % 4],
                        animationDelay: `${(i % 4) * 40}ms`,
                      } as React.CSSProperties}
                    />
                  ))}
                </span>
              )}
              <span style={{ ...s.verdictIcon, background: isCorrect ? T.correctLine : T.wrongLine }}>
                {isCorrect ? <Check size={15} strokeWidth={3} color="#fff" /> : <X size={15} strokeWidth={3} color="#fff" />}
              </span>
              <span style={{ color: isCorrect ? T.correctText : T.wrongText, fontWeight: 600 }}>
                {isCorrect ? "Correct" : "Not quite"}
              </span>
              <span style={s.verdictMeta}>
                Answer: <b style={{ color: T.text }}>{correctSet.join(", ")}</b>
                {q.answer_text ? ` — ${q.answer_text}` : ""}
                {stats && stats.attempts > 0 && (
                  <> · {stats.attempts} {stats.attempts === 1 ? "resident has" : "residents have"} answered · <b style={{ color: T.text }}>{stats.pct_correct}%</b> got it right</>
                )}
              </span>
            </div>
          )}
        </section>

        {/* Ask AI — hidden in exam mode, where answers are held until review */}
        {!examActive && (
          <div style={s.askWrap}>
            <button style={{ ...s.askToggle, ...(askOpen ? s.askToggleOn : {}) }} onClick={() => setAskOpen((o) => !o)} title="Ask an AI to explain this question">
              <Sparkles size={14} strokeWidth={2.3} /> Ask AI <span style={{ opacity: 0.7 }}>{askOpen ? "▴" : "▾"}</span>
            </button>
            {!revealed && (
              <button
                style={s.noClueBtn}
                onClick={() => { finalize(true); openBgTab(AI_TARGETS[0].url(askAiNoClue(q, true))); }}
                title="Reveal the answer now and open an AI explainer in a background tab"
              >
                🤷 I have no clue <ExternalLink size={12} strokeWidth={2.2} />
              </button>
            )}
            {askOpen && (
              <div style={s.askPanel} className="fade">
                <div style={s.askRow}>
                  <span style={s.askLabel}>How</span>
                  {AI_STYLES.map(([v, lbl]) => (
                    <button key={v} style={{ ...s.askChip, ...(askStyle === v && !askText.trim() ? s.askChipOn : {}) }}
                      onClick={() => { setAskStyle(v); setAskText(""); }}>{lbl}</button>
                  ))}
                </div>
                <div style={s.askRow}>
                  <span style={s.askLabel}>Or ask</span>
                  <input
                    style={s.askInput}
                    value={askText}
                    onChange={(e) => setAskText(e.target.value)}
                    placeholder="Type your own question about this — the question is attached automatically"
                  />
                </div>
                <div style={s.askRow}>
                  <span style={s.askLabel}>Open in</span>
                  {AI_TARGETS.map((t) => (
                    <button key={t.key} style={s.askGo}
                      onClick={() => window.open(
                        t.url(askText.trim() ? askAiCustom(q, askText, showAnswer) : askAiPrompt(q, askStyle, showAnswer)),
                        "_blank", "noopener,noreferrer")}>
                      {t.label} <ExternalLink size={12} strokeWidth={2.2} />
                    </button>
                  ))}
                </div>
                <p style={s.askNote}>
                  {askText.trim() ? "Opens the AI with your question and this question attached as reference." : "Opens the AI in a new tab with this question pre-filled"}
                  {!askText.trim() && (showAnswer ? "." : " (answer hidden until you reveal it).")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        {showAnswer && (
          <section style={s.below}>
            <nav style={s.tabs}>
              {tabs.map(([id, label, icon]) => (
                <button
                  key={id}
                  ref={(el) => (tabRefs.current[id] = el)}
                  onClick={() => setTab(id)}
                  style={{ ...s.tab, ...(tab === id ? s.tabActive : {}) }}
                  className="tab"
                >
                  {icon}{label}
                  {id === "group" && groupNotes.length > 0 && <span style={s.tabCount}>{groupNotes.length}</span>}
                </button>
              ))}
              <span className="tabInd" style={{ ...s.tabInd, left: ind.left, width: ind.width, top: ind.top }} />
            </nav>

            <div style={s.panel}>
              {tab === "explanation" && (
                <div className="fade">
                  {q.explanation_text && <p style={s.expl}>{q.explanation_text}</p>}
                  {q.explanation_images.filter((p) => imgSrc(p)).map((p, i) => (
                    <img
                      key={i}
                      src={imgSrc(p)}
                      alt="explanation (click to enlarge)"
                      style={{ ...s.explImg, cursor: "zoom-in" }}
                      loading="lazy"
                      onClick={() => setZoomImg(imgSrc(p))}
                      title="Click to enlarge"
                    />
                  ))}
                  {!hasExpl && (
                    <div style={s.emptyExpl}>
                      <ImageIcon size={18} strokeWidth={1.8} color={T.faint} />
                      <span>No explanation slide for this question in the {q.year} deck.</span>
                    </div>
                  )}
                </div>
              )}

              {tab === "practice" && (
                <div className="fade">
                  {q.clinical_application ? (
                    <>
                      <label style={s.lbl}>How a resident would use this — an example scenario</label>
                      <p style={s.expl}>{q.clinical_application}</p>
                    </>
                  ) : (
                    <div style={s.emptyExpl}>
                      <Stethoscope size={18} strokeWidth={1.8} color={T.faint} />
                      <span>No clinical scenario yet for this question.</span>
                    </div>
                  )}
                </div>
              )}

              {tab === "context" && (
                <div className="fade">
                  <label style={s.lbl}><Lightbulb size={13} strokeWidth={2.2} /> Historical &amp; memorable context — the story behind the answer</label>
                  {context === null ? (
                    <p style={s.expl}>Loading…</p>
                  ) : context ? (
                    <p style={s.expl}>{context}</p>
                  ) : (
                    <div style={s.emptyExpl}>
                      <Lightbulb size={18} strokeWidth={1.8} color={T.faint} />
                      <span>No context written for this question yet.</span>
                    </div>
                  )}
                </div>
              )}

              {tab === "video" && (
                <div className="fade">
                  <label style={s.lbl}>Related videos · opens a YouTube search in a new tab</label>
                  <a
                    style={s.videoLink}
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                      q.video_query || `${q.answer_text || ""} psychiatry`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Youtube size={18} strokeWidth={2} />
                    <span style={{ flex: 1 }}>
                      Search YouTube for: <b>{q.video_query || `${q.answer_text || "this topic"} psychiatry`}</b>
                    </span>
                    <ExternalLink size={15} strokeWidth={2} />
                  </a>
                  <p style={s.videoNote}>
                    We surface a focused search rather than a single embed so the link never breaks. Faculty can pin a
                    specific video here later.
                  </p>
                </div>
              )}

              {tab === "diagram" && (
                <div className="fade">
                  {q.diagram?.code && (
                    <div style={{ marginBottom: q.comparison_table ? 22 : 0 }}>
                      <label style={s.lbl}>Concept diagram</label>
                      <div style={s.diagramBox}>
                        <MermaidDiagram code={q.diagram.code} />
                      </div>
                      {q.diagram.caption && <p style={s.diagramCaption}>{q.diagram.caption}</p>}
                    </div>
                  )}
                  {q.comparison_table && q.comparison_table.rows?.length > 0 && (
                    <div>
                      {q.comparison_table.title && <label style={s.lbl}>{q.comparison_table.title}</label>}
                      <div style={{ overflowX: "auto" }}>
                        <table style={s.cmpTable}>
                          <thead>
                            <tr>
                              {q.comparison_table.headers.map((h, i) => (
                                <th key={i} style={s.cmpTh}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {q.comparison_table.rows.map((row, ri) => (
                              <tr key={ri}>
                                {row.map((cell, ci) => (
                                  <td key={ci} style={s.cmpTd}>{cell}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "mine" && (
                <div className="fade">
                  <label style={s.lbl}>Private to you · saved to your account</label>
                  <textarea
                    value={myNote} onChange={(e) => setMyNote(e.target.value)}
                    onBlur={saveNoteNow}
                    placeholder="Jot your own reasoning, a mnemonic, where you went wrong…"
                    style={s.textarea}
                  />
                  <div style={s.saveRow}>
                    <span style={{ ...s.savedDot, opacity: myNote ? 1 : 0.3 }} />
                    <span style={s.savedTxt}>{persist ? "Saved when you click away" : "Sign in to save"}</span>
                    <button style={s.ghost} onClick={doExportMine}>
                      <Download size={13} strokeWidth={2.2} /> Export my notes
                    </button>
                  </div>
                </div>
              )}

              {tab === "group" && (
                <div className="fade">
                  <div style={s.threadHead}>
                    <label style={s.lbl}>Shared with your class · attributed</label>
                    <button style={s.ghost} onClick={doExportGroup}>
                      <Download size={13} strokeWidth={2.2} /> Export group notes
                    </button>
                  </div>
                  <div style={s.thread}>
                    {groupNotes.map((n) => {
                      const name = n.author?.full_name || n.author?.email || "Member";
                      const role = n.author?.role ?? "";
                      const canDelete = isAdmin || n.author_id === session?.user.id;
                      return (
                        <div key={n.id} style={s.note}>
                          <span style={{ ...s.avatar, background: role === "faculty" || role === "admin" ? T.tealDeep : T.inkSoft }}>{initials(name)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={s.noteMeta}>
                              <b style={s.noteAuthor}>{name}</b>
                              {role && <span style={s.roleTag}>{role}</span>}
                              <span style={s.noteTime}>{ago(n.created_at)}</span>
                              {canDelete && (
                                <button style={s.del} title="Remove" onClick={() => removeGroupNote(n.id)}>
                                  <Trash2 size={13} strokeWidth={2} />
                                </button>
                              )}
                            </div>
                            <p style={s.noteText}>{n.text}</p>
                          </div>
                        </div>
                      );
                    })}
                    {!groupNotes.length && <p style={s.emptyNote}>No class notes on this question yet.</p>}
                  </div>
                  <div style={s.addRow}>
                    <span style={{ ...s.avatar, background: T.teal }}>{(displayName[0] || "?").toUpperCase()}</span>
                    <input
                      value={draft} onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") postGroupNote(); }}
                      placeholder="Add a note for the class…" style={s.addInput}
                    />
                    <button style={{ ...s.primarySm, opacity: draft.trim() ? 1 : 0.45 }} onClick={postGroupNote}>Post</button>
                  </div>
                </div>
              )}

              {tab === "flash" && (
                <div className="fade">
                  {!card && !editCard && (
                    <div style={s.flashEmpty}>
                      <Sparkles size={20} strokeWidth={1.9} color={T.teal} />
                      <p style={{ margin: "8px 0 14px", color: T.muted, fontSize: 14, lineHeight: 1.5 }}>
                        Turn this question into an Anki cloze card. Generated once by AI, then cached for the whole class.
                      </p>
                      <button style={{ ...s.primarySm, opacity: cardBusy ? 0.5 : 1 }} disabled={cardBusy} onClick={() => doGenerateCard(false)}>
                        <Sparkles size={14} strokeWidth={2.2} /> {cardBusy ? "Generating…" : "Generate flashcard"}
                      </button>
                    </div>
                  )}

                  {card && !editCard && (
                    <>
                      <div style={s.cardChrome}>
                        <div style={s.cardChromeHead}>
                          <span style={s.cardType}>Cloze</span>
                          <span style={s.cardCached}><Sparkles size={12} strokeWidth={2.2} /> cached for the class</span>
                          {isAdmin && (
                            <button style={s.tinyBtn} onClick={() => setEditCard({ cloze: card.cloze_text, extra: card.extra })}>
                              <Pencil size={12} strokeWidth={2.2} /> Refine
                            </button>
                          )}
                        </div>
                        <span style={s.fieldLbl}>Text</span>
                        <code style={s.clozeRaw}>{renderClozeRaw(card.cloze_text)}</code>
                        <div style={s.clozePreview}>{renderClozePreview(card.cloze_text)}</div>
                        <span style={{ ...s.fieldLbl, marginTop: 14 }}>Extra <span style={{ color: T.faint, fontWeight: 500 }}>· shown under the answer</span></span>
                        <div style={s.extra}><p style={{ ...s.extraLine, marginBottom: 0 }}>{card.extra}</p></div>
                      </div>
                      <div style={s.flashActions}>
                        <button style={s.primarySm} onClick={doDownloadCard}><Download size={14} strokeWidth={2.2} /> Download for Anki</button>
                        {isAdmin && <button style={s.ghost} onClick={() => doGenerateCard(true)} disabled={cardBusy}><RotateCcw size={13} strokeWidth={2.2} /> Regenerate</button>}
                        <span style={s.flashNote}>Imports as a Cloze note · Extra carries the Q&A</span>
                      </div>
                    </>
                  )}

                  {editCard && (
                    <div style={s.cardChrome}>
                      <span style={s.fieldLbl}>Text (cloze)</span>
                      <textarea value={editCard.cloze} onChange={(e) => setEditCard({ ...editCard, cloze: e.target.value })} style={s.clozeEdit} />
                      <span style={{ ...s.fieldLbl, marginTop: 12 }}>Extra</span>
                      <textarea value={editCard.extra} onChange={(e) => setEditCard({ ...editCard, extra: e.target.value })} style={{ ...s.clozeEdit, minHeight: 80, fontFamily: "inherit" }} />
                      <div style={{ ...s.flashActions, marginTop: 12 }}>
                        <button style={s.primarySm} onClick={doSaveCard}><Check size={14} strokeWidth={2.4} /> Save canonical</button>
                        <button style={s.ghost} onClick={() => setEditCard(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={s.nextRow}>
              <button style={s.next} onClick={() => go(1)}>
                Next question <ArrowRight size={16} strokeWidth={2.4} />
              </button>
            </div>
          </section>
        )}
        </>
        ) : (
          <div style={{ display: "grid", placeItems: "center", padding: "36px 0 20px" }}>
            <div style={s.caughtCard} className="rise">
              <div style={{ fontSize: 34, marginBottom: 4 }}>🎉</div>
              <p style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: "0 0 6px" }}>You’re all caught up</p>
              <p style={{ fontSize: 14, color: T.muted, margin: "0 0 18px", lineHeight: 1.5 }}>
                Nothing due today. Feeling it? Add more just for today — your daily goal stays the same.
              </p>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14, flexWrap: "wrap" }}>
                {[10, 20, 30].map((n) => (
                  <button
                    key={n}
                    style={{ background: T.teal, color: "#fff", border: "none", borderRadius: 10, padding: "11px 18px", fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}
                    onClick={() => { buildToday(true, n); setQi(0); }}
                    title={`Do ${n} more questions today (doesn't change your daily goal)`}
                  >
                    +{n} more
                  </button>
                ))}
              </div>
              <button
                style={{ background: "transparent", border: "none", color: T.faint, fontSize: 13.5, cursor: "pointer", textDecoration: "underline" }}
                onClick={() => { setMode("browse"); setQi(0); }}
              >
                Browse all questions instead
              </button>
            </div>
          </div>
        )}

        <footer style={s.disclaimer}>
          AI-assisted explanations, flashcards, context, and diagrams can be wrong.
          Always verify against primary sources and your own clinical judgment.
          {persist && (
            <div style={s.hlHint}>
              <Highlighter size={12} strokeWidth={2.2} /> Select text to highlight · tap a highlight to remove · right-click a choice to cross it out
            </div>
          )}
          {persist && (
            <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              <button style={s.siteReportBtn} onClick={() => setShowSiteReport(true)}>
                <Bug size={12} strokeWidth={2.2} /> Report a problem with the site
              </button>
              {/* kept behind sign-in on purpose: the decks contain the original
                  question text, which is access-gated everywhere else */}
              <a
                href="https://drive.google.com/drive/folders/13KyeuvPXcPqNuHQav7lV-xHxDe7oQ5y9?usp=sharing"
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...s.siteReportBtn, textDecoration: "none" }}
                title="The original PRITE review slide decks these questions came from"
              >
                <ExternalLink size={12} strokeWidth={2.2} /> Original slide decks
              </a>
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <a href="https://quizapine.com" target="_blank" rel="noopener noreferrer" style={s.quizapineAd} title="More practice questions at Quizapine">
              <span style={s.quizapineBadge}><Share2 size={10} strokeWidth={2.6} color="#fff" /></span>
              Need more questions? Try <span style={s.quizapineWordmark}>Quiz</span>apine
            </a>
          </div>
        </footer>
      </main>

      {reminderPromptStage && (
        <div style={s.scrim} onClick={dismissReminderPrompt}>
          <div style={{ ...s.apPanel, maxWidth: 380 }} onClick={(e) => e.stopPropagation()} className="rise">
            <div style={{ padding: "28px 26px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📬</div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8, color: T.text }}>Want a daily nudge?</div>
              <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.5, margin: "0 0 22px" }}>
                {reminderPromptStage === 1 && "You've come back for a second day — nice. Want PRITE Daily to email you a quick reminder each morning so you don't lose momentum?"}
                {reminderPromptStage === 2 && "You've been at this for 2 weeks now. A daily reminder email can help keep the habit going through exam season."}
                {reminderPromptStage === 3 && "Last nudge about this, promise — want a daily reminder email? You can always turn it on later in Settings."}
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button style={{ ...s.ghost, marginLeft: 0 }} onClick={dismissReminderPrompt}>Not now</button>
                <button style={s.primarySm} onClick={acceptReminderPrompt}><Check size={14} strokeWidth={2.4} /> Yes, email me daily</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {aiDisclaimerStage && (
        <div style={s.scrim} onClick={dismissAiDisclaimer}>
          <div style={{ ...s.apPanel, maxWidth: 420 }} onClick={(e) => e.stopPropagation()} className="rise">
            <div style={{ padding: "28px 26px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🤖</div>
              <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8, color: T.text }}>A quick note on explanations</div>
              <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.5, margin: "0 0 14px", textAlign: "left" }}>
                {aiDisclaimerStage === 1 ? (
                  <>Every question here is a <b style={{ color: T.text }}>real, verified PRITE exam question</b>. The explanation underneath each one, though, is <b style={{ color: T.text }}>AI-generated</b> — usually solid, but not infallible. If an explanation makes a claim that feels surprising or controversial, it's worth double-checking before taking it as gospel.</>
                ) : (
                  <>Just a reminder: the questions themselves are real, but the explanations are still AI-written and can occasionally be wrong — especially on more nuanced or controversial points. Keep that critical eye up.</>
                )}
              </p>
              <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.5, margin: "0 0 22px", textAlign: "left" }}>
                Spot a mistake? Please report it — bugs get reviewed and fixed very regularly. And if there's a feature you'd love to see, suggest that too — the goal is to make this a genuinely great study platform for the whole residency going forward.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button style={{ ...s.ghost, marginLeft: 0 }} onClick={dismissAiDisclaimer}>Got it</button>
                <button style={s.primarySm} onClick={reportFromAiDisclaimer}><Bug size={14} strokeWidth={2.4} /> Report a bug / suggest a feature</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showApprovals && isAdmin && (
        <Approvals
          profiles={profiles}
          onClose={() => setShowApprovals(false)}
          onAct={actOnProfile}
          onRefresh={() => listProfiles().then(setProfiles)}
          currentUserId={profile?.id}
        />
      )}

      {showReport && (
        <ReportModal
          qid={qid}
          label={`${q.year} · Q${q.q_index}`}
          onClose={() => setShowReport(false)}
          onDone={(ok) => { setShowReport(false); fire(ok ? "Thanks — report sent" : "Couldn't send report"); }}
        />
      )}

      {showSiteReport && (
        <ReportModal
          qid={null}
          label="The website"
          kinds={SITE_KINDS}
          onClose={() => setShowSiteReport(false)}
          onDone={(ok) => { setShowSiteReport(false); fire(ok ? "Thanks — report sent" : "Couldn't send report"); }}
        />
      )}

      {showBugs && (
        <BugReportsPanel reports={bugs} byId={byId} isAdmin={isAdmin} onAct={actOnBug} onReply={replyToBug} onClose={() => setShowBugs(false)} />
      )}

      {/* Motivation reward — a random saved reel as a treat for finishing a set */}
      {reward && (
        <RewardSheet onClose={() => setReward(false)} onBird={() => { setReward(false); setBirdOn(true); }} />
      )}
      {birdOn && <BirdFlight onDone={() => setBirdOn(false)} />}

      {showOfficialResults && isAdmin && (
        <OfficialResultsPanel
          results={officialResults}
          onClose={() => setShowOfficialResults(false)}
          onCleared={() => listOfficialPollResults().then(setOfficialResults)}
          onEditTeams={() => setShowTeamEditor(true)}
        />
      )}

      {showCapite && <CapiteComingSoon onClose={closeCapite} />}

      {showBoard && (
        <ImmersiveScene
          sceneKey="summit"
          backdropZ={79}
          closing={boardClosing}
          onExited={() => { setShowBoard(false); setBoardClosing(false); }}
        >
          <Leaderboard rows={leaders} meId={session?.user.id} onClose={() => setBoardClosing(true)} bareScrim />
        </ImmersiveScene>
      )}

      {showStats && <Stats answers={answers} byId={byId} displayName={displayName} onClose={() => setShowStats(false)} />}

      {showInsights && <Insights onClose={() => setShowInsights(false)} />}

      {showDeck && all && (
        <DeckBuilder
          all={all} byId={byId} fire={fire}
          onClose={() => setShowDeck(false)}
          onOpen={(qid) => {
            const idx = all.findIndex((qq) => questionId(qq.year, qq.q_index) === qid);
            if (idx >= 0) { setMode("browse"); setYear("all"); setQi(idx); setShowDeck(false); }
          }}
          onStudy={startCustom}
          onSaveTest={async (qids) => {
            const name = window.prompt(`Name this test (${qids.length} questions):`);
            if (!name?.trim()) return;
            const saved = await saveTest(name, qids);
            if (!saved) { fire("Couldn't save test — try signing in again"); return; }
            setSavedTests(await loadTests());
            setShowDeck(false);
            fire(`Saved "${name.trim()}" — find it under Tests`);
          }}
        />
      )}

      {showTests && (
        <TestsPanel
          tests={savedTests}
          byId={byId}
          onClose={() => setShowTests(false)}
          onStudy={(t) => {
            const qs = t.qids.map((id) => byId.get(id)).filter(Boolean) as RawQuestion[];
            if (!qs.length) { fire("None of this test's questions are in the current bank"); return; }
            startCustom(qs, t.name);
            setShowTests(false);
          }}
          onHost={(t) => {
            const qs = t.qids.map((id) => byId.get(id)).filter(Boolean) as RawQuestion[];
            if (!qs.length) { fire("None of this test's questions are in the current bank"); return; }
            setTeamModePrompt(qs);
            setHostFromTests(true);
            setShowTests(false);
          }}
          onPptx={async (t) => {
            const qs = t.qids.map((id) => byId.get(id)).filter(Boolean) as RawQuestion[];
            if (!qs.length) { fire("None of this test's questions are in the current bank"); return; }
            try {
              await exportPptx(qs, `${t.name.replace(/[^\w\- ]+/g, "").trim() || "prite-test"}.pptx`);
              fire(`Built "${t.name}" as PowerPoint`);
            } catch (e) { fire("PowerPoint export failed"); console.warn(e); }
          }}
          onRename={async (t) => {
            const name = window.prompt("New name:", t.name);
            if (!name?.trim()) return;
            await renameTest(t.id, name);
            setSavedTests(await loadTests());
          }}
          onDelete={async (t) => {
            if (!window.confirm(`Delete "${t.name}"? This can't be undone.`)) return;
            await deleteTest(t.id);
            setSavedTests(await loadTests());
          }}
          guidesByTest={guidesByTest}
          onStudyGuide={(t) => setGuideCreateFor({ test: t, force: guidesByTest[t.id]?.status === "generating" })}
          onOpenGuide={(t, guide) => setGuideToShare({ guide, test: t })}
          canGenerate={canGenGuides}
          onSlides={(t) => {
            const guide = guidesByTest[t.id];
            if ((guide?.slides?.length ?? 0) > 0) downloadTeachingDeck(t, guide); // already written — just build the file
            else buildStudyGuide(t, false, null, true);
          }}
        />
      )}

      {guideCreateFor && (
        <StudyGuideCreateModal
          test={guideCreateFor.test}
          existingDate={guidesByTest[guideCreateFor.test.id]?.session_date ?? null}
          onClose={() => setGuideCreateFor(null)}
          onConfirm={(sessionDate) => {
            const { test, force } = guideCreateFor;
            setGuideCreateFor(null);
            buildStudyGuide(test, force, sessionDate);
          }}
        />
      )}

      {guideToShare && (
        <StudyGuideShareModal
          guide={guidesByTest[guideToShare.test.id] ?? guideToShare.guide}
          onClose={() => setGuideToShare(null)}
          onRegenerate={() => { setGuideToShare(null); setGuideCreateFor({ test: guideToShare.test, force: true }); }}
          onAddAudio={() => {
            const g = guidesByTest[guideToShare.test.id] ?? guideToShare.guide;
            setGuideToShare(null);
            buildStudyGuide(guideToShare.test, false, g.session_date ?? null); // non-force full request → edge function narrates the stored script only
          }}
        />
      )}

      {openStudyGuideId && (
        <StudyGuideView id={openStudyGuideId} onClose={() => setOpenStudyGuideId(null)} />
      )}

      {showGuideLibrary && (
        <StudyGuideLibraryPanel
          guides={libraryGuides}
          onClose={() => setShowGuideLibrary(false)}
          onOpen={(id) => { setShowGuideLibrary(false); setOpenStudyGuideId(id); }}
        />
      )}

      {showSettings && settings && (
        <SettingsPanel
          settings={settings}
          onChange={saveSettingsNow}
          onRebuild={() => { buildToday(); setQi(0); }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showMissed && (
        <MissedPanel
          missedIds={missedIds}
          byId={byId}
          answers={answers}
          notes={allMyNotes}
          onReview={() => { startReview(); setShowMissed(false); }}
          onExport={doExportMissed}
          onClear={clearMissed}
          onClose={() => setShowMissed(false)}
        />
      )}

      <ImmersiveFlash sceneKey="desk" dir={deskFlash.dir} token={deskFlash.token} />

      {showSrs && (
        <ImmersiveScene
          sceneKey="observatory"
          backdropZ={79}
          closing={srsClosing}
          onExited={() => { setShowSrs(false); setSrsClosing(false); }}
        >
          <ReviewPanel
            due={srsDue}
            byId={byId}
            onGrade={onGradeSrs}
            onClose={() => setSrsClosing(true)}
            bareScrim
          />
        </ImmersiveScene>
      )}

      {zoomImg && (
        <div style={{ ...s.scrim, cursor: "zoom-out" }} onClick={() => setZoomImg(null)}>
          <img src={zoomImg} alt="Enlarged" style={{ ...s.zoomImg, cursor: "zoom-out" }} />
          <button
            style={{ ...s.close, position: "absolute", top: 18, right: 18 }}
            onClick={() => setZoomImg(null)}
            title="Close"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>
      )}

      {teamModePrompt !== false && (
        <TeamModeModal
          onChoose={startHosting}
          onClose={() => { setTeamModePrompt(false); if (hostFromTests) { setShowTests(true); setHostFromTests(false); } }}
          isAdmin={isAdmin}
          stableCount={Object.keys(stableTeams).length}
          onGenerate={runGenerateStableTeams}
          onEditRosters={() => setShowTeamEditor(true)}
          weeklyCount={Object.keys(weeklyTeams).length}
          weeklyGeneratedAt={weeklyGeneratedAt}
          weeklyGeneratedBy={weeklyGeneratedBy}
          onGenerateWeekly={runGenerateWeeklyTeams}
          onCopyWeekly={weeklyPairingsText}
          onCopyStable={stableRosterText}
        />
      )}
      {showTeamEditor && (
        <TeamRosterEditor
          onClose={async () => { setShowTeamEditor(false); setStableTeams(await getStableTeams()); }}
        />
      )}
      {hostCode && (
        <ImmersiveScene
          sceneKey="arena"
          showBackdrop={false}
          closing={hostClosing}
          onExited={() => { setHostCode(null); setHostSet(null); setHostClosing(false); if (hostFromTests) { setShowTests(true); setHostFromTests(false); } }}
        >
          <PollPresenter code={hostCode} set={hostSet ?? set} startIndex={hostSet ? 0 : qi} timerSecs={timerSecs} onTimerSecsChange={setTimerSecs} teamMode={teamMode} onClose={() => setHostClosing(true)} />
        </ImmersiveScene>
      )}
      <canvas ref={confettiRef} style={s.confetti} />

      {streakReward?.kind === "login" && <Balloons />}

      {streakReward && (
        <div style={s.streakWrap}>
          <div
            style={{ ...s.streakCard, ...(streakReward.level >= 4 ? s.streakCardEpic : {}) }}
            className={"streakPop" + (streakReward.level >= 4 ? " streakGlow" : "")}
          >
            <span style={{ ...s.streakIcon, ...(streakReward.level >= 4 ? s.streakIconEpic : {}) }}>
              {streakReward.level >= 5 ? <Crown size={22} strokeWidth={2.2} color="#fff" />
                : streakReward.level >= 3 ? <Zap size={22} strokeWidth={2.4} color="#fff" />
                : <Flame size={22} strokeWidth={2.4} color="#fff" />}
            </span>
            <div>
              <div style={s.streakBig}>
                {streakReward.streak}-day {streakReward.kind === "login" ? "login" : "daily"} streak!
              </div>
              <div style={s.streakSub}>{streakMessage(streakReward.kind, streakReward.streak)}</div>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={s.toast} className="toast">{toast}</div>}
    </div>
  );
}

// Asked the instant "Host poll" is clicked, before the room code is even
// generated — how should teams be formed for this session?
function TeamModeModal({ onChoose, onClose, isAdmin, stableCount, onGenerate, onEditRosters, weeklyCount, weeklyGeneratedAt, weeklyGeneratedBy, onGenerateWeekly, onCopyWeekly, onCopyStable }: {
  onChoose: (mode: TeamMode) => void; onClose: () => void;
  isAdmin: boolean; stableCount: number; onGenerate: () => Promise<boolean>;
  onEditRosters: () => void;
  weeklyCount: number; weeklyGeneratedAt: string | null; weeklyGeneratedBy: string | null;
  onGenerateWeekly: () => Promise<string | null>; onCopyWeekly: () => Promise<string | null>;
  onCopyStable: () => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [weeklyBusy, setWeeklyBusy] = useState(false);
  const [pairingsCopied, setPairingsCopied] = useState(false);
  const [pairingsText, setPairingsText] = useState<string | null>(null); // revealed roster (also the copy source)
  const [pairingsErr, setPairingsErr] = useState<string | null>(null);
  const pairingsRef = useRef<HTMLTextAreaElement | null>(null);
  const [rosterCopied, setRosterCopied] = useState(false);
  const [rosterText, setRosterText] = useState<string | null>(null); // revealed season roster (also the copy source)
  const [rosterErr, setRosterErr] = useState<string | null>(null);
  const rosterRef = useRef<HTMLTextAreaElement | null>(null);
  const hasStable = stableCount > 0;
  const stableDisabled = !hasStable && !isAdmin;
  const hasWeekly = weeklyCount > 0;
  // randomizing/re-rolling costs everyone their assignment mid-week, so it's
  // admin-only; picking the mode to host with is open to anyone once it exists
  const weeklyDisabled = !hasWeekly && !isAdmin;

  const [weeklyErr, setWeeklyErr] = useState<string | null>(null);
  const chooseWeekly = async () => {
    if (busy || weeklyBusy || weeklyDisabled) return;
    if (hasWeekly) { onChoose("weekly"); return; }
    setWeeklyBusy(true); setWeeklyErr(null);
    const err = await onGenerateWeekly();
    setWeeklyBusy(false);
    if (err) setWeeklyErr(err); else onChoose("weekly");
  };
  const rerollWeekly = async () => {
    if (weeklyBusy) return;
    if (hasWeekly && !window.confirm("Randomize new pairings for the new week?\n\nEveryone's current team assignment is replaced — if the current list was already emailed out to residents, that email will no longer match. You'll want to send an updated list.")) return;
    setWeeklyBusy(true); setWeeklyErr(null);
    const err = await onGenerateWeekly();
    // If the pairings list is already revealed below, swap in the new teams
    // right away instead of leaving last week's roster on screen.
    if (!err && pairingsText) {
      try { setPairingsText((await onCopyWeekly()) ?? ""); setPairingsCopied(false); }
      catch { /* leave the old text; Copy button still refetches */ }
    }
    setWeeklyBusy(false);
    setWeeklyErr(err);
  };
  // Best-effort copy that survives loss of user-activation: try the async
  // Clipboard API, then fall back to a temporary textarea + execCommand
  // (works from more contexts, incl. after an await). Returns whether either
  // path reported success.
  const copyText = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch { /* fall through to execCommand */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  };

  // Reveal the roster first (so it's always visible even if the clipboard is
  // blocked), THEN attempt the copy. The visible textarea doubles as the
  // manual-copy fallback and the source for the in-panel Copy button.
  const revealPairings = async () => {
    setPairingsErr(null);
    let text: string | null = null;
    try { text = await onCopyWeekly(); }
    catch (e) { setPairingsErr("Couldn't build the pairings list: " + (e instanceof Error ? e.message : String(e))); return; }
    if (!text) { setPairingsErr("No pairings to copy yet — randomize this week's pairings first."); return; }
    setPairingsText(text);
    const ok = await copyText(text);
    if (ok) { setPairingsCopied(true); setTimeout(() => setPairingsCopied(false), 1800); }
  };

  // Copy from the already-revealed text on a fresh click — no await before
  // writeText, so user-activation is intact and the Clipboard API works.
  const copyRevealed = async () => {
    if (!pairingsText) return;
    const ok = await copyText(pairingsText);
    if (ok) { setPairingsCopied(true); setTimeout(() => setPairingsCopied(false), 1800); }
    else if (pairingsRef.current) { pairingsRef.current.focus(); pairingsRef.current.select(); }
  };

  // Same reveal-then-copy flow for the season-long (stable) roster.
  const revealRoster = async () => {
    setRosterErr(null);
    let text: string | null = null;
    try { text = await onCopyStable(); }
    catch (e) { setRosterErr("Couldn't build the roster list: " + (e instanceof Error ? e.message : String(e))); return; }
    if (!text) { setRosterErr("No season rosters to copy yet — generate them first."); return; }
    setRosterText(text);
    const ok = await copyText(text);
    if (ok) { setRosterCopied(true); setTimeout(() => setRosterCopied(false), 1800); }
  };
  const copyRosterRevealed = async () => {
    if (!rosterText) return;
    const ok = await copyText(rosterText);
    if (ok) { setRosterCopied(true); setTimeout(() => setRosterCopied(false), 1800); }
    else if (rosterRef.current) { rosterRef.current.focus(); rosterRef.current.select(); }
  };

  const chooseStable = async () => {
    if (busy || stableDisabled) return;
    if (hasStable) { onChoose("stable"); return; }
    setBusy(true);
    const ok = await onGenerate();
    setBusy(false);
    if (ok) onChoose("stable");
  };
  const regenerate = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await onGenerate();
    setBusy(false);
    if (ok) onChoose("stable");
  };

  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 460 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Host poll</div>
            <div style={s.apTitle}>How should teams be formed?</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={{ padding: "4px 22px 22px", display: "flex", flexDirection: "column", gap: 10, flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
          <button style={s.teamModeOpt} onClick={() => onChoose("individual")}>
            <User size={18} strokeWidth={2.2} />
            <span>
              <b style={{ display: "block", color: T.text }}>Individual — no teams</b>
              <span style={{ fontSize: 12.5, color: T.muted }}>Everyone competes solo; the leaderboard ranks each person by their own answers.</span>
            </span>
          </button>
          <button style={s.teamModeOpt} onClick={() => onChoose("self")}>
            <Users size={18} strokeWidth={2.2} />
            <span>
              <b style={{ display: "block", color: T.text }}>Residents pick their own teams</b>
              <span style={{ fontSize: 12.5, color: T.muted }}>Everyone types in a team name of their choosing when they join.</span>
            </span>
          </button>
          <div>
            <button
              style={{ ...s.teamModeOpt, width: "100%", ...(weeklyDisabled ? { opacity: 0.5, cursor: "default" } : {}) }}
              onClick={chooseWeekly}
              disabled={busy || weeklyBusy || weeklyDisabled}
            >
              <Shuffle size={18} strokeWidth={2.2} />
              <span>
                <b style={{ display: "block", color: T.text }}>⭐ This week's mixer teams</b>
                <span style={{ fontSize: 12.5, color: T.muted }}>
                  {weeklyBusy
                    ? "Randomizing…"
                    : hasWeekly
                    ? `Random pairing balanced across R1–R4/fellow (${weeklyCount} people) — stays put until an admin re-randomizes, so folks work with someone new each week.`
                    : isAdmin
                    ? "Not randomized yet — generates a balanced random pairing (one R1, R2, R3, R4/fellow per team) that holds for the week's didactics."
                    : "Ask an admin to randomize this week's pairings first."}
                </span>
                {!weeklyBusy && hasWeekly && (
                  <span style={{ display: "block", fontSize: 11.5, color: T.faint, marginTop: 3 }}>
                    Last randomized {weeklyGeneratedAt ? new Date(weeklyGeneratedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "recently"}
                    {weeklyGeneratedBy ? ` by ${weeklyGeneratedBy}` : ""}
                  </span>
                )}
              </span>
            </button>
            {weeklyErr && (
              <div style={{ fontSize: 12, color: T.wrongLine, marginTop: 4 }}>
                Couldn't randomize the pairings: {weeklyErr}
              </div>
            )}
            {isAdmin && (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <button style={s.teamModeRegen} onClick={rerollWeekly} disabled={weeklyBusy}>
                  <Repeat size={11} strokeWidth={2.4} /> {hasWeekly ? "Randomize new pairings (next week)" : "Randomize pairings"}
                </button>
                {hasWeekly && (
                  <button style={s.teamModeRegen} onClick={revealPairings} disabled={weeklyBusy} title="Show the team list and copy it to paste into the didactics email">
                    <Copy size={11} strokeWidth={2.4} /> {pairingsCopied ? "Copied!" : pairingsText ? "Copy again" : "Copy short-term pairings list"}
                  </button>
                )}
              </div>
            )}
            {pairingsErr && <div style={{ fontSize: 12, color: T.wrongLine, marginTop: 8 }}>{pairingsErr}</div>}
            {pairingsText && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11.5, color: T.faint }}>{pairingsCopied ? "Copied to clipboard ✓" : "Select the text below to copy manually if needed:"}</span>
                  <button style={s.teamModeRegen} onClick={copyRevealed}>
                    <Copy size={11} strokeWidth={2.4} /> {pairingsCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <textarea
                  ref={pairingsRef} readOnly value={pairingsText}
                  onFocus={(e) => e.currentTarget.select()}
                  rows={Math.min(12, pairingsText.split("\n").length + 1)}
                  style={{ width: "100%", boxSizing: "border-box", fontSize: 12.5, lineHeight: 1.5, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.paperEdge}`, background: "#fff", color: T.text, fontFamily: "inherit", resize: "vertical" }}
                />
              </div>
            )}
          </div>
          <div>
            <button
              style={{ ...s.teamModeOpt, width: "100%", ...(stableDisabled ? { opacity: 0.5, cursor: "default" } : {}) }}
              onClick={chooseStable}
              disabled={busy || stableDisabled}
            >
              <Crown size={18} strokeWidth={2.2} />
              <span>
                <b style={{ display: "block", color: T.text }}>Stable teams — all season</b>
                <span style={{ fontSize: 12.5, color: T.muted }}>
                  {busy
                    ? "Generating…"
                    : hasStable
                    ? `Fixed one R1, R2, R3 and R4/fellow per team (${stableCount} on rosters) — same teams every session until this year's PRITE.`
                    : isAdmin
                    ? "Not set up yet — generates fixed rosters from everyone's current PGY year, then keeps using them all season."
                    : "Ask an admin to generate the fixed season-long rosters first."}
                </span>
              </span>
            </button>
            {hasStable && isAdmin && (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <button style={s.teamModeRegen} onClick={onEditRosters} disabled={busy}>
                  <Pencil size={11} strokeWidth={2.4} /> Edit rosters (move / add / remove people)
                </button>
                <button style={s.teamModeRegen} onClick={regenerate} disabled={busy}>
                  <Repeat size={11} strokeWidth={2.4} /> Regenerate rosters (e.g. a new academic year)
                </button>
                <button style={s.teamModeRegen} onClick={revealRoster} disabled={busy} title="Show the season team list and copy it to paste into an email">
                  <Copy size={11} strokeWidth={2.4} /> {rosterCopied ? "Copied!" : rosterText ? "Copy again" : "Copy roster list"}
                </button>
              </div>
            )}
            {rosterErr && <div style={{ fontSize: 12, color: T.wrongLine, marginTop: 8 }}>{rosterErr}</div>}
            {rosterText && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11.5, color: T.faint }}>{rosterCopied ? "Copied to clipboard ✓" : "Select the text below to copy manually if needed:"}</span>
                  <button style={s.teamModeRegen} onClick={copyRosterRevealed}>
                    <Copy size={11} strokeWidth={2.4} /> {rosterCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <textarea
                  ref={rosterRef} readOnly value={rosterText}
                  onFocus={(e) => e.currentTarget.select()}
                  rows={Math.min(12, rosterText.split("\n").length + 1)}
                  style={{ width: "100%", boxSizing: "border-box", fontSize: 12.5, lineHeight: 1.5, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.paperEdge}`, background: "#fff", color: T.text, fontFamily: "inherit", resize: "vertical" }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Admin: hand-edit the season-long poll rosters — move members between
    teams, pull them off entirely, or add any approved member who isn't
    placed yet. Each action writes to stable_teams immediately (one row per
    person; RLS restricts writes to admins), so there's no save step and a
    dropped connection can't half-apply a batch. */
const LEVEL_ORDER: Record<string, number> = { R1: 1, R2: 2, R3: 3, R4: 4, F1: 5, F2: 6 };
function TeamRosterEditor({ onClose }: { onClose: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Record<string, string>>({}); // profile_id -> team name
  const [extraTeams, setExtraTeams] = useState<string[]>([]);     // empty teams added this session (exist only until someone joins)
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  // Drag-and-drop between teams: dragPid is the person being dragged, dragOver
  // the section under the cursor (a team name, or OFF_ROSTER for the
  // "not on a team" list, which acts as a remove target).
  const OFF_ROSTER = " off-roster"; // leading space — real team names never start with one
  const [dragPid, setDragPid] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragHandleProps = (p: Profile) => ({
    draggable: busyId === null,
    onDragStart: (e: React.DragEvent) => {
      setDragPid(p.id);
      e.dataTransfer.setData("text/plain", p.id);
      e.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: () => { setDragPid(null); setDragOver(null); },
  });
  const dropTargetProps = (target: string, apply: (pid: string) => void) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragPid) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragOver !== target) setDragOver(target);
    },
    onDragLeave: (e: React.DragEvent) => {
      // only clear when actually leaving the section, not moving between its children
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        setDragOver((cur) => (cur === target ? null : cur));
      }
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const pid = dragPid;
      setDragPid(null); setDragOver(null);
      if (pid) apply(pid);
    },
  });
  const dropHighlight = (target: string) =>
    dragOver === target
      ? { outline: `2px dashed ${T.teal}`, outlineOffset: 2, borderRadius: 8, background: T.tealSoft }
      : {};

  useEffect(() => {
    (async () => {
      const [ps, st] = await Promise.all([listProfiles(), getStableTeams()]);
      // test accounts (duplicate sign-ins, demo Googles) never belong on
      // review-poll teams — keep them out of the editor entirely
      setProfiles(ps.filter((p) => p.status === "approved" && p.role !== "test"));
      setTeams(st);
      setLoading(false);
    })();
  }, []);

  const teamNames = useMemo(() => {
    const names = new Set<string>([...Object.values(teams), ...extraTeams]);
    return [...names].sort((a, b) => a.length - b.length || a.localeCompare(b)); // "Team 2" before "Team 10"
  }, [teams, extraTeams]);

  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const memberSort = (a: Profile, b: Profile) =>
    (LEVEL_ORDER[a.training_level ?? ""] ?? 9) - (LEVEL_ORDER[b.training_level ?? ""] ?? 9) ||
    (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email);
  const membersOf = (team: string) =>
    Object.entries(teams).filter(([, t]) => t === team)
      .map(([pid]) => byId.get(pid)).filter((p): p is Profile => !!p)
      .sort(memberSort);
  // Unplaced residents surface immediately (they're who the admin is looking
  // for on poll day); faculty/alumni/level-less accounts wait behind a toggle.
  const unassigned = profiles.filter((p) => !teams[p.id]).sort(memberSort);
  const unassignedResidents = unassigned.filter((p) => stableTeamLevel(p.training_level) !== null || p.role === "resident");
  const unassignedOthers = unassigned.filter((p) => !unassignedResidents.includes(p));
  const [showOthers, setShowOthers] = useState(false);

  // Suggested team for someone not yet placed: the seat that was announced
  // for them before they had an account (PLANNED_TEAMS), else the thinnest
  // team that lacks their PGY-year bucket, else simply the thinnest team.
  const suggestFor = (p: Profile): string | null => {
    const planned = matchPlannedTeam(p.full_name);
    if (planned) return planned;
    if (!teamNames.length) return null;
    const bySize = [...teamNames].sort((a, b) =>
      membersOf(a).length - membersOf(b).length || a.length - b.length || a.localeCompare(b));
    const bucket = stableTeamLevel(p.training_level);
    if (bucket) {
      const gap = bySize.find((t) => !membersOf(t).some((m) => stableTeamLevel(m.training_level) === bucket));
      if (gap) return gap;
    }
    return bySize[0];
  };

  const move = async (pid: string, team: string) => {
    if (!team || teams[pid] === team) return;
    setBusyId(pid); setFailedId(null);
    const ok = await setStableTeam(pid, team);
    if (ok) setTeams((t) => ({ ...t, [pid]: team }));
    else setFailedId(pid);
    setBusyId(null);
  };
  const remove = async (pid: string) => {
    setBusyId(pid); setFailedId(null);
    const ok = await removeStableTeam(pid);
    if (ok) setTeams((t) => { const next = { ...t }; delete next[pid]; return next; });
    else setFailedId(pid);
    setBusyId(null);
  };
  const addTeam = () => {
    const nums = teamNames.map((n) => parseInt(n.replace(/\D+/g, ""), 10)).filter((n) => !isNaN(n));
    setExtraTeams((x) => [...x, `Team ${(nums.length ? Math.max(...nums) : 0) + 1}`]);
  };

  const label = (p: Profile) => p.full_name || p.email;
  const tag = (p: Profile) => p.training_level ?? p.role;

  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 560 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Season poll teams</div>
            <div style={s.apTitle}>Edit rosters</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.apBody}>
          <p style={{ ...s.apEmpty, marginBottom: 14 }}>
            Changes save instantly. Drag someone onto a team (or pick one from their dropdown) to move them; ✕ — or dragging them onto the "not on a team" list — takes them off the roster.
          </p>
          {loading ? (
            <p style={s.apEmpty}>Loading rosters…</p>
          ) : (
            <>
              {teamNames.map((team) => (
                <div key={team} style={{ ...s.teamEdSection, ...dropHighlight(team) }} {...dropTargetProps(team, (pid) => move(pid, team))}>
                  <div style={s.teamEdHead}>{team} <span style={{ color: T.faint, fontWeight: 500 }}>· {membersOf(team).length} {membersOf(team).length === 1 ? "member" : "members"}</span></div>
                  {membersOf(team).map((p) => (
                    <div key={p.id} style={{ ...s.teamEdRow, opacity: busyId === p.id ? 0.5 : dragPid === p.id ? 0.4 : 1, cursor: "grab" }} {...dragHandleProps(p)}>
                      <GripVertical size={13} strokeWidth={2.2} color={T.faint} style={{ flex: "0 0 auto" }} />
                      <span style={s.teamEdName}>{label(p)}</span>
                      <span style={s.teamEdLvl}>{tag(p)}</span>
                      {failedId === p.id && <span style={{ color: T.wrongLine, fontSize: 11.5 }}>couldn't save — retry</span>}
                      <select
                        style={s.teamEdSel}
                        value={team}
                        disabled={busyId === p.id}
                        onChange={(e) => move(p.id, e.target.value)}
                        title="Move to another team"
                      >
                        {teamNames.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <button style={s.teamEdRemove} onClick={() => remove(p.id)} disabled={busyId === p.id} title="Remove from the season roster">
                        <X size={13} strokeWidth={2.6} />
                      </button>
                    </div>
                  ))}
                  {membersOf(team).length === 0 && <div style={{ ...s.apEmpty, padding: "4px 0 8px" }}>Empty — move someone here.</div>}
                </div>
              ))}
              <button style={s.teamEdAddTeam} onClick={addTeam}><Plus size={13} strokeWidth={2.4} /> New team</button>

              <div
                style={{ ...s.teamEdSection, marginTop: 18, ...dropHighlight(OFF_ROSTER) }}
                {...dropTargetProps(OFF_ROSTER, (pid) => { if (teams[pid]) remove(pid); })}
              >
                <div style={s.teamEdHead}>Residents not on a team <span style={{ color: T.faint, fontWeight: 500 }}>· {unassignedResidents.length}</span></div>
                {unassignedResidents.length === 0 && <div style={{ ...s.apEmpty, padding: "4px 0 8px" }}>Every approved resident is placed. 🎉{dragPid ? " (Drop someone here to take them off the roster.)" : ""}</div>}
                {unassignedResidents.map((p) => {
                  const suggested = suggestFor(p);
                  const promised = !!matchPlannedTeam(p.full_name);
                  return (
                    <div key={p.id} style={{ ...s.teamEdRow, opacity: busyId === p.id ? 0.5 : dragPid === p.id ? 0.4 : 1, cursor: "grab" }} {...dragHandleProps(p)}>
                      <GripVertical size={13} strokeWidth={2.2} color={T.faint} style={{ flex: "0 0 auto" }} />
                      <span style={s.teamEdName}>{label(p)}</span>
                      <span style={s.teamEdLvl}>{tag(p)}</span>
                      {failedId === p.id && <span style={{ color: T.wrongLine, fontSize: 11.5 }}>couldn't save — retry</span>}
                      {suggested && (
                        <button
                          style={s.teamEdSuggest}
                          onClick={() => move(p.id, suggested)}
                          disabled={busyId === p.id}
                          title={promised
                            ? "This seat was announced for them before they had an account"
                            : "Best fit: the thinnest team missing their year"}
                        >
                          <Sparkles size={11} strokeWidth={2.4} /> {suggested}{promised ? " · promised" : ""}
                        </button>
                      )}
                      <select
                        style={s.teamEdSel}
                        value=""
                        disabled={busyId === p.id}
                        onChange={(e) => move(p.id, e.target.value)}
                        title="Add to a team"
                      >
                        <option value="" disabled>Other…</option>
                        {teamNames.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  );
                })}
              </div>

              {unassignedOthers.length > 0 && (
                <div style={{ ...s.teamEdSection, marginTop: 4 }}>
                  <button style={s.teamEdOthersToggle} onClick={() => setShowOthers((v) => !v)}>
                    {showOthers ? <ChevronDown size={13} strokeWidth={2.4} /> : <ChevronRight size={13} strokeWidth={2.4} />}
                    Faculty & alumni not on a team · {unassignedOthers.length}
                  </button>
                  {showOthers && unassignedOthers.map((p) => (
                    <div key={p.id} style={{ ...s.teamEdRow, opacity: busyId === p.id ? 0.5 : dragPid === p.id ? 0.4 : 1, cursor: "grab" }} {...dragHandleProps(p)}>
                      <GripVertical size={13} strokeWidth={2.2} color={T.faint} style={{ flex: "0 0 auto" }} />
                      <span style={s.teamEdName}>{label(p)}</span>
                      <span style={s.teamEdLvl}>{tag(p)}</span>
                      {failedId === p.id && <span style={{ color: T.wrongLine, fontSize: 11.5 }}>couldn't save — retry</span>}
                      <select
                        style={s.teamEdSel}
                        value=""
                        disabled={busyId === p.id}
                        onChange={(e) => move(p.id, e.target.value)}
                        title="Add to a team"
                      >
                        <option value="" disabled>Add to…</option>
                        {teamNames.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Live crowd poll. Host = big screen (owns the question + tallies votes);  */
/* participants = phones (tap A–E). All over an ephemeral Realtime channel. */

function PollPresenter({ code, set, startIndex, timerSecs, onTimerSecsChange, teamMode, onClose }: {
  code: string; set: RawQuestion[]; startIndex: number; timerSecs: number; onTimerSecsChange: (n: number) => void; teamMode: TeamMode; onClose: () => void;
}) {
  const [index, setIndex] = useState(Math.max(0, Math.min(startIndex, set.length - 1)));
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);   // session over — final-standings screen
  const [started, setStarted] = useState(false);     // host hasn't hit "Start" yet — phones sit in a lobby, no voting
  // Standings view: individual leaderboard vs team. Individual standings are
  // deliberately NEVER shown during the live poll (they'd sit on the big
  // screen above every question) — they're an opt-in toggle on the finished
  // screen only. Team modes still show live team stats as before.
  const [showIndividual, setShowIndividual] = useState(false);
  // One-question peek at the current individual standings, offered only once
  // the answer is revealed. Cleared automatically on every question change
  // (goTo), so it never lingers over the next question.
  const [peekStandings, setPeekStandings] = useState(false);
  // Team-standings ranking metric. Default is team accuracy — the share of
  // ALL answers the team submitted that were correct — so a bigger team
  // can't out-rank a smaller, sharper one just by fielding more bodies.
  // Toggling flips to the raw total-correct ranking (the old behavior).
  const [rankByTotal, setRankByTotal] = useState(false);
  // A quick fun-gif "drumroll" beat between ending the poll and the standings
  // actually appearing — set to a gif URL to show it; auto-advances to the
  // standings screen a couple seconds later (or immediately on tap/click).
  const [drumrollGif, setDrumrollGif] = useState<string | null>(null);
  const finishPoll = () => setDrumrollGif(nextPollDrumrollGif());
  useEffect(() => {
    if (!drumrollGif) return;
    const t = setTimeout(() => { setDrumrollGif(null); setFinished(true); }, 2200);
    return () => clearTimeout(t);
  }, [drumrollGif]);
  const [showAnswerKey, setShowAnswerKey] = useState(false); // answer key on the finish screen (hidden by default)
  const [standingsFontSize, setStandingsFontSize] = useState(20); // adjustable text size for the answer-key stem/options/explanation
  const [pollStemScale, setPollStemScale] = useState(1.8); // adjustable text size for the question, independent of the choices (default 180% for room readability)
  const [pollOptScale, setPollOptScale] = useState(1.8);    // adjustable text size for the answer choices, independent of the question (default 180%)
  const [explImgScale, setExplImgScale] = useState(1.3); // adjustable size for explanation images on the big screen
  // Top bar size — bigger by default for room readability, and drag-resizable
  // (pull the handle below the bar up or down) for whoever's presenting.
  const [headScale, setHeadScale] = useState(1.4);
  const headDragRef = useRef<{ startY: number; startScale: number } | null>(null);
  const onHeadDragStart = (e: React.PointerEvent) => {
    headDragRef.current = { startY: e.clientY, startScale: headScale };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHeadDragMove = (e: React.PointerEvent) => {
    if (!headDragRef.current) return;
    const dy = e.clientY - headDragRef.current.startY;
    // Wide range so the bar (and the QR) can go really big for a big room —
    // the header text just wraps to more lines as it grows, it no longer
    // "hits a wall" at the old 2.2 cap. Capped at 4 so text-wrapping can't
    // balloon the bar past a usable height on a narrower screen.
    setHeadScale(Math.max(1, Math.min(4, headDragRef.current.startScale + dy / 120)));
  };
  const onHeadDragEnd = () => { headDragRef.current = null; };
  // Join QR size is driven straight off the header scale, so it grows ACTIVELY
  // as the bar is dragged — the biggest scannable code the bar allows. (An
  // earlier version measured the header content row instead, but on a wide
  // projector that row is a single short line, so the QR barely grew.) The QR
  // becomes the tallest thing in the bar and simply defines its height; no
  // measurement, so no feedback loop. Click it to blow it up full-screen.
  const qrPx = Math.round(Math.max(72, 104 * headScale));
  const [showExpl, setShowExpl] = useState(false); // reveal the current question's explanation on the big screen (per-question, reset each question)
  const [hideChoices, setHideChoices] = useState(true); // default: choices off the big screen, shown on phones instead
  const [choicesLayout, setChoicesLayout] = useState<"side" | "bottom">("side"); // default: choices beside the question
  const [expandedKey, setExpandedKey] = useState<Set<number>>(new Set()); // answer-key rows expanded to show the full question + explanation
  const toggleKey = (i: number) => setExpandedKey((prev) => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });
  const [zoomImg, setZoomImg] = useState<string | null>(null); // answer-key explanation image, enlarged on click
  const [officialStatus, setOfficialStatus] = useState<"idle" | "confirm" | "sending" | "done">("idle"); // "mark as official" submit flow
  const [endPrompt, setEndPrompt] = useState(false); // "was this an official class session?" gate shown on End poll
  const [endBusy, setEndBusy] = useState(false);
  const [endError, setEndError] = useState(false);
  const [, force] = useState(0); // re-render when votes arrive
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [qr, setQr] = useState<string | null>(null); // join-URL QR as a data URL
  const [qrBig, setQrBig] = useState(false);          // enlarged QR overlay
  const votesRef = useRef<Map<string, Map<string, string[]>>>(new Map()); // qid -> voter -> choice(s)
  const teamRef = useRef<Map<string, string>>(new Map());   // voter -> team name
  const levelRef = useRef<Map<string, string>>(new Map());  // voter -> PGY year (R1–R4), if known
  const nameRef = useRef<Map<string, string>>(new Map());   // voter -> display name, for the individual leaderboard
  const joinedRef = useRef<Set<string>>(new Set());  // every voter who has said hello or voted
  const correctRef = useRef<Map<string, string[]>>(new Map()); // qid -> correct letters (recorded on reveal)
  const chanRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);

  // Cumulative team leaderboard. The whole team scores as one entity —
  // everyone's votes pool together — but the default RANKING is team
  // accuracy (pooled correct ÷ pooled answers), so a bigger team can't win
  // just by casting more votes: 40/60 (67%) loses to 18/24 (75%). Ties break
  // on total correct, so among equal accuracies the bigger body of work
  // wins. The host can toggle to the raw total-correct ranking (rankByTotal).
  // Derived fresh from the raw vote log each call, so it's idempotent
  // (re-reveals and re-renders never double-count).
  const computeStandings = (): TeamStanding[] => {
    const correctCount = new Map<string, number>();
    const answeredCount = new Map<string, number>();
    const answerers = new Map<string, Set<string>>();
    const members = new Map<string, Set<string>>();
    for (const [vId, team] of teamRef.current) {
      if (!team) continue;
      if (!members.has(team)) { members.set(team, new Set()); answerers.set(team, new Set()); correctCount.set(team, 0); answeredCount.set(team, 0); }
      members.get(team)!.add(vId);
    }
    for (const [qId, correct] of correctRef.current) {
      const m = votesRef.current.get(qId);
      if (!m) continue;
      for (const [vId, choice] of m) {
        const team = teamRef.current.get(vId);
        if (!team) continue;
        answerers.get(team)?.add(vId);
        answeredCount.set(team, (answeredCount.get(team) ?? 0) + 1);
        if (pickIsCorrect(choice, correct)) correctCount.set(team, (correctCount.get(team) ?? 0) + 1);
      }
    }
    const pct = (t: TeamStanding) => (t.answered > 0 ? t.correct / t.answered : 0);
    return [...members.keys()]
      .map((team) => {
        const n = answerers.get(team)?.size ?? 0;
        const c = correctCount.get(team) ?? 0;
        return { team, score: c, members: members.get(team)?.size ?? 0, correct: c, answerers: n, answered: answeredCount.get(team) ?? 0 };
      })
      .sort((a, b) =>
        rankByTotal
          ? b.correct - a.correct || pct(b) - pct(a) || a.team.localeCompare(b.team)
          : pct(b) - pct(a) || b.correct - a.correct || a.team.localeCompare(b.team));
  };

  // Cumulative individual leaderboard: per participant, how many revealed
  // questions they got right (score) out of how many they answered. Derived
  // fresh from the raw vote log each call, same as computeStandings. Everyone
  // who has answered at least one question appears, keyed by their display name
  // (falling back to a short id for anonymous joiners).
  const computeIndividualStandings = (): IndividualStanding[] => {
    const correct = new Map<string, number>();
    const answered = new Map<string, number>();
    for (const [qId, key] of correctRef.current) {
      const m = votesRef.current.get(qId);
      if (!m) continue;
      for (const [vId, choice] of m) {
        answered.set(vId, (answered.get(vId) ?? 0) + 1);
        if (pickIsCorrect(choice, key)) correct.set(vId, (correct.get(vId) ?? 0) + 1);
      }
    }
    return [...answered.keys()]
      .map((vId) => ({
        voter: vId,
        name: nameRef.current.get(vId) || `Player ${vId.slice(0, 4)}`,
        score: correct.get(vId) ?? 0,
        answered: answered.get(vId) ?? 0,
      }))
      .sort((a, b) => b.score - a.score || b.answered - a.answered || a.name.localeCompare(b.name));
  };

  // render the join URL into a QR once per room code
  useEffect(() => {
    QRCode.toDataURL(pollJoinUrl(code), { margin: 2, width: 512, color: { dark: "#11131c", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [code]);

  const q = set[index];
  const total = set.length;
  const correctSet = q ? (q.answer_letters?.length ? q.answer_letters : q.answer_letter ? [q.answer_letter] : []) : [];
  const qid = q ? questionId(q.year, q.q_index) : "";

  // Lock in each question's correct answers as soon as we're on it (not
  // gated on "revealed") so a vote still counts even if the presenter clicks
  // Next without ever clicking Reveal — otherwise those votes are stranded:
  // recorded in votesRef but never credited because correctRef never learned
  // the answer key for that qid.
  if (qid) correctRef.current.set(qid, correctSet);

  const broadcastRef = useRef<() => void>(() => {});
  broadcastRef.current = () => {
    if (qid) correctRef.current.set(qid, correctSet);
    const payload: PollState = {
      qid, year: q?.year ?? "", qIndex: q?.q_index ?? 0,
      nOptions: q?.options.length ?? 0,
      options: q?.options.map((o) => ({ letter: o.letter, text: o.text })) ?? [],
      index, total, multiSelect: q?.multi_select ?? false, revealed,
      correct: revealed ? correctSet : [],
      standings: computeStandings(),
      rankBy: rankByTotal ? "total" : "pct",
      individuals: computeIndividualStandings(),
      teamMode,
      started,
      voted: votesRef.current.get(qid)?.size ?? 0,
      joined: joinedRef.current.size,
      finished,
    };
    chanRef.current?.send({ type: "broadcast", event: POLL_EVENTS.state, payload });
  };

  // open the channel once
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel(channelName(code), { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: POLL_EVENTS.vote }, ({ payload }: { payload: PollVote }) => {
      const v = payload;
      if (!v?.qid || !v?.choice?.length || !v?.voter) return;
      let m = votesRef.current.get(v.qid);
      if (!m) { m = new Map(); votesRef.current.set(v.qid, m); }
      m.set(v.voter, v.choice);
      joinedRef.current.add(v.voter);
      if (v.team) teamRef.current.set(v.voter, v.team);
      if (v.level) levelRef.current.set(v.voter, v.level);
      if (v.name) nameRef.current.set(v.voter, v.name);
      force((n) => n + 1);
      broadcastRef.current(); // keep participants' voted/joined counters live
    });
    ch.on("broadcast", { event: POLL_EVENTS.hello }, ({ payload }: { payload: PollHello }) => {
      if (payload?.voter) {
        joinedRef.current.add(payload.voter);
        if (payload.team) teamRef.current.set(payload.voter, payload.team);
        if (payload.level) levelRef.current.set(payload.voter, payload.level);
        if (payload.name) nameRef.current.set(payload.voter, payload.name);
        force((n) => n + 1);
      }
      broadcastRef.current();
    });
    ch.subscribe((st) => { if (st === "SUBSCRIBED") broadcastRef.current(); });
    chanRef.current = ch;
    return () => { supabase?.removeChannel(ch); chanRef.current = null; };
  }, [code]); // eslint-disable-line

  // re-broadcast the live question whenever it changes (incl. the lobby→started
  // flip), and whenever the standings ranking metric flips so phones re-order too
  useEffect(() => { broadcastRef.current(); }, [index, revealed, finished, started, rankByTotal]); // eslint-disable-line

  // per-question countdown; auto-reveal when it hits zero (never runs in the lobby)
  useEffect(() => {
    if (revealed || finished || !q || !started) { setTimeLeft(null); return; }
    setTimeLeft(timerSecs);
    const id = setInterval(() => setTimeLeft((t) => (t == null ? t : t <= 1 ? 0 : t - 1)), 1000);
    return () => clearInterval(id);
  }, [index, revealed, finished, started, timerSecs, q?.year, q?.q_index]); // eslint-disable-line
  useEffect(() => { if (timeLeft === 0 && !revealed) setRevealed(true); }, [timeLeft, revealed]);

  if (!q) return null;
  const tally = votesRef.current.get(qid) ?? new Map<string, string[]>();
  const counts: Record<string, number> = {};
  for (const picks of tally.values()) for (const c of picks) counts[c] = (counts[c] ?? 0) + 1;
  const voterCount = tally.size;
  const joinedCount = joinedRef.current.size;
  const allVoted = joinedCount > 0 && voterCount >= joinedCount;
  const standings = computeStandings();
  const individuals = computeIndividualStandings();
  const isIndividualMode = teamMode === "individual";
  const goTo = (i: number) => { setRevealed(false); setShowExpl(false); setPeekStandings(false); setIndex(Math.max(0, Math.min(i, total - 1))); };
  // Nudge the running countdown (and the baseline used for every question
  // after this one) up or down — the default one-minute timer isn't right
  // for every question, and there was previously no way to change it mid-poll.
  const bumpTimer = (delta: number) => {
    setTimeLeft((t) => (t == null ? t : Math.max(0, t + delta)));
    onTimerSecsChange(Math.max(10, Math.min(600, timerSecs + delta)));
  };
  const joinHost = pollJoinUrl(code).replace(/^https?:\/\//, "");
  const keyFor = (qq: RawQuestion) => qq.answer_letters?.length ? qq.answer_letters : qq.answer_letter ? [qq.answer_letter] : [];

  // Auto-assign mode: shuffle everyone who has joined so far into teams with
  // at most one resident per PGY year each, and push the result to every phone.
  // Safe to re-run later (e.g. stragglers join) — it just reshuffles again.
  const runAutoAssign = () => {
    const entries = [...joinedRef.current].map((voter) => ({ voter, level: levelRef.current.get(voter) }));
    if (!entries.length) return;
    const assignments = assignBalancedTeams(entries);
    for (const [voter, team] of Object.entries(assignments)) teamRef.current.set(voter, team);
    chanRef.current?.send({ type: "broadcast", event: POLL_EVENTS.assign, payload: { assignments } as PollAssign });
    force((n) => n + 1);
    broadcastRef.current();
  };

  // Snapshot this session's vote breakdown + standings and file it as an
  // official class review, for the admin archive (only meant for real class
  // sessions, not casual practice polls — gated behind a confirm step in the UI).
  const submitOfficial = async () => {
    setOfficialStatus("sending");
    const questionStats: QuestionStat[] = set.map((qq) => {
      const qqid = questionId(qq.year, qq.q_index);
      const correct = keyFor(qq);
      const tally = votesRef.current.get(qqid) ?? new Map<string, string[]>();
      const counts: Record<string, number> = {};
      for (const picks of tally.values()) for (const c of picks) counts[c] = (counts[c] ?? 0) + 1;
      const totalVotes = tally.size;
      const wrongVotes = [...tally.values()].filter((picks) => !pickIsCorrect(picks, correct)).length;
      return { qid: qqid, year: qq.year, q_index: qq.q_index, stem: qq.stem, correct, counts, totalVotes, wrongVotes };
    });
    const ok = await submitOfficialPollResults({
      poll_code: code,
      total_questions: set.length,
      total_participants: joinedRef.current.size,
      standings: computeStandings(),
      question_stats: questionStats,
    });
    setOfficialStatus(ok ? "done" : "idle");
    return ok;
  };

  // Votes/standings live only in this component's memory (votesRef etc.) —
  // ending the poll before the results/review-priority heat map has actually
  // been seen throws that session away for good. Confirm first so a stray
  // click on the header X doesn't accidentally do that. When the session IS
  // over, ending routes through an explicit "was this a real class session?"
  // prompt (endPrompt below) so official archiving can't be forgotten.
  const confirmClose = () => {
    if (!finished) {
      if (!window.confirm("End the poll now? The results and review-priority heat map for this session haven't been shown yet — ending now discards them.")) return;
      onClose();
      return;
    }
    if (!showAnswerKey) {
      if (!window.confirm("End poll without viewing the answer key / review-priority heat map?")) return;
    }
    if (officialStatus !== "done" && standings.length > 0) {
      setEndPrompt(true);
      return;
    }
    onClose();
  };
  const endOfficialAndClose = async () => {
    setEndBusy(true); setEndError(false);
    const ok = await submitOfficial();
    setEndBusy(false);
    if (ok) onClose();
    else setEndError(true); // stay open so the host can retry (or end without marking)
  };

  return (
    <div style={s.pollRoot}>
      <style>{CSS}</style>
      {/* nowrap outer row: [QR][all other header items in one wrapper]. The QR
          is a square sized off the header scale (qrPx), so it grows as the bar
          is dragged and becomes the tallest thing in the bar; the wrapper holds
          everything else and wraps internally as it grows. */}
      <div style={{ ...s.pollHead, flexWrap: "nowrap", alignItems: "center", fontSize: 16 * headScale, padding: `${16 * headScale}px ${26 * headScale}px` }}>
        {qr && (
          <button style={{ ...s.qrThumb, width: qrPx, height: qrPx, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setQrBig(true)} title="Tap to enlarge for scanning">
            <img src={qr} alt={`QR code to join poll ${code}`} style={{ ...s.qrThumbImg, width: "100%", height: "100%", objectFit: "contain" }} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 16 * headScale }}>
        <span style={{ ...s.pollLive, fontSize: 14 * headScale }}><Radio size={16 * headScale} strokeWidth={2.4} /> LIVE POLL</span>
        <span style={{ ...s.pollJoin, fontSize: 15 * headScale }}>Scan, or join at <b style={{ color: "#fff" }}>{joinHost}</b> · code <b style={{ ...s.pollCode, fontSize: 18 * headScale }}>{code}</b></span>
        <span style={{ ...s.pollVoters, ...(allVoted && !revealed ? { color: "#48c78e" } : {}) }}>
          <Users size={16 * headScale} strokeWidth={2.3} /> {voterCount}{joinedCount > 0 ? ` of ${joinedCount}` : ""} voted{allVoted && !revealed ? " · all in!" : ""}
        </span>
        {teamMode === "auto" && !finished && (
          <button
            style={{ ...s.pollBtn, padding: "6px 10px" }}
            onClick={runAutoAssign}
            disabled={!joinedCount}
            title="Shuffle everyone who has joined so far into teams with one R1, R2, R3 and R4 apiece"
          >
            <Repeat size={13} strokeWidth={2.4} /> {joinedCount ? `Assign teams (${joinedCount} joined)` : "Assign teams"}
          </button>
        )}
        {timeLeft != null && (
          <>
            {/* Timer gets an extra boost on top of the header scale — it's the
                one thing everyone across the room needs to read at a glance. */}
            <span
              className={timeLeft <= 10 ? "timerLow" : undefined}
              style={{
                ...s.timerPill, ...(timeLeft <= 10 ? s.timerPillLow : {}),
                fontSize: 14 * headScale * 1.5, padding: `${6 * headScale}px ${12 * headScale}px`,
              }}
            >
              <Clock size={14 * headScale * 1.5} strokeWidth={2.5} /> {fmtTime(timeLeft)}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }} title="Add or remove time — also becomes the default for questions after this one">
              <button style={{ ...s.pollBtn, padding: "6px 8px" }} onClick={() => bumpTimer(-15)} title="-15 seconds"><Minus size={13} strokeWidth={2.4} /></button>
              <button style={{ ...s.pollBtn, padding: "6px 8px" }} onClick={() => bumpTimer(15)} title="+15 seconds"><Plus size={13} strokeWidth={2.4} /></button>
            </span>
          </>
        )}
        {!finished && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.04)", border: `1px solid ${T.inkLine}`, borderRadius: 10, padding: "4px 8px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }} title="Question text size">
              <span style={{ fontSize: 11, color: "#7b8394", marginRight: 2 }}>Q</span>
              <button
                style={{ ...s.pollBtn, padding: "6px 8px", opacity: pollStemScale <= 0.6 ? 0.4 : 1 }}
                onClick={() => setPollStemScale((v) => Math.max(0.6, +(v - 0.1).toFixed(2)))}
                disabled={pollStemScale <= 0.6}
                title="Decrease question text size"
              >
                <Minus size={13} strokeWidth={2.3} />
              </button>
              <span style={{ fontSize: 12, color: "#9aa0ab", width: 36, textAlign: "center" }}>{Math.round(pollStemScale * 100)}%</span>
              <button
                style={{ ...s.pollBtn, padding: "6px 8px", opacity: pollStemScale >= 2.6 ? 0.4 : 1 }}
                onClick={() => setPollStemScale((v) => Math.min(2.6, +(v + 0.1).toFixed(2)))}
                disabled={pollStemScale >= 2.6}
                title="Increase question text size"
              >
                <Plus size={13} strokeWidth={2.3} />
              </button>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, opacity: hideChoices ? 0.5 : 1 }} title={hideChoices ? "Answer choices text size — turn on \"Choices shown\" to see the effect on this screen" : "Answer choices text size"}>
              <span style={{ fontSize: 11, color: "#7b8394", marginRight: 2 }}>ABC</span>
              <button
                style={{ ...s.pollBtn, padding: "6px 8px", opacity: pollOptScale <= 0.5 ? 0.4 : 1 }}
                onClick={() => setPollOptScale((v) => Math.max(0.5, +(v - 0.1).toFixed(2)))}
                disabled={pollOptScale <= 0.5}
                title="Decrease answer choices text size"
              >
                <Minus size={13} strokeWidth={2.3} />
              </button>
              <span style={{ fontSize: 12, color: "#9aa0ab", width: 36, textAlign: "center" }}>{Math.round(pollOptScale * 100)}%</span>
              <button
                style={{ ...s.pollBtn, padding: "6px 8px", opacity: pollOptScale >= 2.2 ? 0.4 : 1 }}
                onClick={() => setPollOptScale((v) => Math.min(2.2, +(v + 0.1).toFixed(2)))}
                disabled={pollOptScale >= 2.2}
                title="Increase answer choices text size"
              >
                <Plus size={13} strokeWidth={2.3} />
              </button>
            </span>
            <button
              style={{ ...s.pollBtn, padding: "6px 10px" }}
              onClick={() => setHideChoices((v) => !v)}
              title={hideChoices ? "Choices are hidden on this screen — shown on phones instead" : "Choices are shown on this screen"}
            >
              {hideChoices ? <EyeOff size={13} strokeWidth={2.4} /> : <Eye size={13} strokeWidth={2.4} />}
              {hideChoices ? "Choices hidden" : "Choices shown"}
            </button>
            {!hideChoices && (
              <button
                style={{ ...s.pollBtn, padding: "6px 10px" }}
                onClick={() => setChoicesLayout((v) => (v === "side" ? "bottom" : "side"))}
                title="Where choices sit relative to the question"
              >
                {choicesLayout === "side" ? <PanelRight size={13} strokeWidth={2.4} /> : <PanelBottom size={13} strokeWidth={2.4} />}
                {choicesLayout === "side" ? "Side" : "Bottom"}
              </button>
            )}
          </div>
        )}
        <button style={s.pollClose} onClick={confirmClose} title="End poll"><X size={18} strokeWidth={2.4} /></button>
        </div>
      </div>
      <div
        style={s.pollHeadDrag}
        onPointerDown={onHeadDragStart}
        onPointerMove={onHeadDragMove}
        onPointerUp={onHeadDragEnd}
        onPointerCancel={onHeadDragEnd}
        title="Drag to resize the top bar"
      >
        <span style={s.pollHeadDragBar} />
      </div>

      <div style={s.pollBody}>
        {finished ? (
          <>
            <div style={s.pollMeta}>Session complete · {total} question{total === 1 ? "" : "s"}{joinedCount > 0 ? ` · ${joinedCount} participant${joinedCount === 1 ? "" : "s"}` : ""}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <p style={s.pollStem}>{showIndividual ? "Final individual standings" : isIndividualMode ? "Individual standings" : "Final standings"}</p>
              {/* Individual standings are opt-in even after the poll ends —
                  individual mode starts with them hidden until revealed. */}
              <button style={s.pollBtn} onClick={() => setShowIndividual((v) => !v)} title={isIndividualMode ? "Reveal or hide the individual leaderboard" : "Switch between team and individual standings"}>
                <Users size={14} strokeWidth={2.3} /> {showIndividual ? (isIndividualMode ? "Hide standings" : "Show teams") : (isIndividualMode ? "Reveal standings" : "Show individuals")}
              </button>
              {!isIndividualMode && !showIndividual && (
                <button style={s.pollBtn} onClick={() => setRankByTotal((v) => !v)} title={rankByTotal ? "Rank teams by accuracy — % of the team's answers that were correct (size-fair)" : "Rank teams by raw total correct answers (favors bigger teams)"}>
                  <Trophy size={14} strokeWidth={2.3} /> {rankByTotal ? "Ranked by total · switch to %" : "Ranked by % correct"}
                </button>
              )}
            </div>
            {showIndividual ? (
              individuals.length > 0 ? (
                <div style={s.pollStats}>
                  {individuals.map((p, i) => (
                    <div key={p.voter} style={{ ...s.teamRow, ...(i === 0 ? s.teamRowLead : {}) }}>
                      <span style={s.teamRank}>{i === 0 ? <Crown size={20} strokeWidth={2.4} color="#f2c14e" /> : i + 1}</span>
                      <span style={s.teamName}>{p.name}</span>
                      <span style={s.teamMembers}>{p.score} correct · {p.answered} answered</span>
                      <span style={s.teamScore}>{p.answered > 0 ? Math.round((p.score / p.answered) * 100) : 0}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#aeb4c0", fontSize: 15 }}>No one answered this session.</p>
              )
            ) : isIndividualMode ? (
              <p style={{ color: "#aeb4c0", fontSize: 15 }}>Hidden until revealed — tap "Reveal standings" when you're ready for the drumroll.</p>
            ) : standings.length > 0 ? (
              <div style={s.pollStats}>
                {standings.map((t, i) => (
                  <div key={t.team} style={{ ...s.teamRow, ...(i === 0 ? s.teamRowLead : {}) }}>
                    <span style={s.teamRank}>{i === 0 ? <Crown size={20} strokeWidth={2.4} color="#f2c14e" /> : i + 1}</span>
                    <span style={s.teamName}>{t.team}</span>
                    <span style={s.teamMembers}>{t.members} {t.members === 1 ? "player" : "players"} · {t.correct}/{t.answered} answers correct</span>
                    <span style={s.teamScore}>{rankByTotal ? `${t.score} pts` : `${t.answered > 0 ? Math.round((t.correct / t.answered) * 100) : 0}%`}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#aeb4c0", fontSize: 15 }}>No teams joined this session.</p>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
              <button style={s.pollBtn} onClick={() => setShowAnswerKey((v) => !v)}>
                <ListChecks size={15} strokeWidth={2.3} /> {showAnswerKey ? "Hide answer key" : "Show answer key"}
              </button>
              <button style={s.pollBtn} onClick={() => exportPptx(set, "prite-poll-set.pptx", true, true)} title="Question + reveal + explanation slide per question">
                <Download size={15} strokeWidth={2.3} /> PowerPoint
              </button>
              {standings.length > 0 && (
                <button style={s.pollBtn} onClick={() => exportPollTeams(standings, { code, index: total, total })}>
                  <Download size={15} strokeWidth={2.3} /> Team stats (Excel)
                </button>
              )}
              {officialStatus === "idle" && (
                <button style={s.pollBtn} onClick={() => setOfficialStatus("confirm")} title="Only for an official class group-review session">
                  <Archive size={15} strokeWidth={2.3} /> Mark as official
                </button>
              )}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }} title="Adjust answer-key text size">
                <button
                  style={{ ...s.pollBtn, padding: "8px 10px", opacity: standingsFontSize <= 14 ? 0.4 : 1, cursor: standingsFontSize <= 14 ? "default" : "pointer" }}
                  onClick={() => setStandingsFontSize((v) => Math.max(14, v - 2))}
                  disabled={standingsFontSize <= 14}
                  title="Decrease text size"
                >
                  <Minus size={15} strokeWidth={2.3} />
                </button>
                <span style={{ fontSize: 13, color: "#9aa0ab", width: 30, textAlign: "center" }}>{standingsFontSize}px</span>
                <button
                  style={{ ...s.pollBtn, padding: "8px 10px", opacity: standingsFontSize >= 32 ? 0.4 : 1, cursor: standingsFontSize >= 32 ? "default" : "pointer" }}
                  onClick={() => setStandingsFontSize((v) => Math.min(32, v + 2))}
                  disabled={standingsFontSize >= 32}
                  title="Increase text size"
                >
                  <Plus size={15} strokeWidth={2.3} />
                </button>
              </div>
              {officialStatus === "sending" && (
                <span style={{ display: "inline-flex", alignItems: "center", color: "#9aa0ab", fontSize: 14 }}>Submitting…</span>
              )}
              {officialStatus === "done" && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#48c78e", fontSize: 14, fontWeight: 600 }}>
                  <Check size={15} strokeWidth={2.6} /> Marked as official — sent to admin
                </span>
              )}
            </div>
            {officialStatus === "confirm" && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "rgba(224,138,60,.12)", border: "1px solid rgba(224,138,60,.35)", borderRadius: 10, padding: "12px 14px", marginTop: -6, marginBottom: 18, fontSize: 13.5, color: "#e7eaf0" }}>
                <span>Only do this if you're sharing results of an official class PRITE review session — it's sent to the site admin.</span>
                <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                  <button style={{ ...s.pollBtn, ...s.pollBtnPrimary }} onClick={submitOfficial}>Yes, submit</button>
                  <button style={s.pollBtn} onClick={() => setOfficialStatus("idle")}>Cancel</button>
                </div>
              </div>
            )}
            {showAnswerKey && (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, color: "#7b8394" }}>
                  <span>Review priority:</span>
                  <span style={{ display: "inline-flex", alignItems: "center", height: 8, width: 90, borderRadius: 4, background: "linear-gradient(90deg, rgb(72,199,142), rgb(224,138,60))" }} />
                  <span>fewer wrong → more wrong</span>
                </div>
                <div style={{ display: "grid", gap: 6, gridTemplateColumns: "minmax(0, 1fr)" }}>
                {set.map((qq, i) => {
                  const open = expandedKey.has(i);
                  const correct = keyFor(qq);
                  const qqid = questionId(qq.year, qq.q_index);
                  const qTally = votesRef.current.get(qqid) ?? new Map<string, string[]>();
                  const qTotalVotes = qTally.size;
                  const qWrongVotes = [...qTally.values()].filter((picks) => !pickIsCorrect(picks, correct)).length;
                  const reviewColor = qTotalVotes > 0 ? wrongPctColor(qWrongVotes / qTotalVotes) : "transparent";
                  return (
                    <div key={i} style={{ background: "rgba(255,255,255,.04)", borderRadius: 8, borderLeft: `4px solid ${reviewColor}` }}>
                      <button
                        onClick={() => toggleKey(i)}
                        style={{ display: "flex", width: "100%", gap: 10, alignItems: "baseline", minWidth: 0, fontSize: 14.5, color: "#c7ccd6", padding: "7px 10px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", font: "inherit" }}
                      >
                        {open ? <ChevronDown size={14} strokeWidth={2.4} color="#7b8394" style={{ flexShrink: 0 }} /> : <ChevronRight size={14} strokeWidth={2.4} color="#7b8394" style={{ flexShrink: 0 }} />}
                        <b style={{ color: "#7b8394", minWidth: 24 }}>{i + 1}.</b>
                        <span style={{ color: "#7b8394", whiteSpace: "nowrap" }}>{qq.year} · Q{qq.q_index}</span>
                        {!open && (
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{qq.stem}</span>
                        )}
                        {open && <span style={{ flex: 1 }} />}
                        {qTotalVotes > 0 && (
                          <span style={{ fontSize: 12, color: "#9aa0ab", whiteSpace: "nowrap" }} title="Wrong votes / total votes">
                            {qWrongVotes}/{qTotalVotes} wrong
                          </span>
                        )}
                        <b style={{ color: "#48c78e", whiteSpace: "nowrap" }}>{correct.join(", ")}</b>
                      </button>
                      {open && (
                        <div style={{ padding: "2px 16px 16px 34px" }}>
                          <p style={{ margin: "0 0 10px", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: standingsFontSize, lineHeight: 1.5, color: "#e7eaf0" }}>{qq.stem}</p>
                          <div style={{ display: "grid", gap: 3, marginBottom: 12 }}>
                            {qq.options.map((o) => {
                              const isC = correct.includes(o.letter);
                              return (
                                <div key={o.letter} style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: standingsFontSize, color: isC ? "#48c78e" : "#c7ccd6", fontWeight: isC ? 700 : 400 }}>
                                  {o.letter}. {o.text}{isC ? " ✓" : ""}
                                </div>
                              );
                            })}
                          </div>
                          {qq.explanation_text || qq.explanation_images.length > 0 ? (
                            <>
                              {qq.explanation_text && (
                                <p style={{ margin: "0 0 10px", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: standingsFontSize, lineHeight: 1.6, color: "#aeb4c0", whiteSpace: "pre-wrap" }}>{qq.explanation_text}</p>
                              )}
                              {qq.explanation_images.filter((p) => imgSrc(p)).map((p, i) => (
                                <img
                                  key={i} src={imgSrc(p)} alt="explanation" loading="lazy"
                                  title="Click to enlarge"
                                  onClick={() => setZoomImg(imgSrc(p))}
                                  style={{ ...s.explImg, maxWidth: 420, maxHeight: 240, width: "auto", height: "auto", objectFit: "contain", cursor: "zoom-in" }}
                                />
                              ))}
                            </>
                          ) : (
                            <p style={{ margin: 0, fontSize: 14, color: "#7b8394", fontStyle: "italic" }}>No explanation available for this question.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
              </div>
            )}
          </>
        ) : !started ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 16, minHeight: "40vh" }}>
            <div style={{ fontSize: "clamp(24px,4vw,44px)", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>Ready when you are</div>
            <p style={{ fontSize: "clamp(15px,1.8vw,20px)", color: T.muted, maxWidth: 640, margin: 0, lineHeight: 1.5 }}>
              Participants join by scanning the QR code or entering code <b style={{ color: "#fff" }}>{code}</b> at <b style={{ color: "#fff" }}>{joinHost}</b>.
              {" "}Press <b style={{ color: "#48c78e" }}>Start poll</b> below when everyone's in — the first question stays hidden until then.
            </p>
            {qr && (
              <button
                onClick={() => setQrBig(true)}
                title="Tap to enlarge"
                className="materialize"
                style={{ background: "#fff", border: "none", borderRadius: 26, padding: "clamp(14px, 2vh, 22px)", cursor: "zoom-in", lineHeight: 0, boxShadow: "0 34px 80px -32px rgba(0,0,0,.75)", margin: "6px 0 2px" }}
              >
                <img src={qr} alt={`QR code to join poll ${code}`} style={{ display: "block", width: "min(42vh, 62vw, 340px)", height: "min(42vh, 62vw, 340px)" }} />
              </button>
            )}
            <div style={{ fontSize: "clamp(18px,2.4vw,28px)", fontWeight: 700, color: joinedCount > 0 ? "#48c78e" : T.faint }}>
              <Users size={24} strokeWidth={2.4} style={{ verticalAlign: "-5px", marginRight: 8 }} />
              {joinedCount} {joinedCount === 1 ? "participant" : "participants"} joined
            </div>
          </div>
        ) : (
          <>
        {/* Standings never sit on screen automatically during the poll, in
            either mode — the room shouldn't see who's winning until the host
            chooses to reveal it. Once the current question's answer is
            revealed the host can peek at the leaderboard; the peek resets on
            every question change (goTo), so it's never left open by accident. */}
        {revealed && (isIndividualMode ? individuals.length > 0 : standings.length > 0) && (
          peekStandings ? (
            <div style={s.pollStatsLive}>
              <div style={s.pollStatsHead}>
                <span style={s.teamBoardHead}><Trophy size={16} strokeWidth={2.4} /> Current standings</span>
                <span style={{ display: "inline-flex", gap: 8 }}>
                  {!isIndividualMode && (
                    <button style={s.pollStatsExport} onClick={() => setRankByTotal((v) => !v)} title={rankByTotal ? "Rank teams by accuracy — % of the team's answers that were correct (size-fair)" : "Rank teams by raw total correct answers (favors bigger teams)"}>
                      <Trophy size={14} strokeWidth={2.3} /> {rankByTotal ? "By total" : "By %"}
                    </button>
                  )}
                  {!isIndividualMode && (
                    <button style={s.pollStatsExport} onClick={() => exportPollTeams(standings, { code, index: index + 1, total })} title="Download team data (opens in Excel)">
                      <Download size={14} strokeWidth={2.3} /> Export to Excel
                    </button>
                  )}
                  <button style={s.pollStatsExport} onClick={() => setPeekStandings(false)} title="Hide the standings again">
                    <Users size={14} strokeWidth={2.3} /> Hide
                  </button>
                </span>
              </div>
              {isIndividualMode
                ? individuals.map((p, i) => (
                    <div key={p.voter} style={{ ...s.teamRow, ...(i === 0 ? s.teamRowLead : {}) }}>
                      <span style={s.teamRank}>{i === 0 ? <Crown size={20} strokeWidth={2.4} color="#f2c14e" /> : i + 1}</span>
                      <span style={s.teamName}>{p.name}</span>
                      <span style={s.teamMembers}>{p.score} correct · {p.answered} answered</span>
                      <span style={s.teamScore}>{p.answered > 0 ? Math.round((p.score / p.answered) * 100) : 0}%</span>
                    </div>
                  ))
                : standings.map((t, i) => (
                    <div key={t.team} style={{ ...s.teamRow, ...(i === 0 ? s.teamRowLead : {}) }}>
                      <span style={s.teamRank}>{i === 0 ? <Crown size={20} strokeWidth={2.4} color="#f2c14e" /> : i + 1}</span>
                      <span style={s.teamName}>{t.team}</span>
                      <span style={s.teamMembers}>{t.members} {t.members === 1 ? "player" : "players"} · {t.correct}/{t.answered} answers correct</span>
                      <span style={s.teamScore}>{rankByTotal ? `${t.score} pts` : `${t.answered > 0 ? Math.round((t.correct / t.answered) * 100) : 0}%`}</span>
                    </div>
                  ))}
            </div>
          ) : (
            <button style={{ ...s.pollBtn, marginBottom: 14 }} onClick={() => setPeekStandings(true)} title="Peek at the leaderboard — hides again on the next question">
              <Trophy size={15} strokeWidth={2.3} /> Show current standings
            </button>
          )
        )}
        <div style={s.pollMeta}>
          {q.year} · Q{q.q_index} · Question {index + 1} of {total}
          {q.multi_select && <span style={{ ...s.multiTag, marginLeft: 10 }}><ListChecks size={12} strokeWidth={2.2} /> Select all that apply</span>}
        </div>
        <div style={{
          display: "flex",
          flexDirection: !hideChoices && choicesLayout === "side" ? "row" : "column",
          gap: !hideChoices && choicesLayout === "side" ? 40 : 0,
          alignItems: "flex-start",
        }}>
          <p style={{
            ...s.pollStem,
            fontSize: `calc(clamp(22px, 3.2vw, 38px) * ${pollStemScale})`,
            margin: !hideChoices && choicesLayout === "side" ? 0 : "0 0 28px",
            flex: !hideChoices && choicesLayout === "side" ? "1 1 46%" : undefined,
          }}>
            {q.stem}
          </p>
          {hideChoices ? (
            <p style={{ color: T.faint, fontStyle: "italic", fontSize: 15, margin: 0 }}>
              Answer choices are shown on participants' phones, not here.
            </p>
          ) : (
            <div style={{ ...s.pollOpts, flex: choicesLayout === "side" ? "1 1 50%" : undefined, width: choicesLayout === "side" ? undefined : "100%" }}>
              {q.options.map((o) => {
                const cnt = counts[o.letter] ?? 0;
                const pct = voterCount > 0 ? Math.round((cnt / voterCount) * 100) : 0;
                const isCorrect = revealed && correctSet.includes(o.letter);
                return (
                  <div key={o.letter} style={{ ...s.pollOpt, ...(isCorrect ? s.pollOptCorrect : {}), fontSize: `calc(clamp(17px, 2vw, 24px) * ${pollOptScale})` }}>
                    {/* tallies stay hidden until reveal so the room isn't biased by the crowd */}
                    <span style={{ ...s.pollBar, width: revealed ? `${pct}%` : 0, background: isCorrect ? "rgba(72,199,142,.22)" : "rgba(255,255,255,.08)" }} />
                    <span style={s.pollLetter}>{o.letter}</span>
                    <span style={s.pollOptText}>{o.text}</span>
                    <span style={s.pollOptCount}>
                      {revealed ? <>{pct}% · {cnt}{isCorrect && <Check size={20} strokeWidth={3} color="#48c78e" style={{ marginLeft: 10 }} />}</> : null}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {revealed && showExpl && (q.explanation_text || q.explanation_images.length > 0) && (
          <div style={{ marginTop: 26, padding: "18px 22px", background: "rgba(72,199,142,.06)", border: `1px solid ${T.inkLine}`, borderRadius: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#48c78e", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>
              <Lightbulb size={16} strokeWidth={2.4} /> Explanation
              {q.explanation_images.length > 0 && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 2, marginLeft: "auto", textTransform: "none", letterSpacing: 0, fontWeight: 500 }} title="Explanation image size">
                  <button
                    style={{ ...s.pollBtn, padding: "4px 7px", opacity: explImgScale <= 0.6 ? 0.4 : 1 }}
                    onClick={() => setExplImgScale((v) => Math.max(0.6, +(v - 0.15).toFixed(2)))}
                    disabled={explImgScale <= 0.6}
                    title="Shrink explanation images"
                  >
                    <Minus size={12} strokeWidth={2.4} />
                  </button>
                  <span style={{ fontSize: 11, color: "#9aa0ab", width: 32, textAlign: "center" }}>{Math.round(explImgScale * 100)}%</span>
                  <button
                    style={{ ...s.pollBtn, padding: "4px 7px", opacity: explImgScale >= 2.4 ? 0.4 : 1 }}
                    onClick={() => setExplImgScale((v) => Math.min(2.4, +(v + 0.15).toFixed(2)))}
                    disabled={explImgScale >= 2.4}
                    title="Enlarge explanation images"
                  >
                    <Plus size={12} strokeWidth={2.4} />
                  </button>
                </span>
              )}
            </div>
            {q.explanation_text && (
              <p style={{ margin: 0, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: `calc(clamp(16px, 1.7vw, 22px) * ${pollStemScale})`, lineHeight: 1.6, color: "#dfe3ea", whiteSpace: "pre-wrap" }}>{q.explanation_text}</p>
            )}
            {q.explanation_images.filter((p) => imgSrc(p)).map((p, i) => (
              <img
                key={i} src={imgSrc(p)} alt="explanation" loading="lazy"
                title="Click to enlarge" onClick={() => setZoomImg(imgSrc(p))}
                style={{ ...s.explImg, maxWidth: 780 * explImgScale, maxHeight: 460 * explImgScale, width: "auto", height: "auto", objectFit: "contain", cursor: "zoom-in", marginTop: 12 }}
              />
            ))}
          </div>
        )}
          </>
        )}
      </div>

      <div style={s.pollControls}>
        {finished ? (
          <>
            <button style={s.pollBtn} onClick={() => { setFinished(false); setShowAnswerKey(false); }}><ArrowLeft size={16} strokeWidth={2.4} /> Back to questions</button>
            <button style={{ ...s.pollBtn, ...s.pollBtnPrimary }} onClick={confirmClose}><X size={16} strokeWidth={2.4} /> End poll</button>
          </>
        ) : !started ? (
          <button style={{ ...s.pollBtn, ...s.pollBtnPrimary, fontSize: 16, padding: "12px 30px" }} onClick={() => setStarted(true)}>
            <Play size={18} strokeWidth={2.5} /> Start poll{joinedCount > 0 ? ` · ${joinedCount} joined` : ""}
          </button>
        ) : (
          <>
        <button style={s.pollBtn} disabled={index === 0} onClick={() => goTo(index - 1)}><ArrowLeft size={16} strokeWidth={2.4} /> Prev</button>
        {!revealed ? (
          <button style={{ ...s.pollBtn, ...s.pollBtnPrimary }} onClick={() => setRevealed(true)}><Check size={16} strokeWidth={2.6} /> Reveal answer</button>
        ) : (
          <span style={s.pollAnswerLine}>Answer: <b style={{ color: "#48c78e" }}>{correctSet.join(", ")}</b>{q.answer_text ? ` — ${q.answer_text}` : ""}</span>
        )}
        {revealed && (q.explanation_text || q.explanation_images.length > 0) && (
          <button style={{ ...s.pollBtn, ...(showExpl ? s.pollBtnPrimary : {}) }} onClick={() => setShowExpl((v) => !v)} title="Show this question's explanation on the big screen">
            <Lightbulb size={16} strokeWidth={2.3} /> {showExpl ? "Hide explanation" : "Show explanation"}
          </button>
        )}
        {index >= total - 1 && revealed ? (
          <button style={{ ...s.pollBtn, ...s.pollBtnPrimary }} onClick={finishPoll}><Trophy size={16} strokeWidth={2.4} /> Finish · standings</button>
        ) : (
          <>
            <button style={s.pollBtn} disabled={index >= total - 1} onClick={() => goTo(index + 1)}>Next <ArrowRight size={16} strokeWidth={2.4} /></button>
            <button style={s.pollBtn} onClick={finishPoll} title="Jump straight to final standings without going through the remaining questions">
              <Trophy size={16} strokeWidth={2.4} /> End early
            </button>
          </>
        )}
          </>
        )}
      </div>

      {qrBig && qr && (
        <div style={s.qrOverlay} onClick={() => setQrBig(false)}>
          <div style={s.qrCard} onClick={(e) => e.stopPropagation()}>
            <img src={qr} alt={`QR code to join poll ${code}`} style={s.qrBigImg} />
            <div style={s.qrCardCode}>{code}</div>
            <div style={s.qrCardUrl}>{joinHost}</div>
            <button style={s.pollBtn} onClick={() => setQrBig(false)}>Close</button>
          </div>
        </div>
      )}

      {zoomImg && (
        <div style={s.qrOverlay} onClick={() => setZoomImg(null)}>
          <img src={zoomImg} alt="Explanation, enlarged" style={s.zoomImg} onClick={(e) => e.stopPropagation()} />
          <button style={{ ...s.pollClose, position: "absolute", top: 20, right: 20 }} onClick={() => setZoomImg(null)} title="Close"><X size={18} strokeWidth={2.4} /></button>
        </div>
      )}

      {drumrollGif && (
        <div
          style={{ ...s.qrOverlay, zIndex: 96, flexDirection: "column", gap: 16, cursor: "pointer" }}
          onClick={() => { setDrumrollGif(null); setFinished(true); }}
          title="Tap to skip"
        >
          <img src={drumrollGif} alt="" style={{ maxWidth: "min(80vw, 560px)", maxHeight: "56vh", borderRadius: 16, boxShadow: "0 30px 80px -20px rgba(0,0,0,.7)" }} />
          <span style={{ color: "#fff", fontSize: 16, fontWeight: 700, letterSpacing: 0.3 }}>🥁 And the standings are…</span>
        </div>
      )}

      {endPrompt && (
        <div style={s.qrOverlay} onClick={() => { if (!endBusy) setEndPrompt(false); }}>
          <div style={s.endCard} onClick={(e) => e.stopPropagation()} className="rise">
            <p style={s.endCardTitle}>Before you end the poll —</p>
            <p style={s.endCardText}>
              Was this a <b style={{ color: "#fff" }}>large-group class review session</b> (the official
              Tuesday kind)? Official sessions' team standings and per-question stats are archived
              for the residency under admin → Polls&nbsp;&amp;&nbsp;Teams. Casual practice polls
              shouldn't be marked official.
            </p>
            {endError && (
              <p style={{ ...s.endCardText, color: "#e07a5f", marginTop: -8 }}>
                Couldn't submit the results — check the connection and try again.
              </p>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <button style={{ ...s.pollBtn, ...s.pollBtnPrimary, opacity: endBusy ? 0.6 : 1 }} disabled={endBusy} onClick={endOfficialAndClose}>
                <Archive size={15} strokeWidth={2.3} /> {endBusy ? "Submitting…" : "Yes — mark official & end"}
              </button>
              <button style={s.pollBtn} disabled={endBusy} onClick={onClose}>
                No, just practice — end poll
              </button>
              <button style={s.pollBtn} disabled={endBusy} onClick={() => setEndPrompt(false)}>
                Go back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const TEAM_KEY = "prite_poll_team";

function PollParticipant({ code, voter, trainingLevel, stableTeam, weeklyTeam, byId, displayName, onClose, guest = false }: {
  code: string; voter: string; trainingLevel: string | null; stableTeam: string | null; weeklyTeam: string | null;
  byId: Map<string, RawQuestion>; displayName: string; onClose: () => void;
  // Guest mode (no account — e.g. a med student joining via the ?poll link):
  // skips all persistence, and since there's no saved roster entry, stable/
  // weekly polls let the guest type the team they've been told to join.
  guest?: boolean;
}) {
  const [remote, setRemote] = useState<PollState | null>(null);
  const [myVote, setMyVote] = useState<string[] | null>(null); // the submitted vote — null until cast
  const [pendingPicks, setPendingPicks] = useState<string[]>([]); // multi-select taps before Submit
  const [status, setStatus] = useState<"connecting" | "joined" | "error">("connecting");
  const [team, setTeamState] = useState<string>(() => { try { return localStorage.getItem(TEAM_KEY) || ""; } catch { return ""; } });
  const [draft, setDraft] = useState(team);
  const [editing, setEditing] = useState(false);
  const [zoomImg, setZoomImg] = useState<string | null>(null); // explanation image, tap to enlarge full-screen
  const [reviewAddState, setReviewAddState] = useState<"idle" | "saving" | "done">("idle"); // adding missed questions to the personal Review queue
  // Question text is hidden by default (residents read it off the big screen)
  // — this is the pull-down "shade" that peeks it on the phone instead, for
  // whoever can't see the screen well. Collapses again on every new question.
  const [stemOpen, setStemOpen] = useState(false);
  const chanRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const lastQid = useRef<string>("");
  const teamRef = useRef(team);
  teamRef.current = team;
  const myVoteRef = useRef<string[] | null>(null);
  const vibratedQidRef = useRef<string | null>(null); // so a re-broadcast while still revealed doesn't re-fire the buzz
  // My own answer history for this session, keyed by qid — snapshotted the
  // moment each question is revealed (myVoteRef still reflects that question;
  // it's reset only once the NEXT qid comes in). Drives the missed-questions
  // download at the end, and lets me flip back through past questions (with
  // their full explanation, pulled from the local question bank) while the
  // live question is still on the clock.
  const historyRef = useRef<Map<string, { correct: string[]; myChoice: string[] | null; index: number }>>(new Map());
  const [reviewQid, setReviewQid] = useState<string | null>(null); // set while browsing a past question instead of the live one
  const recordedRef = useRef<Set<string>>(new Set()); // qids already persisted to poll_answers, so a re-broadcast doesn't double-insert

  // Set/clear my team and tell the host right away so it can roster me even
  // before I vote.
  const saveTeam = (name: string) => {
    let t = name.trim().slice(0, 24);
    // Guests join roster teams by typing the name off the big screen — the
    // standings tally by exact string, so canonicalize "team 3"/"TEAM3" to
    // "Team 3" for them (residents' free-typed self-mode names stay untouched).
    if (guest) { const m = /^team\s*(\d+)$/i.exec(t); if (m) t = `Team ${m[1]}`; }
    setTeamState(t); setDraft(t); setEditing(false);
    try { t ? localStorage.setItem(TEAM_KEY, t) : localStorage.removeItem(TEAM_KEY); schedulePrefsPush(); } catch { /* no-op */ }
    chanRef.current?.send({ type: "broadcast", event: POLL_EVENTS.hello, payload: { voter, team: t || undefined, level: trainingLevel || undefined, name: displayName || undefined } as PollHello });
  };

  useEffect(() => {
    if (!supabase) { setStatus("error"); return; }
    const ch = supabase.channel(channelName(code), { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: POLL_EVENTS.state }, ({ payload }: { payload: PollState }) => {
      if (payload.revealed && payload.qid) {
        historyRef.current.set(payload.qid, { correct: payload.correct, myChoice: myVoteRef.current, index: payload.index });
        const gotIt = !!myVoteRef.current && pickIsCorrect(myVoteRef.current, payload.correct);
        // Buzz once per reveal if I got it right — a re-broadcast while still
        // revealed (e.g. a late vote count update) shouldn't re-trigger it.
        if (gotIt && vibratedQidRef.current !== payload.qid) {
          vibratedQidRef.current = payload.qid;
          if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate([40, 60, 40]);
        }
        // Persist my own answer for the personal poll-stats page — once per
        // qid, and only if I actually voted (not for questions I sat out).
        // The DB column is a single TEXT field, so a multi-select pick joins
        // as "A,C" — nothing else reads it back apart from `correct`.
        if (!guest && voter !== "anon" && myVoteRef.current?.length && !recordedRef.current.has(payload.qid)) {
          recordedRef.current.add(payload.qid);
          recordPollAnswer({
            question_id: payload.qid,
            poll_code: code,
            team: teamRef.current || null,
            choice: myVoteRef.current.slice().sort().join(","),
            correct: gotIt,
          });
        }
      }
      setRemote(payload);
      if (payload.qid !== lastQid.current) { lastQid.current = payload.qid; setMyVote(null); myVoteRef.current = null; setPendingPicks([]); setReviewQid(null); setStemOpen(false); }
    });
    // Host ran the auto-assign shuffle — take the team it picked for me, unless
    // I've already got one (either from a prior shuffle or my own rename).
    ch.on("broadcast", { event: POLL_EVENTS.assign }, ({ payload }: { payload: PollAssign }) => {
      const assigned = payload?.assignments?.[voter];
      if (assigned && !teamRef.current) saveTeam(assigned);
    });
    ch.subscribe((st) => {
      if (st === "SUBSCRIBED") { setStatus("joined"); ch.send({ type: "broadcast", event: POLL_EVENTS.hello, payload: { voter, team: teamRef.current || undefined, level: trainingLevel || undefined, name: displayName || undefined } as PollHello }); }
      else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") setStatus("error");
    });
    chanRef.current = ch;
    return () => { supabase?.removeChannel(ch); chanRef.current = null; };
  }, [code, voter]); // eslint-disable-line

  // Stable/weekly modes: always use the saved roster's pick for me, not
  // whatever I last typed in for a self/auto session.
  useEffect(() => {
    if (guest) return; // guests have no saved roster entry — they pick a team by hand
    const rostered = remote?.teamMode === "stable" ? stableTeam : remote?.teamMode === "weekly" ? weeklyTeam : null;
    if (rostered && team !== rostered) saveTeam(rostered);
  }, [remote?.teamMode, stableTeam, weeklyTeam]); // eslint-disable-line

  // Drop lingering tap focus when the live question changes. The option
  // <button>s are keyed by letter, so React reuses the same element across
  // questions — the focus ring from last question's tap would carry onto the
  // same letter of the next question and read as a pre-selected answer
  // (same fix as the main practice view).
  useEffect(() => {
    const el = document.activeElement as HTMLElement | null;
    if (el && el.tagName === "BUTTON") el.blur();
  }, [remote?.qid]);

  // Casts (or replaces) my vote outright — single-select taps call this
  // directly with one letter each time; multi-select submits the whole
  // pending set at once via submitPending() below.
  const castVote = (letters: string[]) => {
    if (!remote || remote.revealed || !letters.length) return;
    setMyVote(letters);
    myVoteRef.current = letters;
    chanRef.current?.send({ type: "broadcast", event: POLL_EVENTS.vote, payload: { qid: remote.qid, choice: letters, voter, team: team || undefined, level: trainingLevel || undefined, name: displayName || undefined } });
  };
  // Single-select: tap a letter and it's cast immediately (tapping another
  // replaces it, same as before multi-select existed).
  const vote = (letter: string) => castVote([letter]);
  // Multi-select: tap toggles a letter in the LOCAL pending set — nothing is
  // sent until Submit, mirroring the "choose all that apply, then Submit"
  // flow from the personal practice quiz.
  const togglePending = (letter: string) => {
    if (!remote || remote.revealed || myVote) return;
    setPendingPicks((cur) => (cur.includes(letter) ? cur.filter((l) => l !== letter) : [...cur, letter]));
  };
  const submitPending = () => { if (pendingPicks.length) castVote(pendingPicks); };

  // Every question I saw revealed, that I either missed or never voted on —
  // built once the poll finishes, from the local question bank (byId) so the
  // export can include the full explanation (never broadcast over the poll
  // channel itself).
  const missedRows = () => {
    const rows: { q: RawQuestion; myChoice: string[] | null }[] = [];
    for (const [qid, h] of historyRef.current) {
      const q = byId.get(qid);
      if (!q) continue;
      if (!pickIsCorrect(h.myChoice ?? [], h.correct)) rows.push({ q, myChoice: h.myChoice });
    }
    return rows;
  };

  // Persist this session's missed questions into the same personal SM-2
  // review queue the regular practice mode uses (spaced_repetition table) —
  // a poll session is otherwise gone the moment it ends, with no way to come
  // back and drill what was missed. Guests have no account to save to.
  const addMissedToReview = async () => {
    const qids = [...historyRef.current.entries()]
      .filter(([, h]) => !pickIsCorrect(h.myChoice ?? [], h.correct))
      .map(([qid]) => qid);
    if (!qids.length) return;
    setReviewAddState("saving");
    await Promise.all(qids.map((qid) => ensureTrackedForReview(qid)));
    setReviewAddState("done");
  };

  const letters = remote ? Array.from({ length: remote.nOptions }, (_, i) => String.fromCharCode(65 + i)) : [];
  const isIndividualMode = remote?.teamMode === "individual";
  const isStableMode = remote?.teamMode === "stable" || remote?.teamMode === "weekly"; // both use a fixed saved roster
  const awaitingAutoAssign = remote?.teamMode === "auto" && !team;
  const awaitingStableTeam = isStableMode && !team && !guest;
  // Guests can always type a team — even in stable/weekly mode, where members
  // are locked to their saved roster seat (they have none).
  const showTeamEditor = !isIndividualMode && (!isStableMode || guest) && (editing || (!team && !awaitingAutoAssign));
  const inLobby = !!remote && !remote.started && !remote.finished;

  return (
    <div style={s.joinRoot}>
      <style>{CSS}</style>
      {/* Ambient arena room behind the card — fixed + pointer-events:none, so
          it's pure paint: it can't capture touches or alter document scroll. */}
      <div aria-hidden style={s.joinBackdrop}>
        <div className="imm-drift" style={s.joinBackdropImg} />
        <div style={s.joinBackdropTint} />
      </div>
      {/* One-shot fly-into-the-arena clip on join (token=1 plays on mount).
          ImmersiveFlash is a temporary fixed video that fades itself out —
          it never wraps the content, so the scroll model stays native. */}
      <ImmersiveFlash sceneKey="arena" dir="in" token={1} />
      <div style={s.joinCard}>
        <div style={s.joinHead}>
          <span style={s.pollLive}><Radio size={15} strokeWidth={2.4} /> Poll {code}</span>
          <button style={s.pollClose} onClick={onClose} title="Leave poll"><X size={16} strokeWidth={2.4} /></button>
        </div>

        {status !== "error" && isIndividualMode && (
          <div style={s.teamBar}>
            <span style={s.teamTag}><Users size={15} strokeWidth={2.3} /> Playing solo{displayName ? <> as <b style={{ color: "#fff" }}>{displayName}</b></> : ""}</span>
          </div>
        )}
        {status !== "error" && !isIndividualMode && (
          <div style={s.teamBar}>
            {showTeamEditor ? (
              <form
                style={s.teamForm}
                onSubmit={(e) => { e.preventDefault(); saveTeam(draft); }}
              >
                <Users size={15} strokeWidth={2.3} color="#aeb4c0" />
                <input
                  style={s.teamInput}
                  value={draft}
                  autoFocus={editing}
                  maxLength={24}
                  placeholder={guest && isStableMode ? "Team from the screen (e.g. Team 3)" : "Your team name"}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit" style={{ ...s.teamSet, ...(draft.trim() ? {} : s.teamSetOff) }} disabled={!draft.trim()}>
                  {team ? "Save" : "Join"}
                </button>
              </form>
            ) : awaitingAutoAssign ? (
              <span style={s.teamTag}><Users size={15} strokeWidth={2.3} /> Waiting for the host to assign teams…</span>
            ) : awaitingStableTeam ? (
              <span style={s.teamTag}><Users size={15} strokeWidth={2.3} /> {remote?.teamMode === "weekly" ? "No team on this week's pairing — ask an admin to re-randomize with you included." : "No season team on file — ask an admin to set your PGY year."}</span>
            ) : (
              <>
                <span style={s.teamTag}><Users size={15} strokeWidth={2.3} /> Team <b style={{ color: "#fff" }}>{team}</b></span>
                {(!isStableMode || guest) && <button style={s.teamChange} onClick={() => { setDraft(team); setEditing(true); }}>change</button>}
              </>
            )}
          </div>
        )}
        {status !== "error" && !isIndividualMode && !team && (
          <p style={s.teamScoreHint}>Teams are ranked by total correct answers — everyone's votes count toward the team score.</p>
        )}

        {status === "error" ? (
          <p style={s.joinMsg}>Couldn't connect to the poll. Double-check the code and try again.</p>
        ) : !remote ? (
          <p style={s.joinMsg}>Joined poll <b style={{ color: "#fff" }}>{code}</b> — waiting for the host to start…</p>
        ) : inLobby ? (
          <p style={s.joinMsg}>You're in! 🎉 Waiting for the host to start the poll…{(remote.joined ?? 0) > 0 ? ` ${remote.joined} ${remote.joined === 1 ? "person" : "people"} here so far.` : ""}</p>
        ) : (
          <>
            {reviewQid ? (() => {
              const rq = byId.get(reviewQid);
              const rh = historyRef.current.get(reviewQid);
              if (!rq) return <p style={s.joinMsg}>That question isn't available to review.</p>;
              const rCorrect = rh?.correct ?? [];
              const rMine = rh?.myChoice ?? [];
              const rGotIt = pickIsCorrect(rMine, rCorrect);
              return (
                <>
                  <div style={s.pollReviewHead}>
                    <span style={s.joinMsg}>Reviewing question {(rh?.index ?? 0) + 1}</span>
                    <button style={s.teamChange} onClick={() => setReviewQid(null)}><RotateCcw size={13} strokeWidth={2.4} /> Back to live</button>
                  </div>
                  <p style={s.joinMsg}>{rq.stem}</p>
                  <div style={s.joinOptsFull}>
                    {rq.options.map((o) => {
                      const isCorrect = rCorrect.includes(o.letter);
                      const isMine = rMine.includes(o.letter);
                      return (
                        <div key={o.letter} style={{ ...s.joinOptFull, cursor: "default", ...(isMine ? s.joinOptMine : {}), ...(isCorrect ? s.joinOptCorrect : {}), ...(isMine && !isCorrect ? s.joinOptWrong : {}) }}>
                          <span style={s.joinOptFullLetter}>{o.letter}</span>
                          <span style={{ flex: 1 }}>{o.text}</span>
                          {isCorrect && <Check size={18} strokeWidth={3} />}
                        </div>
                      );
                    })}
                  </div>
                  <p style={s.joinState}>
                    Answer: <b style={{ color: "#fff" }}>{rCorrect.join(", ")}</b>
                    {rMine.length ? (rGotIt ? " — you got it! 🎉" : ` — you picked ${rMine.join(", ")}`) : " — you didn't vote"}
                  </p>
                  {(rq.explanation_text || rq.explanation_images.length > 0) && (
                    <div style={s.joinExplBox}>
                      <span style={s.joinExplLabel}><Lightbulb size={13} strokeWidth={2.3} /> Explanation</span>
                      {rq.explanation_text && <p style={s.joinExpl}>{rq.explanation_text}</p>}
                      {rq.explanation_images.map((src, i) => <img key={i} src={src} alt="" style={{ ...s.joinExplImg, cursor: "zoom-in" }} onClick={() => setZoomImg(src)} />)}
                    </div>
                  )}
                </>
              );
            })() : (
              <>
                {!remote.finished && byId.size > 0 && (
                  <button
                    type="button"
                    style={s.stemPull}
                    onClick={() => setStemOpen((v) => !v)}
                  >
                    <span style={s.stemPullBar} />
                    <span style={s.stemPullLabel}>
                      {stemOpen ? <ChevronUp size={13} strokeWidth={2.4} /> : <ChevronDown size={13} strokeWidth={2.4} />}
                      {stemOpen ? "Hide question text" : "Show question text"}
                    </span>
                  </button>
                )}
                {!remote.finished && stemOpen && (
                  <p style={s.stemPeek}>{byId.get(remote.qid)?.stem}</p>
                )}
                <p style={s.joinMsg}>
                  {remote.finished
                    ? <>Poll complete — thanks for playing! 🎉</>
                    : remote.multiSelect
                    ? <>Question {remote.index + 1} of {remote.total} — read it on the big screen, then select ALL that apply.</>
                    : <>Question {remote.index + 1} of {remote.total} — read it on the big screen, then tap your answer.</>}
                </p>
                {!remote.finished && !remote.revealed && (remote.joined ?? 0) > 0 && (
                  <p style={{ ...s.joinState, marginTop: 0 }}>{remote.voted ?? 0} of {remote.joined} voted</p>
                )}
                {!remote.finished && (
                <div style={s.joinOptsFull}>
                  {(remote.options?.length ? remote.options : letters.map((L) => ({ letter: L, text: "" }))).map((o) => {
                    const mine = remote.multiSelect
                      ? (myVote ? myVote.includes(o.letter) : pendingPicks.includes(o.letter))
                      : myVote?.[0] === o.letter;
                    const correct = remote.revealed && remote.correct.includes(o.letter);
                    const wrong = remote.revealed && mine && !correct;
                    const locked = remote.revealed || (remote.multiSelect && !!myVote);
                    return (
                      <button
                        key={o.letter}
                        onClick={() => (remote.multiSelect ? togglePending(o.letter) : vote(o.letter))}
                        disabled={locked}
                        style={{ ...s.joinOptFull, ...(mine ? s.joinOptMine : {}), ...(correct ? s.joinOptCorrect : {}), ...(wrong ? s.joinOptWrong : {}) }}
                      >
                        <span style={s.joinOptFullLetter}>{o.letter}</span>
                        <span style={{ flex: 1 }}>{o.text}</span>
                        {(correct || wrong) && <span>{correct ? "✓" : "✗"}</span>}
                      </button>
                    );
                  })}
                </div>
                )}
                {!remote.finished && remote.multiSelect && !remote.revealed && !myVote && (
                  <button
                    style={{ ...s.pollBtn, ...(pendingPicks.length ? s.pollBtnPrimary : {}), width: "100%", justifyContent: "center", marginTop: 10 }}
                    onClick={submitPending}
                    disabled={!pendingPicks.length}
                  >
                    <Check size={15} strokeWidth={2.6} /> Submit{pendingPicks.length ? ` (${pendingPicks.length})` : ""}
                  </button>
                )}
                {!remote.finished && (
                <p style={s.joinState}>
                  {remote.revealed
                    ? <>Answer: <b style={{ color: "#fff" }}>{remote.correct.join(", ")}</b>{myVote?.length ? (pickIsCorrect(myVote, remote.correct) ? " — you got it! 🎉" : ` — you picked ${myVote.join(", ")}`) : " — you didn't vote"}</>
                    : myVote?.length ? `You picked ${myVote.join(", ")}.${remote.multiSelect ? "" : " Tap another to change it."}`
                    : remote.multiSelect ? "Tap all that apply, then Submit." : "Tap a letter to cast your vote."}
                </p>
                )}
                {!remote.finished && remote.revealed && (() => {
                  const cq = byId.get(remote.qid);
                  if (!cq || (!cq.explanation_text && cq.explanation_images.length === 0)) return null;
                  return (
                    <div style={s.joinExplBox}>
                      <span style={s.joinExplLabel}><Lightbulb size={13} strokeWidth={2.3} /> Explanation</span>
                      {cq.explanation_text && <p style={s.joinExpl}>{cq.explanation_text}</p>}
                      {cq.explanation_images.map((src, i) => <img key={i} src={src} alt="" style={{ ...s.joinExplImg, cursor: "zoom-in" }} onClick={() => setZoomImg(src)} />)}
                    </div>
                  );
                })()}
              </>
            )}
            {historyRef.current.size > 0 && byId.size > 0 && (
              <div style={s.pollReviewBar}>
                <span style={s.pollReviewBarLabel}><ListChecks size={13} strokeWidth={2.3} /> Review a past question{!remote.finished ? " while you wait" : ""}:</span>
                <div style={s.pollReviewChipsRow}>
                  {[...historyRef.current.entries()].sort((a, b) => a[1].index - b[1].index).map(([qid, h]) => (
                    <button key={qid} style={{ ...s.pollReviewChip, ...(qid === reviewQid ? s.pollReviewChipActive : {}) }} onClick={() => setReviewQid(qid)}>
                      Q{h.index + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(remote.finished || remote.revealed) && isIndividualMode && (remote.individuals?.length ?? 0) > 0 && (
              <div style={s.teamBoardMini}>
                {remote.individuals!.slice(0, 5).map((p, i) => (
                  <div key={p.voter} style={{ ...s.teamMiniRow, ...(i === 0 ? s.teamMiniLead : {}), ...(p.voter === voter ? s.teamMiniMine : {}) }}>
                    <span style={s.teamMiniRank}>{i === 0 ? <Crown size={15} strokeWidth={2.4} color="#f2c14e" /> : i + 1}</span>
                    <span style={s.teamMiniName}>{p.name}{p.voter === voter ? " (you)" : ""}</span>
                    <span style={s.teamMiniScore}>{p.score}/{p.answered}</span>
                  </div>
                ))}
              </div>
            )}
            {(remote.finished || remote.revealed) && !isIndividualMode && remote.standings?.length > 0 && (
              <div style={s.teamBoardMini}>
                {remote.standings.slice(0, 5).map((t, i) => (
                  <div key={t.team} style={{ ...s.teamMiniRow, ...(i === 0 ? s.teamMiniLead : {}), ...(t.team === team ? s.teamMiniMine : {}) }}>
                    <span style={s.teamMiniRank}>{i === 0 ? <Crown size={15} strokeWidth={2.4} color="#f2c14e" /> : i + 1}</span>
                    <span style={s.teamMiniName}>{t.team}{t.team === team ? " (you)" : ""}</span>
                    {/* Match the host's ranking metric; fall back to points when an
                        older host build broadcasts without rankBy/answered. */}
                    <span style={s.teamMiniScore}>{remote.rankBy !== "total" && t.answered > 0 ? `${Math.round((t.correct / t.answered) * 100)}%` : `${t.score} pts`}</span>
                  </div>
                ))}
              </div>
            )}
            {!isIndividualMode && remote.standings && remote.standings.length > 0 && (
              <button
                style={s.teamDownload}
                onClick={() => exportPollTeams(remote.standings, { code, index: remote.index + 1, total: remote.total })}
              >
                <Download size={13} strokeWidth={2.3} /> Download team stats (Excel)
              </button>
            )}
            {remote.finished && byId.size > 0 && (
              <button
                style={s.teamDownload}
                onClick={() => exportPollMissed(missedRows(), { code, who: displayName })}
                title="A PDF study sheet of just the questions you missed, with the full explanation for each"
              >
                <Download size={13} strokeWidth={2.3} /> Download my missed questions (PDF)
              </button>
            )}
            {remote.finished && !guest && byId.size > 0 && (
              <button
                style={s.teamDownload}
                onClick={addMissedToReview}
                disabled={reviewAddState !== "idle"}
                title="Add everything you missed this session to your personal spaced-repetition Review queue"
              >
                {reviewAddState === "done"
                  ? <><Check size={13} strokeWidth={2.6} /> Added to Review</>
                  : reviewAddState === "saving"
                  ? "Adding…"
                  : <><ListChecks size={13} strokeWidth={2.3} /> Add missed to Review</>}
              </button>
            )}
          </>
        )}
      </div>

      {zoomImg && (
        <div style={s.qrOverlay} onClick={() => setZoomImg(null)}>
          <img src={zoomImg} alt="Explanation, enlarged" style={s.zoomImg} onClick={(e) => e.stopPropagation()} />
          <button style={{ ...s.pollClose, position: "absolute", top: 20, right: 20 }} onClick={() => setZoomImg(null)} title="Close"><X size={18} strokeWidth={2.4} /></button>
        </div>
      )}
    </div>
  );
}

// --- guest poll access ------------------------------------------------------
// Visitors without an account (e.g. med students rotating through didactics)
// can join a live poll straight from its ?poll=CODE link. Everything a
// participant needs travels over the Realtime broadcast channel (choices,
// reveals, standings), so no sign-in or DB access is required — the guest just
// supplies a display name. Each device gets a random persistent voter id (the
// host tallies votes per id, so guests must not share one), answers are never
// persisted, and bank-dependent extras (stem shade, review, missed-questions
// export) are hidden because guests have no local question bank.
const GUEST_ID_KEY = "prite_guest_voter";
const GUEST_NAME_KEY = "prite_guest_name";
const EMPTY_BANK = new Map<string, RawQuestion>();

function guestVoterId(): string {
  try {
    const cur = localStorage.getItem(GUEST_ID_KEY);
    if (cur) return cur;
    const id = "guest-" + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(GUEST_ID_KEY, id);
    return id;
  } catch {
    return "guest-" + Math.random().toString(36).slice(2, 10);
  }
}

function GuestPoll({ code, onClose }: { code: string; onClose: () => void }) {
  const [name, setName] = useState<string>(() => { try { return localStorage.getItem(GUEST_NAME_KEY) || ""; } catch { return ""; } });
  const [draft, setDraft] = useState(name);
  const [joined, setJoined] = useState(false);
  const voter = useMemo(guestVoterId, []);

  if (!joined) {
    return (
      <Center>
        <div style={{ maxWidth: 360, textAlign: "left", background: "#181c24", border: "1px solid #2a3040", borderRadius: 14, padding: "22px 20px" }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 19, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
            <Radio size={18} strokeWidth={2.4} color="#4fd1c5" /> Join poll {code}
          </h2>
          <p style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.5, color: "#aeb4c0" }}>
            You're joining as a <b style={{ color: "#e7eaf0" }}>guest</b> — no account needed. What name should the host see?
          </p>
          <form
            style={{ display: "flex", gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              const n = draft.trim().slice(0, 24);
              if (!n) return;
              try { localStorage.setItem(GUEST_NAME_KEY, n); } catch { /* no-op */ }
              setName(n); setJoined(true);
            }}
          >
            <input style={s.teamInput} value={draft} autoFocus maxLength={24} placeholder="Your name" onChange={(e) => setDraft(e.target.value)} />
            <button type="submit" style={{ ...s.teamSet, ...(draft.trim() ? {} : s.teamSetOff) }} disabled={!draft.trim()}>Join</button>
          </form>
          <p style={{ margin: "14px 0 0", fontSize: 12, color: "#7b8494" }}>
            A resident? <a href="/" style={{ color: "#4fd1c5" }}>Sign in instead</a> so your answers count toward your stats.
          </p>
        </div>
      </Center>
    );
  }

  return (
    <PollParticipant
      code={code}
      voter={voter}
      guest
      trainingLevel={null}
      stableTeam={null}
      weeklyTeam={null}
      byId={EMPTY_BANK}
      displayName={`${name} (guest)`}
      onClose={onClose}
    />
  );
}

// A field of balloons drifting up the whole screen — a celebratory backdrop for
// the login-streak reward. Hue-rotate gives each 🎈 a different color; varied
// position/size/timing keeps it from looking like a marching grid.
function Balloons() {
  const N = 18;
  return (
    <div style={s.balloonField} aria-hidden>
      {Array.from({ length: N }, (_, i) => (
        <span
          key={i}
          className={i % 2 ? "balloonRiseB" : "balloonRiseA"}
          style={{
            left: `${(i + 0.5) * (100 / N)}%`,
            fontSize: 30 + (i % 4) * 9,
            animationDelay: `${(i % 6) * 0.26}s`,
            animationDuration: `${4.8 + (i % 5) * 0.5}s`,
            filter: `hue-rotate(${(i * 53) % 360}deg)`,
          }}
        >
          🎈
        </span>
      ))}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...s.root, display: "grid", placeItems: "center", color: "#c7ccd6", fontFamily: "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif", padding: 40, textAlign: "center" }}>
      <div>{children}</div>
    </div>
  );
}

// Animated backdrop for the sign-in gate: slow-drifting aurora glows, a
// gently panning dot grid, teal sparks rising like embers, and ghosted
// psych-themed icons floating in the depth. Pure CSS classes (in the CSS
// string), transform/opacity only. Deliberately NO filter: blur() — the glow
// falloff is baked into the radial gradients instead, because huge blurred
// layers overflow the compositor's GPU budget and get dropped mid-session
// (the card literally stopped painting). Everything here is disabled under
// prefers-reduced-motion.
const GATE_GHOSTS = [Brain, Pill, HeartPulse, BookOpen, GraduationCap, Stethoscope];
// Three depth layers, each its own .gateParallax wrapper so the cursor
// nudges them by a different amount (see --mx/--my on gateRoot in SignIn) —
// far things drift a little, near things drift a lot, giving the backdrop a
// sense of depth without touching any element's own keyframe animation.
function GateBackdrop() {
  return (
    <div className="gateAurora" aria-hidden>
      <div className="gateParallax gateParallaxFar">
        <span className="gateBlob gateBlobA" />
        <span className="gateBlob gateBlobB" />
        <span className="gateBlob gateBlobC" />
        <span className="gateGrid" />
      </div>
      <div className="gateParallax gateParallaxMid">
        {GATE_GHOSTS.map((Icon, i) => (
          <span
            key={i}
            className="gateGhost"
            style={{
              left: `${6 + i * 16}%`,
              top: `${14 + ((i * 37) % 62)}%`,
              animationDelay: `${i * 1.3}s`,
              animationDuration: `${11 + (i % 4) * 2.4}s`,
            }}
          >
            <Icon size={26 + (i % 3) * 12} strokeWidth={1.4} />
          </span>
        ))}
      </div>
      <div className="gateParallax gateParallaxNear">
        {Array.from({ length: 16 }, (_, i) => (
          <span
            key={`sp${i}`}
            className="gateSpark"
            style={{
              left: `${(i * 61) % 100}%`,
              width: 3 + (i % 3) * 2,
              height: 3 + (i % 3) * 2,
              animationDelay: `${(i * 0.9) % 8}s`,
              animationDuration: `${8 + (i % 5) * 1.7}s`,
            }}
          />
        ))}
        {RIBBON_VARIANTS.map((variant, i) => <RibbonBurst key={i} variant={variant} />)}
      </div>
    </div>
  );
}

// A gradient curve that periodically splits into a fan of ribbons and
// settles back, looping forever behind the card. Several instances are
// scattered around the scene (see RIBBON_VARIANTS below), each its own
// size/angle/opacity and out of phase with the others via a negative
// animation-delay, so they don't all burst in unison.
const RIBBON_OFFSETS = [-90, -75, -60, -45, -30, -15, 0, 15, 30, 45, 60, 75, 90];
type RibbonVariant = {
  top: string; left: string; width: string; height: string;
  rotate: number; opacity: number; phase: number; // phase: seconds into the 7s cycle to start at
};
const RIBBON_VARIANTS: RibbonVariant[] = [
  { top: "48%", left: "52%", width: "46vmin", height: "92vmin", rotate: 0, opacity: 0.55, phase: 0 },
  { top: "16%", left: "12%", width: "24vmin", height: "50vmin", rotate: -22, opacity: 0.4, phase: -2.6 },
  { top: "84%", left: "88%", width: "26vmin", height: "54vmin", rotate: 16, opacity: 0.4, phase: -4.8 },
  { top: "78%", left: "10%", width: "20vmin", height: "42vmin", rotate: 100, opacity: 0.3, phase: -1.3 },
];
function RibbonBurst({ variant }: { variant: RibbonVariant }) {
  const baseDelay = `${variant.phase}s`;
  return (
    <div className="gateRibbon" aria-hidden style={{ opacity: variant.opacity }}>
      <svg
        className="gateRibbonSvg"
        viewBox="0 0 400 800"
        preserveAspectRatio="none"
        style={{
          top: variant.top,
          left: variant.left,
          width: variant.width,
          height: variant.height,
          transform: `translate(-50%, -50%) rotate(${variant.rotate}deg)`,
        }}
      >
        <defs>
          <linearGradient id="gateRibbonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00FFD5" />
            <stop offset="50%" stopColor="#FFFFFF" />
            <stop offset="75%" stopColor="#FF7A7A" />
            <stop offset="100%" stopColor="#8A2BE2" />
          </linearGradient>
        </defs>
        <path className="gateRibbonPath gateRibbonBase" d="M 0 3 C 0 251 2 438 198 436 C 299 434 412 438 407 900" style={{ animationDelay: baseDelay }} />
        {RIBBON_OFFSETS.map((dy, i) => (
          <path
            key={i}
            className="gateRibbonPath gateRibbonFan"
            d="M 0 3 C 0 251 2 438 198 436 C 299 434 412 438 407 900"
            style={{ "--dy": `${dy}px`, animationDelay: `${variant.phase + i * 0.03}s` } as React.CSSProperties}
          />
        ))}
      </svg>
    </div>
  );
}

function SignIn() {
  // Mouse-tracking 3D tilt + glare: moving anywhere on the screen leans the
  // card toward the cursor and slides a soft highlight across it. Written as
  // CSS-var updates on the ring element (no React re-render per mousemove).
  const ringRef = useRef<HTMLDivElement>(null);
  const onTilt = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ringRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const px = Math.max(-0.7, Math.min(0.7, (e.clientX - (r.left + r.width / 2)) / r.width));
      const py = Math.max(-0.7, Math.min(0.7, (e.clientY - (r.top + r.height / 2)) / r.height));
      el.style.setProperty("--tiltX", `${(-py * 6).toFixed(2)}deg`);
      el.style.setProperty("--tiltY", `${(px * 8).toFixed(2)}deg`);
      el.style.setProperty("--glareX", `${((px + 0.5) * 100).toFixed(1)}%`);
      el.style.setProperty("--glareY", `${((py + 0.5) * 100).toFixed(1)}%`);
    }
    // Background parallax: --mx/--my are set on the root and inherited by
    // every .gateParallax layer, each scaling them by its own depth — one
    // JS listener, no per-layer state or re-renders.
    const root = e.currentTarget;
    const rr = root.getBoundingClientRect();
    const mx = Math.max(-0.5, Math.min(0.5, (e.clientX - (rr.left + rr.width / 2)) / rr.width));
    const my = Math.max(-0.5, Math.min(0.5, (e.clientY - (rr.top + rr.height / 2)) / rr.height));
    root.style.setProperty("--mx", mx.toFixed(3));
    root.style.setProperty("--my", my.toFixed(3));
  };
  const onTiltEnd = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ringRef.current;
    if (el) {
      el.style.setProperty("--tiltX", "0deg");
      el.style.setProperty("--tiltY", "0deg");
    }
    e.currentTarget.style.setProperty("--mx", "0");
    e.currentTarget.style.setProperty("--my", "0");
  };

  return (
    <div style={s.gateRoot} onMouseMove={onTilt} onMouseLeave={onTiltEnd}>
      <style>{CSS}</style>
      <GateBackdrop />
      {/* the card's drop shadow moves to this ring wrapper — the ring clips
          its rotating gradient with overflow:hidden, which would clip a child
          card's shadow too */}
      <div ref={ringRef} className="gateRing gateTilt gateIn" style={{ width: "100%", maxWidth: 403 }}>
        <div style={{ ...s.gateCard, maxWidth: "none", boxShadow: "none" }}>
          <span style={s.gateMark} className="gateMarkAnim">
            <span className="gatePing" aria-hidden />
            <Stethoscope size={22} strokeWidth={2.3} color="#fff" />
          </span>
          <h1 style={s.gateTitle} className="gateShimmer gs1">PRITE Daily</h1>
          <p style={s.gateSub} className="gs2">Daily PRITE practice for the residency. Sign in with your Google account to continue.</p>
          <button style={s.googleBtn} className="gateBtn gs3" onClick={() => signInWithGoogle()}>
            <GoogleG /> Sign in with Google
          </button>
          <p style={s.gateFine} className="gs4">Residents and known faculty are approved automatically. Some faculty or alumni may still need admin approval.</p>
        </div>
      </div>
    </div>
  );
}

function Pending({ email, status }: { email: string; status: string }) {
  return (
    <div style={s.gateRoot}>
      <style>{CSS}</style>
      <GateBackdrop />
      <div style={s.gateCard}>
        <span style={{ ...s.gateMark, background: T.gold }}><Clock size={22} strokeWidth={2.3} color="#fff" /></span>
        <h1 style={s.gateTitle}>{status === "blocked" ? "Access blocked" : "Awaiting approval"}</h1>
        <p style={s.gateSub}>
          You’re signed in as <b style={{ color: "#fff" }}>{email}</b>.{" "}
          {status === "blocked"
            ? "An admin has blocked this account."
            : "An admin needs to approve you before you can start. You’ll get in as soon as they do."}
        </p>
        <button style={s.googleBtn} onClick={() => signOut()}><LogOut size={15} strokeWidth={2.2} /> Sign out</button>
      </div>
    </div>
  );
}

// "Report a problem" modal — any approved member can file an issue on a question.
const BUG_KINDS: [string, string][] = [
  ["wrong_answer", "Wrong / disputed answer"],
  ["typo", "Typo or formatting"],
  ["missing", "Missing text or image"],
  ["duplicate", "Duplicate question"],
  ["other", "Something else"],
];
// Kinds for a general "report a problem with the site" (not tied to a question).
const SITE_KINDS: [string, string][] = [
  ["bug", "Bug / something's broken"],
  ["feature", "Suggestion / feature request"],
  ["other", "Other feedback"],
];
function ReportModal({ qid, label, kinds = BUG_KINDS, onClose, onDone }: {
  qid: string | null; label: string; kinds?: [string, string][]; onClose: () => void; onDone: (ok: boolean) => void;
}) {
  const [kind, setKind] = useState(kinds[0][0]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    const ok = await submitBugReport({ question_id: qid, kind, message: message.trim(), context: label });
    setBusy(false);
    onDone(ok);
  };
  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 460 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Report a problem</div>
            <div style={s.apTitle}>{label}</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={{ padding: "4px 22px 20px" }}>
          <label style={s.lbl}>What's wrong?</label>
          <select style={s.reportSelect} value={kind} onChange={(e) => setKind(e.target.value)}>
            {kinds.map(([v, lblTxt]) => <option key={v} value={v}>{lblTxt}</option>)}
          </select>
          <label style={{ ...s.lbl, marginTop: 14 }}>Details</label>
          <textarea
            style={s.reportText}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe the issue — e.g. the answer key says B but it should be D because…"
            rows={4}
            autoFocus
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <button style={s.ghost} onClick={onClose}>Cancel</button>
            <button style={{ ...s.apApprove, opacity: message.trim() && !busy ? 1 : 0.5 }} onClick={submit} disabled={!message.trim() || busy}>
              {busy ? "Sending…" : "Send report"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Admin triage of all bug reports.
function BugReportsPanel({ reports, byId, isAdmin, onAct, onReply, onClose }: {
  reports: BugReport[];
  byId: Map<string, RawQuestion>;
  isAdmin: boolean;
  onAct: (id: string, status: string) => void;
  onReply: (id: string, text: string) => Promise<void>;
  onClose: () => void;
}) {
  const open = reports.filter((r) => r.status === "open");
  const done = reports.filter((r) => r.status !== "open");
  const kindLabel = (k: string) => BUG_KINDS.find(([v]) => v === k)?.[1] ?? k;
  // Admin reply composer: one open at a time, prefilled with the existing
  // reply so it doubles as the edit box.
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const startReply = (r: BugReport) => { setReplyFor(r.id); setReplyText(r.admin_response ?? ""); };
  const sendReply = async () => {
    if (!replyFor) return;
    setReplySending(true);
    await onReply(replyFor, replyText);
    setReplySending(false);
    setReplyFor(null);
  };
  const row = (r: BugReport) => {
    const q = r.question_id ? byId.get(r.question_id) : null;
    return (
      <div key={r.id} style={s.bugRow}>
        <div style={s.bugMeta}>
          <span style={s.bugKind}>{kindLabel(r.kind)}</span>
          {r.question_id && <span style={s.bugQ}>{r.question_id}</span>}
          <span style={s.bugWho}>{isAdmin ? (r.reporter?.full_name || r.reporter?.email || "—") + " · " : ""}{ago(r.created_at)}</span>
          <span style={{ ...s.bugStatus, color: r.status === "open" ? T.wrongText : T.faint }}>{r.status}</span>
        </div>
        {q && <div style={s.bugStem}>{q.stem}</div>}
        <p style={s.bugMsg}>{r.message}</p>
        {r.admin_response && replyFor !== r.id && (
          <div style={{ background: T.tealSoft, border: `1px solid ${T.paperEdge}`, borderRadius: 8, padding: "8px 10px", margin: "0 0 8px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.tealDeep, marginBottom: 3 }}>
              Reply from the admins{r.responded_at ? ` · ${ago(r.responded_at)}` : ""}
            </div>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{r.admin_response}</div>
          </div>
        )}
        {isAdmin && replyFor === r.id && (
          <div style={{ margin: "0 0 8px" }}>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Write a reply the reporter will see on their report…"
              style={{ width: "100%", boxSizing: "border-box", fontSize: 13, lineHeight: 1.5, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.paperEdge}`, background: "#fff", color: T.text, fontFamily: "inherit", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button style={s.apApprove} onClick={sendReply} disabled={replySending || !replyText.trim()}>
                {replySending ? "Sending…" : r.admin_response ? "Update reply" : "Send reply"}
              </button>
              <button style={s.ghost} onClick={() => setReplyFor(null)} disabled={replySending}>Cancel</button>
            </div>
          </div>
        )}
        {isAdmin && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {replyFor !== r.id && (
              <button style={s.ghost} onClick={() => startReply(r)}>{r.admin_response ? "Edit reply" : "Reply"}</button>
            )}
            {r.status !== "resolved" && <button style={s.apApprove} onClick={() => onAct(r.id, "resolved")}>Resolve</button>}
            {r.status === "open" && <button style={s.ghost} onClick={() => onAct(r.id, "dismissed")}>Dismiss</button>}
            {r.status !== "open" && <button style={s.ghost} onClick={() => onAct(r.id, "open")}>Reopen</button>}
          </div>
        )}
      </div>
    );
  };
  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 620 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>{isAdmin ? "Bug reports" : "My reports"}</div>
            <div style={s.apTitle}>{open.length} open · {reports.length} total</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.apBody}>
          {reports.length === 0 && <p style={s.apEmpty}>{isAdmin ? "No reports yet. 🎉" : "You haven't filed any reports yet — use \"Report a bug\" on any question."}</p>}
          {open.map(row)}
          {done.length > 0 && <div style={{ ...s.apEyebrow, margin: "16px 0 4px" }}>Closed</div>}
          {done.map(row)}
        </div>
      </div>
    </div>
  );
}

// Admin archive of "Mark as official" poll submissions — download everything
// as one CSV, or wipe the archive (e.g. once a year's group-review sessions
// are all done and safely downloaded).
function OfficialResultsPanel({ results, onClose, onCleared, onEditTeams }: {
  results: OfficialPollResult[];
  onClose: () => void;
  onCleared: () => void;
  onEditTeams: () => void;
}) {
  const [clearStage, setClearStage] = useState<"idle" | "confirm" | "clearing">("idle");
  const doClear = async () => {
    setClearStage("clearing");
    await clearOfficialPollResults();
    setClearStage("idle");
    onCleared();
  };
  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 620 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Admin · polls & teams</div>
            <div style={s.apTitle}>{results.length} official session{results.length === 1 ? "" : "s"}</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.apBody}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <button style={s.apApprove} onClick={onEditTeams}>
              <Users size={13} strokeWidth={2.4} style={{ marginRight: 5, verticalAlign: "-2px" }} />
              Edit season team rosters
            </button>
            <button
              style={{ ...s.apApprove, opacity: results.length ? 1 : 0.5 }}
              disabled={!results.length}
              onClick={() => exportOfficialPollResults(results)}
            >
              Download all (CSV)
            </button>
            {clearStage === "idle" && (
              <button
                style={{ ...s.apApprove, background: T.wrongLine, opacity: results.length ? 1 : 0.5 }}
                disabled={!results.length}
                onClick={() => setClearStage("confirm")}
              >
                Clear all results
              </button>
            )}
            {clearStage === "clearing" && <span style={{ fontSize: 13, color: T.muted }}>Clearing…</span>}
          </div>
          {clearStage === "confirm" && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: T.wrongBg, border: `1px solid ${T.wrongLine}`, borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 13.5, color: T.wrongText }}>
              <span>Permanently delete all {results.length} submitted session{results.length === 1 ? "" : "s"}? Make sure you've downloaded them first — this can't be undone.</span>
              <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button style={s.apApprove} onClick={doClear}>Yes, clear all</button>
                <button style={s.ghost} onClick={() => setClearStage("idle")}>Cancel</button>
              </div>
            </div>
          )}
          {results.length === 0 && <p style={s.apEmpty}>No official sessions submitted yet.</p>}
          {results.map((r) => {
            const worst = [...r.question_stats].sort((a, b) => b.wrongVotes - a.wrongVotes)[0];
            return (
              <div key={r.id} style={s.bugRow}>
                <div style={s.bugMeta}>
                  <span style={s.bugKind}>{r.poll_code}</span>
                  <span style={s.bugWho}>{r.submitter?.full_name || r.submitter?.email || "—"} · {ago(r.submitted_at)}</span>
                </div>
                <div style={{ fontSize: 13.5, color: T.muted }}>
                  {r.total_questions} question{r.total_questions === 1 ? "" : "s"} · {r.total_participants} participant{r.total_participants === 1 ? "" : "s"}
                  {worst && worst.totalVotes > 0 && ` · toughest: ${worst.year} Q${worst.q_index} (${worst.wrongVotes}/${worst.totalVotes} wrong)`}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// "Child Psychiatry" nav toggle — the CAPITE bank doesn't exist yet, so this
// is a friendly placeholder pointing volunteers at who's driving the effort.
function CapiteComingSoon({ onClose }: { onClose: () => void }) {
  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 420 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={{ padding: "34px 28px 28px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 18 }}>
            <span className="penguinDance" style={{ fontSize: 52, animationDelay: "0s" }}>🐧</span>
            <span className="penguinDance" style={{ fontSize: 52, animationDelay: "0.15s" }}>🐧</span>
            <span className="penguinDance" style={{ fontSize: 52, animationDelay: "0.3s" }}>🐧</span>
          </div>
          <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 10, color: T.text }}>CAPITE questions are coming!</div>
          <p style={{ fontSize: 14.5, color: T.muted, lineHeight: 1.6, margin: "0 0 22px" }}>
            Pending and in process — please contact <b style={{ color: T.text }}>Dr. Tyler Yorgason</b> via
            email if you'd like to help make this happen!
          </p>
          <a
            href="mailto:tyler.yorgason@wright.edu?subject=Helping%20build%20the%20CAPITE%20question%20bank"
            style={{ ...s.primarySm, textDecoration: "none", justifyContent: "center" }}
          >
            <Mail size={14} strokeWidth={2.3} /> Email Dr. Yorgason
          </a>
          <div style={{ marginTop: 14 }}>
            <button style={s.ghost} onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Approvals({
  profiles, onClose, onAct, onRefresh, currentUserId,
}: {
  profiles: Profile[];
  onClose: () => void;
  onAct: (id: string, patch: Partial<Pick<Profile, "status" | "role" | "is_admin" | "is_education_chief" | "training_level">>) => void;
  onRefresh: () => void;
  currentUserId?: string;
}) {
  const [tab, setTab] = useState<"people" | "roster">("people");
  // Live copy of the server-side auto-approval list (roster_names) + the
  // study-guide creator allowlist — both admin-editable right from this panel
  // so future chiefs never need code changes for the yearly turnover.
  const [roster, setRoster] = useState<RosterName[] | null>(null);
  const [creators, setCreators] = useState<string[]>([]);
  const [showStaffList, setShowStaffList] = useState(false);
  const ayEnd = academicYearEnd();
  const [addFirst, setAddFirst] = useState("");
  const [addLast, setAddLast] = useState("");
  const [addYear, setAddYear] = useState(String(ayEnd + 4)); // default: incoming intern class
  const [rosterMsg, setRosterMsg] = useState<string | null>(null);
  useEffect(() => {
    listRosterNames().then(setRoster);
    listStudyGuideCreators().then(setCreators);
  }, []);

  const rosterEntries = (roster ?? []).map((r) => ({ first: r.first_name, last: r.last_name, year: r.class_year ?? "" }));
  // Prefer the live table for the "on roster" badge; the hardcoded mirror in
  // roster.ts is only the fallback while the fetch is in flight.
  const matchYear = (name?: string | null): string | null =>
    roster?.length ? (matchNamesList(rosterEntries, name)?.year || null) : matchRoster(name);

  const submitAdd = async () => {
    const first = addFirst.trim(), last = addLast.trim();
    if (!first || !last) { setRosterMsg("Enter a first and last name."); return; }
    const err = await addRosterName(first, last, addYear);
    setRosterMsg(err ? err : `Added ${first} ${last}. They'll be auto-approved when they sign in with a matching Google name.`);
    if (!err) { setAddFirst(""); setAddLast(""); setRoster(await listRosterNames()); }
  };

  const removeName = async (r: RosterName) => {
    if (!window.confirm(`Remove ${r.first_name} ${r.last_name} from the auto-approval list? (Any existing account stays — this only affects future sign-ups.)`)) return;
    await removeRosterName(r.first_name, r.last_name);
    setRoster(await listRosterNames());
  };

  // Yearly one-click turnover: recompute everyone's R-level from their
  // graduating class year (roster stores class years, so they never change —
  // only this derived level does). Safe to press twice; it's date-derived,
  // not a blind +1 bump. Graduated classes become alumni so they drop out of
  // team building automatically.
  const syncLevels = async () => {
    if (!roster?.length) { setRosterMsg("Roster hasn't loaded yet."); return; }
    const changes: { id: string; name: string; patch: Parameters<typeof updateProfile>[1] }[] = [];
    for (const p of profiles) {
      if (p.status !== "approved" || p.role !== "resident") continue;
      const hit = matchNamesList(rosterEntries, p.full_name);
      const lvl = hit ? classYearLevel(hit.year, ayEnd) : null;
      if (!lvl) continue; // no roster match, or a faculty/fellow bucket — set their PGY by hand
      if (lvl === "graduated") changes.push({ id: p.id, name: p.full_name || p.email, patch: { role: "alumni", training_level: null } });
      else if (p.training_level !== lvl) changes.push({ id: p.id, name: p.full_name || p.email, patch: { training_level: lvl } });
    }
    if (!changes.length) { setRosterMsg("Everyone already matches their class year — nothing to change."); return; }
    const grads = changes.filter((c) => c.patch.role === "alumni").length;
    if (!window.confirm(
      `Update ${changes.length} resident${changes.length === 1 ? "" : "s"} to the ${ayEnd - 1}–${String(ayEnd).slice(2)} academic year?` +
      (grads ? ` ${grads} graduated resident${grads === 1 ? "" : "s"} will become alumni.` : "")
    )) return;
    for (const c of changes) await updateProfile(c.id, c.patch);
    onRefresh();
    setRosterMsg(`Updated ${changes.length} member${changes.length === 1 ? "" : "s"}.`);
  };

  const pending = profiles.filter((p) => p.status === "pending");
  const others = profiles.filter((p) => p.status !== "pending");
  const row = (p: Profile) => {
    const year = matchYear(p.full_name);
    const isSelf = p.id === currentUserId;
    const isResident = p.role === "resident";
    const roleLabel =
      (p.is_admin ? (isResident ? "resident · admin" : `${p.role} · admin`) : p.role) +
      (p.is_education_chief ? " · ed chief" : "");
    return (
      <div key={p.id} style={s.apRow}>
        <span style={s.apAvatar}>{initials(p.full_name || p.email)}</span>
        <div style={{ flex: "1 1 150px", minWidth: 0 }}>
          <div style={s.apName}>
            {p.full_name || "(no name)"}
            {year && <span style={s.apMatch}>✓ roster {/^\d{4}$/.test(year) ? "’" + year.slice(2) : year}</span>}
            {!year && p.status === "pending" && <span style={s.apNoMatch}>no roster match</span>}
          </div>
          <div style={s.apEmail}>{p.email} · {roleLabel}{p.status !== "pending" ? ` · ${p.status}` : ""}</div>
        </div>
        <div style={s.apActions}>
          {p.status !== "approved" && (
            <button style={s.apApprove} onClick={() => onAct(p.id, { status: "approved" })}>Approve</button>
          )}
          {p.status === "approved" && (
            <>
              <button
                style={{ ...s.apToggle, ...(isResident ? s.apToggleOn : {}) }}
                title={isResident ? "On the resident roster (counts on teams)" : "Not a resident — tap to mark as resident"}
                onClick={() => onAct(p.id, { role: isResident ? "faculty" : "resident" })}
              >
                Resident
              </button>
              {isResident && (
                <select
                  value={p.training_level ?? ""}
                  onChange={(e) => onAct(p.id, { training_level: e.target.value || null })}
                  style={s.apSelect}
                  title="Training level — drives team balancing. Use 'Sync PGY levels' on the Roster tab to update everyone at once each July."
                >
                  <option value="">PGY —</option>
                  {["R1", "R2", "R3", "R4", "F1", "F2"].map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              )}
              {!isResident && (
                <select
                  value={p.role === "admin" ? "faculty" : p.role}
                  onChange={(e) => onAct(p.id, { role: e.target.value as Profile["role"] })}
                  style={s.apSelect}
                  title="Non-resident category"
                >
                  <option value="faculty">faculty</option>
                  <option value="alumni">alumni</option>
                  <option value="test">test</option>
                </select>
              )}
              {isResident && (
                <button
                  style={{ ...s.apToggle, ...(p.is_education_chief ? s.apToggleOn : {}) }}
                  title={
                    p.is_education_chief
                      ? "Education chief — sits out the team randomizers. Tap to unmark."
                      : "Tap to mark as an education chief (excluded from the team randomizers)"
                  }
                  onClick={() => onAct(p.id, { is_education_chief: !p.is_education_chief })}
                >
                  Ed chief
                </button>
              )}
              {!p.is_admin && (
                <button
                  style={{ ...s.apToggle, ...(creators.includes(p.id) ? s.apToggleOn : {}) }}
                  title={
                    creators.includes(p.id)
                      ? "May generate AI study guides (costs real money) — tap to revoke"
                      : "Tap to let this person generate AI study guides (admins always can)"
                  }
                  onClick={async () => {
                    await setStudyGuideCreator(p.id, !creators.includes(p.id));
                    setCreators(await listStudyGuideCreators());
                  }}
                >
                  Guides
                </button>
              )}
              <button
                style={{ ...s.apToggle, ...(p.is_admin ? s.apToggleOn : {}), ...(isSelf ? s.apToggleLocked : {}) }}
                disabled={isSelf}
                title={
                  isSelf
                    ? "You can’t change your own admin access"
                    : p.is_admin ? "Admin — tap to revoke" : "Not an admin — tap to grant"
                }
                onClick={() => { if (!isSelf) onAct(p.id, { is_admin: !p.is_admin }); }}
              >
                Admin
              </button>
            </>
          )}
          {p.status !== "blocked" && !isSelf && (
            <button style={s.apBlock} title="Block" onClick={() => onAct(p.id, { status: "blocked" })}>
              <X size={14} strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>
    );
  };
  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={s.apPanel} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Admin · access</div>
            <div style={s.apTitle}>Approvals</div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button style={{ ...s.apToggle, ...(tab === "people" ? s.apToggleOn : {}) }} onClick={() => setTab("people")}>People</button>
            <button style={{ ...s.apToggle, ...(tab === "roster" ? s.apToggleOn : {}) }} onClick={() => setTab("roster")}>Roster</button>
            <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
          </div>
        </div>
        {tab === "people" ? (
          <div style={s.apBody}>
            <div style={s.apSectionLbl}>Pending {pending.length > 0 && <span style={s.pendingBadge}>{pending.length}</span>}</div>
            {pending.length ? pending.map(row) : <p style={s.apEmpty}>No one waiting. Residents whose Google name matches the roster are approved automatically.</p>}
            {others.length > 0 && <div style={{ ...s.apSectionLbl, marginTop: 18 }}>Members</div>}
            {others.map(row)}
          </div>
        ) : (
          <div style={s.apBody}>
            <p style={{ ...s.apEmpty, marginTop: 0 }}>
              This is the auto-approval name list. Anyone who signs in with a Google name matching an
              entry is approved automatically (residents get their class; faculty/fellow entries get that
              role). <b>Each June, add the incoming intern class here, then press “Sync PGY levels”.</b>
            </p>

            <div style={s.apSectionLbl}>Add a person</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "8px 0 4px" }}>
              <input value={addFirst} onChange={(e) => setAddFirst(e.target.value)} placeholder="First name"
                style={{ ...s.dateInput, width: 120 }} />
              <input value={addLast} onChange={(e) => setAddLast(e.target.value)} placeholder="Last name"
                style={{ ...s.dateInput, width: 120 }} />
              <select value={addYear} onChange={(e) => setAddYear(e.target.value)} style={s.apSelect} title="Graduating class (or role bucket)">
                {[ayEnd + 4, ayEnd + 3, ayEnd + 2, ayEnd + 1, ayEnd].map((y) => (
                  <option key={y} value={String(y)}>
                    Class of {y}{y === ayEnd + 4 ? " (incoming R1)" : classYearLevel(String(y), ayEnd) ? ` (${classYearLevel(String(y), ayEnd)})` : ""}
                  </option>
                ))}
                <option value="fellow">fellow</option>
                <option value="faculty">faculty / staff</option>
              </select>
              <button style={s.apApprove} onClick={submitAdd}>Add</button>
            </div>

            <div style={{ ...s.apSectionLbl, marginTop: 16 }}>Yearly turnover</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0 4px", flexWrap: "wrap" }}>
              <button style={s.apApprove} onClick={syncLevels} title="Recomputes every matched resident's R-level from their class year for the current academic year; graduated classes become alumni.">
                Sync PGY levels ({ayEnd - 1}–{String(ayEnd).slice(2)} year)
              </button>
            </div>
            {rosterMsg && <p style={{ ...s.apEmpty, marginTop: 6 }}>{rosterMsg}</p>}

            {roster === null ? (
              <p style={s.apEmpty}>Loading the roster…</p>
            ) : (
              <>
                {[...new Set(roster.map((r) => r.class_year ?? "?"))]
                  .filter((y) => /^\d{4}$/.test(y)).sort().reverse()
                  .map((y) => (
                    <div key={y}>
                      <div style={{ ...s.apSectionLbl, marginTop: 16 }}>
                        Class of {y} · {classYearLevel(y, ayEnd) ?? "?"} ({roster.filter((r) => r.class_year === y).length})
                      </div>
                      {roster.filter((r) => r.class_year === y).map((r) => (
                        <div key={r.first_name + " " + r.last_name}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13.5 }}>
                          <span style={{ flex: 1 }}>{r.first_name} {r.last_name}</span>
                          <button style={s.apBlock} title="Remove from the auto-approval list" onClick={() => removeName(r)}>
                            <X size={13} strokeWidth={2.4} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                <div style={{ ...s.apSectionLbl, marginTop: 16 }}>
                  Faculty, fellows &amp; other ({roster.filter((r) => !/^\d{4}$/.test(r.class_year ?? "")).length}){" "}
                  <button style={s.apToggle} onClick={() => setShowStaffList((v) => !v)}>
                    {showStaffList ? "hide" : "show"}
                  </button>
                </div>
                {showStaffList && roster.filter((r) => !/^\d{4}$/.test(r.class_year ?? "")).map((r) => (
                  <div key={r.first_name + " " + r.last_name}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13.5 }}>
                    <span style={{ flex: 1 }}>{r.first_name} {r.last_name}</span>
                    <span style={{ fontSize: 11.5, opacity: 0.6 }}>{r.class_year}</span>
                    <button style={s.apBlock} title="Remove from the auto-approval list" onClick={() => removeName(r)}>
                      <X size={13} strokeWidth={2.4} />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({
  settings, onChange, onRebuild, onClose,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onRebuild: () => void;
  onClose: () => void;
}) {
  // Bring-your-own AI keys: kept in this browser only (localStorage), sent
  // with study-guide generation requests in place of the program's keys.
  const [aiKeys, setAiKeys] = useState<OwnAiKeys>(() => getOwnAiKeys());
  const saveAiKey = (patch: OwnAiKeys) => {
    const next = { ...aiKeys, ...patch };
    setAiKeys(next);
    setOwnAiKeys(next);
  };
  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 440 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Your study plan</div>
            <div style={s.apTitle}>Settings</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={{ ...s.apBody, padding: "4px 22px 22px" }}>
          <div style={s.setBlock}>
            <div style={s.setLbl}>Questions per day</div>
            <div style={s.segRow}>
              {[5, 10, 20, 30, 40, 50].map((n) => (
                <button key={n}
                  style={{ ...s.segBtn, ...(settings.regimen === n ? s.segOn : {}) }}
                  onClick={() => { onChange({ regimen: n as Settings["regimen"] }); onRebuild(); }}
                >{n}</button>
              ))}
            </div>
          </div>

          <div style={s.setBlock}>
            <div style={s.setLbl}>Exam date</div>
            <input
              type="date"
              value={settings.exam_date ?? guessedExamDate()}
              onChange={(e) => onChange({ exam_date: e.target.value || null })}
              style={s.dateInput}
            />
            <div style={s.setHint}>
              Drives the countdown in the header. Pre-filled with the assumed PRITE date
              {settings.exam_date ? "" : " (edit if yours differs)"}.
            </div>
          </div>

          <div style={s.setBlock}>
            <label style={s.toggleRow}>
              <input
                type="checkbox"
                checked={settings.recycle_missed}
                onChange={(e) => { onChange({ recycle_missed: e.target.checked }); onRebuild(); }}
              />
              <span>
                <b>Recycle missed questions</b>
                <div style={s.setHint}>Bring back questions you got wrong, after a delay.</div>
              </span>
            </label>
            {settings.recycle_missed && (
              <>
                <div style={s.afterRow}>
                  resurface after
                  <input
                    type="number" min={1} max={120}
                    value={settings.recycle_after_days}
                    onChange={(e) => { onChange({ recycle_after_days: Math.max(1, parseInt(e.target.value || "1", 10)) }); onRebuild(); }}
                    style={s.daysInput}
                  />
                  days
                </div>
                <div style={s.afterRow}>
                  up to
                  <input
                    type="number" min={0} max={20}
                    value={settings.review_per_day ?? 3}
                    onChange={(e) => { onChange({ review_per_day: Math.max(0, parseInt(e.target.value || "0", 10)) }); onRebuild(); }}
                    style={s.daysInput}
                  />
                  missed question{(settings.review_per_day ?? 3) === 1 ? "" : "s"} per day
                </div>
              </>
            )}
          </div>

          <div style={s.setBlock}>
            {(() => {
              const effectiveOn = settings.daily_reminder === true ? true
                : settings.daily_reminder === false ? false
                : isAutoReminderActive(settings.exam_date);
              return (
                <>
                  <label style={s.toggleRow}>
                    <input
                      type="checkbox"
                      checked={effectiveOn}
                      onChange={(e) => onChange({ daily_reminder: e.target.checked })}
                    />
                    <span>
                      <b>Email me practice reminders</b>
                      <div style={s.setHint}>
                        {settings.daily_reminder === null
                          ? <>Automatic: on during the 90 days before the exam date above, off after. Toggle to override.</>
                          : "Sent to your sign-in email. Toggle off anytime."}
                      </div>
                    </span>
                  </label>
                  {effectiveOn && (
                    <div style={{ ...s.afterRow, marginTop: 10 }}>
                      every
                      <input
                        type="number" min={1} max={30}
                        value={settings.reminder_every_days ?? 1}
                        onChange={(e) => onChange({ reminder_every_days: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                        style={s.daysInput}
                      />
                      day{(settings.reminder_every_days ?? 1) === 1 ? "" : "s"}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          <div style={s.setBlock}>
            <div style={s.setLbl}>Your own AI keys (optional)</div>
            <input
              type="password"
              value={aiKeys.anthropic ?? ""}
              onChange={(e) => saveAiKey({ anthropic: e.target.value })}
              placeholder="Anthropic key (sk-ant-…) — writes guides & slides"
              autoComplete="off"
              style={{ ...s.dateInput, width: "100%", marginBottom: 6 }}
            />
            <input
              type="password"
              value={aiKeys.openai ?? ""}
              onChange={(e) => saveAiKey({ openai: e.target.value })}
              placeholder="OpenAI key (sk-…) — narration & slide images"
              autoComplete="off"
              style={{ ...s.dateInput, width: "100%" }}
            />
            <div style={s.setHint}>
              Only matters if you generate AI study guides. When set, generation bills your
              key instead of the program's. Keys stay in this browser only — they're never
              stored on the server. Clear the boxes to go back to the program's keys.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type ChartData = {
  points: { x: number; y: number; n: number }[];
  N: number; totalQ: number;
  fit: { m: number; b: number; r: number } | null;
  improving: boolean;
};

function PerfChart({ chart, per }: { chart: ChartData; per: { n: number; rise: number } | null }) {
  const { points, improving, fit, totalQ } = chart;
  // Geometry (SVG user units; scales to container width via viewBox).
  const W = 340, H = 168, L = 30, R = 10, TOP = 12, BOT = 24;
  const pw = W - L - R, ph = H - TOP - BOT;
  const xMax = Math.max(totalQ, 1);
  const px = (x: number) => L + (x / xMax) * pw;
  const py = (y: number) => TOP + (1 - Math.max(0, Math.min(100, y)) / 100) * ph;
  const dotColor = (y: number) => (y >= 70 ? T.teal : y >= 50 ? T.gold : T.wrongLine);

  if (points.length < 2) {
    return (
      <div style={s.chartCard}>
        <div style={s.secHead}>Performance over time</div>
        <p style={s.apEmpty}>Answer on a few separate days and your day-by-day accuracy will plot here.</p>
      </div>
    );
  }

  // Trend line endpoints, drawn only when there's a real upward trend.
  const x0 = points[0].x, x1 = points[points.length - 1].x;
  const lineY0 = fit ? fit.m * x0 + fit.b : 0;
  const lineY1 = fit ? fit.m * x1 + fit.b : 0;

  return (
    <div style={s.chartCard}>
      <div style={s.secHead}>Performance over time</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img"
        aria-label="Scatter plot of daily first-try accuracy against questions answered">
        {/* y gridlines + labels */}
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={L} y1={py(g)} x2={W - R} y2={py(g)} stroke={T.paperEdge} strokeWidth={1} />
            <text x={L - 5} y={py(g) + 3} textAnchor="end" fontSize={8} fill={T.faint}>{g}</text>
          </g>
        ))}
        {/* x baseline + label */}
        <text x={L} y={H - 4} fontSize={8} fill={T.faint}>0</text>
        <text x={W - R} y={H - 4} textAnchor="end" fontSize={8} fill={T.faint}>{totalQ} Qs</text>
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fontSize={8.5} fill={T.muted}>questions answered</text>
        {/* trend line */}
        {improving && fit && (
          <line x1={px(x0)} y1={py(lineY0)} x2={px(x1)} y2={py(lineY1)}
            stroke={T.teal} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" opacity={0.85} />
        )}
        {/* scatter dots, sized a touch by that day's volume */}
        {points.map((p, i) => (
          <circle key={i} cx={px(p.x)} cy={py(p.y)} r={3 + Math.min(3, p.n / 8)}
            fill={dotColor(p.y)} fillOpacity={0.85} stroke="#fff" strokeWidth={1} />
        ))}
      </svg>
      {improving && per ? (
        <p style={s.chartNote}>
          <TrendingUp size={13} strokeWidth={2.4} style={{ verticalAlign: "-2px", color: T.teal }} />{" "}
          Trending up: roughly <b>+{per.rise.toFixed(1)}% accuracy for every {per.n} questions</b> you answer.
        </p>
      ) : (
        <p style={s.chartNote}>
          No clear upward trend yet — each dot is one day's first-try accuracy. Keep answering and a trend line appears once it's pointing up.
        </p>
      )}
    </div>
  );
}

function Stats({
  answers, byId, displayName, onClose,
}: {
  answers: Record<string, AnswerRow>;
  byId: Map<string, RawQuestion>;
  displayName: string;
  onClose: () => void;
}) {
  const DIMS: [string, string][] = [
    ["prite", "PRITE category"], ["year", "Year"], ["diagnosis", "Diagnosis"],
    ["medication", "Medication"], ["psychotherapy", "Psychotherapy"],
    ["neuro", "Neuro concept"], ["historical", "Historical"],
  ];
  const [dim, setDim] = useState("prite");
  const [pollStats, setPollStats] = useState<PollStats | null>(null);
  const [pollAnsweredIds, setPollAnsweredIds] = useState<string[]>([]);
  useEffect(() => { getMyPollStats().then(setPollStats); getPollAnsweredQuestionIds().then(setPollAnsweredIds); }, []);
  const pollOnlyCount = pollAnsweredIds.filter((id) => !(id in answers)).length;
  const pollCreditCount = pollAnsweredIds.length;

  const m = useMemo(() => {
    const entries = Object.values(answers);
    const answered = entries.length;
    const firstTry = entries.filter((e) => e.first_correct).length;
    const mastered = entries.filter((e) => e.correct).length;
    const outstanding = entries.filter((e) => !e.correct && !e.cleared).length;
    const attempts = entries.reduce((n, e) => n + (e.attempts || 1), 0);
    const today = entries.filter((e) => isSameDay(e.updated_at)).length;
    const week = entries.filter((e) => Date.now() - Date.parse(e.updated_at) < 7 * 86400000).length;

    // streak: consecutive days (ending today or yesterday) with activity
    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const activeDays = new Set(entries.map((e) => dayKey(new Date(e.updated_at))));
    let streak = 0;
    const cur = new Date();
    if (!activeDays.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
    while (activeDays.has(dayKey(cur))) { streak++; cur.setDate(cur.getDate() - 1); }

    return {
      answered, attempts, today, week, mastered, outstanding,
      firstTryAcc: answered ? Math.round((firstTry / answered) * 100) : 0,
      currentAcc: answered ? Math.round((mastered / answered) * 100) : 0,
      streak,
    };
  }, [answers]);

  // Performance over time. One point per active day: first-try accuracy that
  // day, positioned by the running total of questions answered. A least-squares
  // line (y = m·x + b) is fit so the slope reads as "% gained per question."
  const chart = useMemo(() => {
    const recs = Object.values(answers)
      .map((a) => ({ t: Date.parse(a.updated_at), ok: !!a.first_correct }))
      .filter((r) => Number.isFinite(r.t))
      .sort((a, b) => a.t - b.t);
    const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
    const byDay = new Map<string, { first: number; n: number; ok: number }>();
    for (const r of recs) {
      const k = dayKey(r.t);
      const g = byDay.get(k) ?? { first: r.t, n: 0, ok: 0 };
      g.n++; if (r.ok) g.ok++;
      byDay.set(k, g);
    }
    const days = [...byDay.values()].sort((a, b) => a.first - b.first);
    let cum = 0;
    const points = days.map((d) => { cum += d.n; return { x: cum, y: (d.ok / d.n) * 100, n: d.n }; });
    const N = points.length;
    const base = { points, N, totalQ: cum, fit: null as null | { m: number; b: number; r: number }, improving: false };
    if (N < 2) return base;
    const sx = points.reduce((s, p) => s + p.x, 0);
    const sy = points.reduce((s, p) => s + p.y, 0);
    const sxx = points.reduce((s, p) => s + p.x * p.x, 0);
    const syy = points.reduce((s, p) => s + p.y * p.y, 0);
    const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
    const denom = N * sxx - sx * sx;
    const slope = denom ? (N * sxy - sx * sy) / denom : 0;
    const b = (sy - slope * sx) / N;
    const rDen = Math.sqrt(denom * (N * syy - sy * sy));
    const r = rDen ? (N * sxy - sx * sy) / rDen : 0;
    // Only call it a trend when it's upward, has a few days behind it, and the
    // fit isn't pure noise. Otherwise we show the scatter alone.
    const improving = N >= 4 && slope > 0 && r >= 0.15;
    return { ...base, fit: { m: slope, b, r }, improving };
  }, [answers]);

  // "For every N questions, +X%." Pick the smallest round N giving a readable rise.
  const per = useMemo(() => {
    if (!chart.improving || !chart.fit) return null;
    const n = [50, 100, 250, 500].find((k) => chart.fit!.m * k >= 1) ?? 500;
    return { n, rise: chart.fit!.m * n };
  }, [chart]);

  // PRITE score predictor. The bank is recalled PRITE items, so your first-try
  // accuracy is a direct proxy for raw % correct on a real exam. We model the
  // national field as Normal(NAT_MEAN, NAT_SD) — calibrated so ~95% first-pass
  // accuracy lands near the 99th percentile (matching a known top result) — and
  // read your percentile off that curve. Constants are the assumptions; tweak freely.
  const pred = useMemo(() => {
    const NAT_MEAN = 62, NAT_SD = 14;
    if (!m.answered) return null;
    const acc = m.firstTryAcc;
    const pctNow = clampPct(normCdf((acc - NAT_MEAN) / NAT_SD) * 100);
    // Project along the trend line over a 500-question horizon, if improving.
    const projAcc = chart.improving && chart.fit ? Math.min(98, acc + chart.fit.m * 500) : null;
    const pctProj = projAcc != null ? clampPct(normCdf((projAcc - NAT_MEAN) / NAT_SD) * 100) : null;
    // Confidence is thin until there's a real volume of answered questions.
    const thin = m.answered < 60;
    return { acc, pctNow, projAcc, pctProj, thin, horizon: 500 };
  }, [m, chart]);

  const rows = useMemo(() => {
    const tally = new Map<string, { label: string; attempts: number; missed: number }>();
    const push = (key: string, label: string, wrong: boolean) => {
      const t = tally.get(key) ?? { label, attempts: 0, missed: 0 };
      t.attempts++; if (wrong) t.missed++; tally.set(key, t);
    };
    for (const [id, row] of Object.entries(answers)) {
      const q = byId.get(id);
      if (!q) continue;
      const wrong = !row.first_correct;
      if (dim === "prite") { if (q.prite_category) push(q.prite_category, q.prite_label || q.prite_category, wrong); }
      else if (dim === "year") push(q.year, q.year, wrong);
      else for (const tg of (q.tags?.[dim as keyof QTags] as string[] | undefined) ?? []) push(tg, tg, wrong);
    }
    return [...tally.entries()]
      .map(([tag, t]) => ({ tag, label: t.label, attempts: t.attempts, missed: t.missed, miss_pct: Math.round((t.missed / t.attempts) * 100) }))
      .sort((a, b) => b.miss_pct - a.miss_pct || b.attempts - a.attempts);
  }, [answers, byId, dim]);

  const maxMiss = rows.length ? Math.max(...rows.map((r) => r.miss_pct), 1) : 1;
  const card = (num: React.ReactNode, lbl: string, sub?: string, color?: string) => (
    <div style={s.statCard}>
      <div style={{ ...s.statNum, color: color ?? T.text }}>{num}</div>
      <div style={s.statLbl}>{lbl}</div>
      {sub && <div style={s.statSub}>{sub}</div>}
    </div>
  );

  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 600 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>{displayName.split(" ")[0]}’s performance</div>
            <div style={s.apTitle}>Statistics</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.apBody}>
          {m.answered === 0 && pollCreditCount === 0 ? (
            <p style={s.apEmpty}>You haven’t answered any questions yet. Once you start, your stats will show up here.</p>
          ) : (
            <>
              <div style={s.statGrid}>
                {card(
                  <>{m.answered + pollOnlyCount}{pollCreditCount > 0 && <span style={s.pollCreditNum} title={`${pollCreditCount} of those were answered in a live class poll`}>+{pollCreditCount} 🎤</span>}</>,
                  "Questions answered",
                  `${m.attempts} total attempts`
                )}
                {card(`${m.firstTryAcc}%`, "First-try accuracy", `${m.answered - m.outstanding} of ${m.answered} eventually right`, m.firstTryAcc >= 70 ? T.correctText : m.firstTryAcc >= 50 ? T.gold : T.wrongText)}
                {card(<><Flame size={18} strokeWidth={2.4} style={{ verticalAlign: "-2px" }} color={m.streak > 0 ? T.gold : T.faint} /> {m.streak}</>, "Day streak", `${m.today} today · ${m.week} this week`, m.streak > 0 ? T.gold : undefined)}
                {card(m.outstanding, "To review", m.outstanding === 0 ? "all caught up 🎉" : "missed, not yet re-answered", m.outstanding > 0 ? T.wrongText : T.correctText)}
              </div>

              <PerfChart chart={chart} per={per} />

              {pred && (
                <div style={s.predCard}>
                  <div style={s.secHead}>Estimated PRITE percentile</div>
                  <div style={s.predRow}>
                    <div>
                      <div style={{ ...s.statNum, color: T.teal }}>
                        {pred.pctNow}<span style={s.predOrd}>{ordinal(pred.pctNow)}</span>
                      </div>
                      <div style={s.statSub}>from {pred.acc}% first-try accuracy</div>
                    </div>
                    {pred.pctProj != null && pred.pctProj > pred.pctNow && (
                      <>
                        <ArrowRight size={18} color={T.faint} style={{ flexShrink: 0 }} />
                        <div>
                          <div style={{ ...s.statNum, color: T.gold }}>
                            {pred.pctProj}<span style={s.predOrd}>{ordinal(pred.pctProj)}</span>
                          </div>
                          <div style={s.statSub}>projected after +{pred.horizon} Qs</div>
                        </div>
                      </>
                    )}
                  </div>
                  <p style={s.insFoot}>
                    Rough estimate. The bank is recalled PRITE items, so your first-try accuracy
                    stands in for raw exam %. Modeled against an assumed national field
                    (mean 62%, SD 14, calibrated so ~95% first-pass ≈ 99th percentile).
                    {pred.thin && " Answer more questions for a steadier read — this is based on a small sample so far."}
                    {" "}Practicing on real items inflates accuracy vs. a fresh exam, so treat this as a ceiling, not a guarantee.
                  </p>
                </div>
              )}

              <div style={s.insTabs}>
                {DIMS.map(([d, label]) => (
                  <button key={d} style={{ ...s.insTab, ...(dim === d ? s.insTabOn : {}) }} onClick={() => setDim(d)}>{label}</button>
                ))}
              </div>

              <div style={s.insHead}><span>Topic (hardest first)</span><span style={s.insHeadR}>miss% · seen</span></div>
              {rows.length === 0 && <p style={s.apEmpty}>None of your answered questions are tagged on this dimension yet.</p>}
              {rows.map((r) => (
                <div key={r.tag} style={s.insRow}>
                  <span style={s.insLabel}>{r.label}</span>
                  <div style={s.insBarWrap}>
                    <div style={{ ...s.insBar, width: `${(r.miss_pct / maxMiss) * 100}%`, background: r.miss_pct >= 50 ? T.wrongLine : r.miss_pct >= 30 ? T.gold : T.teal }} />
                  </div>
                  <span style={s.insPct}>{r.miss_pct}%</span>
                  <span style={s.insAtt}>{r.attempts}</span>
                </div>
              ))}
              <p style={s.insFoot}>Difficulty = % <b>you</b> got wrong on the first try. Topics in red are where to spend more time. Only questions you’ve answered are counted.</p>
            </>
          )}

          <div style={{ marginTop: 22 }}>
            <div style={s.secHead}>Live polling</div>
            {!pollStats || pollStats.totalAnswers === 0 ? (
              <p style={s.apEmpty}>You haven’t answered any questions in a live class poll yet — join one with "Join poll" during a study session.</p>
            ) : (
              <>
                <div style={{ ...s.statGrid, gridTemplateColumns: "repeat(3, 1fr)" }}>
                  {card(pollStats.sessions.length, "Polls played")}
                  {card(pollStats.totalAnswers, "Questions answered")}
                  {card(`${pollStats.pctCorrect}%`, "Accuracy", undefined, pollStats.pctCorrect >= 70 ? T.correctText : pollStats.pctCorrect >= 50 ? T.gold : T.wrongText)}
                </div>
                <div style={s.insHead}><span>Recent sessions</span><span style={s.insHeadR}>score</span></div>
                {pollStats.sessions.slice(0, 8).map((sess) => (
                  <div key={sess.poll_code} style={s.insRow}>
                    <span style={s.insLabel}>{sess.team ? `${sess.team} — ` : ""}{ago(sess.date)}</span>
                    <div style={s.insBarWrap}>
                      <div style={{ ...s.insBar, width: `${Math.round((sess.correct / sess.total) * 100)}%`, background: T.teal }} />
                    </div>
                    <span style={s.insPct}>{sess.correct}/{sess.total}</span>
                  </div>
                ))}
                <p style={s.insFoot}>Separate from your solo-practice stats above — this is your personal record across every live class poll you've voted in.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Insights({ onClose }: { onClose: () => void }) {
  const DIMS: [string, string][] = [
    ["prite", "PRITE category"], ["topics", "Topic"], ["diagnosis", "Diagnosis"], ["medication", "Medication"],
    ["psychotherapy", "Psychotherapy"], ["neuro", "Neuro concept"], ["historical", "Historical"],
  ];
  const COHORTS: [string, string][] = [
    ["all", "Everyone"], ["R1", "R1"], ["R2", "R2"], ["R3", "R3"], ["R4", "R4"],
    ["F1", "F1"], ["F2", "F2"], ["faculty", "Faculty"], ["alumni", "Alumni"],
  ];
  const [dim, setDim] = useState("prite");
  const [cohort, setCohort] = useState("all");
  const [rows, setRows] = useState<TagMissRow[] | null>(null);
  useEffect(() => {
    setRows(null);
    getTagMissStats(dim, cohort === "all" ? null : cohort).then(setRows);
  }, [dim, cohort]);
  const maxMiss = rows && rows.length ? Math.max(...rows.map((r) => r.miss_pct), 1) : 1;
  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 600 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>What the class struggles with</div>
            <div style={s.apTitle}>Residency Insights</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select value={cohort} onChange={(e) => setCohort(e.target.value)} style={s.cohortSel}>
              {COHORTS.map(([c, label]) => <option key={c} value={c}>{label}</option>)}
            </select>
            <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
          </div>
        </div>
        <div style={s.insTabs}>
          {DIMS.map(([d, label]) => (
            <button key={d} style={{ ...s.insTab, ...(dim === d ? s.insTabOn : {}) }} onClick={() => setDim(d)}>{label}</button>
          ))}
        </div>
        <div style={s.apBody}>
          <div style={s.insHead}><span>Topic (hardest first)</span><span style={s.insHeadR}>miss% · attempts</span></div>
          {rows === null && <p style={s.apEmpty}>Loading…</p>}
          {rows !== null && rows.length === 0 && <p style={s.apEmpty}>No answers yet to analyze. Come back once the class has been answering.</p>}
          {rows?.map((r) => (
            <div key={r.tag} style={s.insRow}>
              <span style={s.insLabel}>{r.label}</span>
              <div style={s.insBarWrap}>
                <div style={{ ...s.insBar, width: `${(r.miss_pct / maxMiss) * 100}%`, background: r.miss_pct >= 50 ? T.wrongLine : r.miss_pct >= 30 ? T.gold : T.teal }} />
              </div>
              <span style={s.insPct}>{r.miss_pct}%</span>
              <span style={s.insAtt}>{r.attempts}</span>
            </div>
          ))}
          <p style={s.insFoot}>Difficulty = % of attempts answered wrong on the first try, across all residents. Topics in red are the ones to spend more time on.</p>
        </div>
      </div>
    </div>
  );
}

function DeckBuilder({
  all, byId, onClose, onOpen, onStudy, onSaveTest, fire,
}: {
  all: RawQuestion[];
  byId: Map<string, RawQuestion>;
  onClose: () => void;
  onOpen: (id: string) => void;
  onStudy?: (qs: RawQuestion[], label: string) => void;
  onSaveTest?: (qids: string[]) => void;
  fire: (m: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"both" | "stem" | "choices" | "answer">("both");
  const [year, setYear] = useState("all");
  const [cat, setCat] = useState("all");
  const [med, setMed] = useState("all");
  const [dx, setDx] = useState("all");
  const [topic, setTopic] = useState("all");
  const [repeatMin, setRepeatMin] = useState("all");
  const [sortBy, setSortBy] = useState<"default" | "repeats">("default");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [shuffleOrder, setShuffleOrder] = useState(false);
  const [sampleN, setSampleN] = useState(20);
  const [pptxWithExpl, setPptxWithExpl] = useState(false);

  const years = useMemo(() => Array.from(new Set(all.map((q) => q.year))).sort(), [all]);
  const cats = useMemo(() => {
    const m = new Map<string, string>();
    all.forEach((q) => { if (q.prite_category) m.set(q.prite_category, q.prite_label || q.prite_category); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const uniq = (key: "medication" | "diagnosis" | "topics") =>
    Array.from(new Set(all.flatMap((q) => q.tags?.[key] ?? []))).sort();
  const meds = useMemo(() => uniq("medication"), [all]);
  const dxs = useMemo(() => uniq("diagnosis"), [all]);
  const topics = useMemo(() => uniq("topics"), [all]);

  const matches = useMemo(() => {
    const filtered = all.filter((q) => {
      if (year !== "all" && q.year !== year) return false;
      if (cat !== "all" && q.prite_category !== cat) return false;
      if (med !== "all" && !(q.tags?.medication ?? []).includes(med)) return false;
      if (dx !== "all" && !(q.tags?.diagnosis ?? []).includes(dx)) return false;
      if (topic !== "all" && !(q.tags?.topics ?? []).includes(topic)) return false;
      if (repeatMin !== "all" && (q.repeat_count ?? 1) < parseInt(repeatMin, 10)) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        const inStem = q.stem.toLowerCase().includes(s);
        const inChoices = q.options.some((o) => o.text.toLowerCase().includes(s));
        const inAnswer = (q.answer_text ?? "").toLowerCase().includes(s);
        const hit = scope === "stem" ? inStem : scope === "choices" ? inChoices
          : scope === "answer" ? inAnswer : inStem || inChoices;
        if (!hit) return false;
      }
      return true;
    });
    if (sortBy === "repeats") {
      return [...filtered].sort((a, b) => (b.repeat_count ?? 1) - (a.repeat_count ?? 1));
    }
    return filtered;
  }, [all, year, cat, med, dx, topic, repeatMin, sortBy, search, scope]);

  // when the filter changes, select all matches by default
  useEffect(() => { setSelected(new Set(matches.map((q) => questionId(q.year, q.q_index)))); }, [year, cat, med, dx, topic, repeatMin, sortBy, search, scope]); // eslint-disable-line

  const toggle = (id: string) => setSelected((cur) => {
    const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // hand the picked questions (in list order) to a custom study session
  const study = () => {
    let ordered = matches.filter((q) => selected.has(questionId(q.year, q.q_index)));
    if (!ordered.length) return;
    if (shuffleOrder) ordered = shuffled(ordered);
    const parts: string[] = [];
    if (cat !== "all") parts.push(cats.find(([k]) => k === cat)?.[1] ?? cat);
    if (dx !== "all") parts.push(dx);
    if (med !== "all") parts.push(med);
    if (year !== "all") parts.push(year);
    if (topic !== "all") parts.push(topic);
    if (search.trim()) parts.push(`"${search.trim()}"`);
    onStudy?.(ordered, parts.join(" · "));
  };

  // randomly select N of the current matches (capped to however many match)
  const pickRandom = () => {
    const n = Math.max(1, Math.min(sampleN, matches.length));
    const pick = shuffled(matches).slice(0, n);
    setSelected(new Set(pick.map((q) => questionId(q.year, q.q_index))));
  };

  const download = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    const clozes = await getFlashcardsForIds(ids);
    const contexts = await getContextsForIds(ids);
    const rows: { questionId: string; cloze: string; lecture: string }[] = [];
    for (const id of ids) {
      const q = byId.get(id); const cz = clozes[id];
      if (!q || !cz) continue;
      // sequential — mermaid.render works one diagram at a time
      const diagramSvg = await renderDiagramSvg(q.diagram?.code);
      rows.push({ questionId: id, cloze: cz, lecture: ankingLecture(q, { context: contexts[id], diagramSvg }) });
    }
    if (!rows.length) { setBusy(false); fire("No cards found — load the flashcards (migration 0006) first"); return; }
    const { buildApkg } = await import("./lib/apkg");
    await buildApkg(rows, "prite-deck.apkg");
    setBusy(false);
    fire(`Built a ${rows.length}-card .apkg — double-click to import`);
    onClose();
  };

  const downloadPptx = async () => {
    const qsel = [...selected].map((id) => byId.get(id)).filter(Boolean) as RawQuestion[];
    if (!qsel.length) return;
    setBusy(true);
    try {
      await exportPptx(qsel, "prite-questions.pptx", true, pptxWithExpl);
      fire(`Built a ${qsel.length}-slide PowerPoint`);
      onClose();
    } catch (e) { fire("PowerPoint export failed"); console.warn(e); }
    setBusy(false);
  };

  const shown = matches.slice(0, 250);
  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 640 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Search · study · export</div>
            <div style={s.apTitle}>Build a study set</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.deckFilters}>
          <div style={s.deckSearchRow}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for a word (e.g. fluoxetine)" style={{ ...s.deckSearch, marginBottom: 0, flex: 1 }} />
            <div style={s.scopeToggle}>
              {(["both", "stem", "choices", "answer"] as const).map((sc) => (
                <button key={sc} style={{ ...s.scopeBtn, ...(scope === sc ? s.scopeOn : {}) }} onClick={() => setScope(sc)}>
                  {sc === "both" ? "Anywhere" : sc === "stem" ? "Stem" : sc === "choices" ? "Choices" : "Answer"}
                </button>
              ))}
            </div>
          </div>
          <div style={s.deckSelRow}>
            <select value={year} onChange={(e) => setYear(e.target.value)} style={s.cohortSel}>
              <option value="all">Any year</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={cat} onChange={(e) => setCat(e.target.value)} style={s.cohortSel}>
              <option value="all">Any category</option>{cats.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
            </select>
            <select value={topic} onChange={(e) => setTopic(e.target.value)} style={s.cohortSel}>
              <option value="all">Any topic</option>{topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={med} onChange={(e) => setMed(e.target.value)} style={s.cohortSel}>
              <option value="all">Any medication</option>{meds.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={dx} onChange={(e) => setDx(e.target.value)} style={s.cohortSel}>
              <option value="all">Any diagnosis</option>{dxs.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={repeatMin} onChange={(e) => setRepeatMin(e.target.value)} style={s.cohortSel} title="Questions reused (verbatim or near-verbatim) across multiple years">
              <option value="all">Any (repeat or not)</option>
              <option value="2">Repeated 2+ years</option>
              <option value="3">Repeated 3+ years</option>
              <option value="4">Repeated 4+ years</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "default" | "repeats")} style={s.cohortSel} title="Order the results below">
              <option value="default">Sort: default order</option>
              <option value="repeats">Sort: most repeated first</option>
            </select>
          </div>
          <div style={s.deckCount}>
            <span><b style={{ color: T.text }}>{matches.length}</b> match · <b style={{ color: T.teal }}>{selected.size}</b> selected</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number" min={1} max={Math.max(1, matches.length)}
                value={sampleN}
                onChange={(e) => setSampleN(Math.max(1, parseInt(e.target.value || "1", 10)))}
                style={{ ...s.daysInput, width: 52 }}
                title="How many random questions to select"
              />
              <button style={s.tinyBtn} onClick={pickRandom} disabled={!matches.length} title="Randomly select this many from the current matches">Pick random</button>
              <button style={s.tinyBtn} onClick={() => setSelected(new Set(matches.map((q) => questionId(q.year, q.q_index))))}>Select all</button>
              <button style={s.tinyBtn} onClick={() => setSelected(new Set())}>Clear</button>
            </span>
          </div>
        </div>
        <div style={s.apBody}>
          {matches.length === 0 && <p style={s.apEmpty}>No questions match these filters.</p>}
          {shown.map((q) => {
            const id = questionId(q.year, q.q_index);
            return (
              <div key={id} style={s.deckRow}>
                <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} style={{ marginTop: 4 }} />
                <div style={s.deckRowText} onClick={() => onOpen(id)} title="Open this question">
                  <div style={s.deckRowMeta}>
                    {q.year} · Q{q.q_index} · {q.prite_label}
                    {(q.repeat_count ?? 1) > 1 && (
                      <span style={s.repeatBadge} title={`Also appears in ${q.repeat_years?.filter((y) => y !== q.year).join(", ")}`}>
                        <Repeat size={10} strokeWidth={2.4} /> {q.repeat_count}×
                      </span>
                    )}
                    <ExternalLink size={11} strokeWidth={2.2} style={{ marginLeft: 6, verticalAlign: "-1px", color: T.faint }} />
                  </div>
                  <div style={s.deckRowStem}>{q.stem}</div>
                  <div style={s.deckRowAns}>→ {q.answer_letter} · {q.answer_text}</div>
                </div>
              </div>
            );
          })}
          {matches.length > shown.length && <p style={s.apEmpty}>+ {matches.length - shown.length} more match (all selected — refine to list them)</p>}
        </div>
        <div style={s.deckFoot}>
          {onStudy && (
            <>
              <button style={{ ...s.primarySm, opacity: selected.size ? 1 : 0.5 }} disabled={!selected.size} onClick={study} title="Practice the selected questions">
                <Target size={14} strokeWidth={2.3} /> Study these ({selected.size})
              </button>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: T.muted, cursor: "pointer" }}>
                <input type="checkbox" checked={shuffleOrder} onChange={(e) => setShuffleOrder(e.target.checked)} />
                Shuffle order
              </label>
            </>
          )}
          {onSaveTest && (
            <button
              style={{ ...s.ghost, marginLeft: 0, opacity: selected.size ? 1 : 0.5 }}
              disabled={!selected.size}
              onClick={() => onSaveTest(matches.filter((q) => selected.has(questionId(q.year, q.q_index))).map((q) => questionId(q.year, q.q_index)))}
              title="Save the checked questions as a named test — poll it live, restudy it, or export it later"
            >
              <ListChecks size={14} strokeWidth={2.2} /> Save as test
            </button>
          )}
          <button style={{ ...s.ghost, marginLeft: 0, opacity: selected.size && !busy ? 1 : 0.5 }} disabled={!selected.size || busy} onClick={download}>
            <Download size={14} strokeWidth={2.2} /> {busy ? "Building…" : `Anki (${selected.size})`}
          </button>
          <button style={{ ...s.ghost, marginLeft: 0, opacity: selected.size && !busy ? 1 : 0.5 }} disabled={!selected.size || busy} onClick={downloadPptx}>
            <FileText size={14} strokeWidth={2.2} /> PowerPoint
          </button>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: T.muted, cursor: "pointer" }}>
            <input type="checkbox" checked={pptxWithExpl} onChange={(e) => setPptxWithExpl(e.target.checked)} />
            Include explanations
          </label>
          <span style={s.flashNote}>Study, or export the checked questions</span>
        </div>
      </div>
    </div>
  );
}

/* Saved tests: named, hand-picked question sets (built in the Search modal).
   From here a test can be studied, hosted as a live class poll, exported to
   PowerPoint, renamed, or deleted. Stored per-device in localStorage. */
// The progress bar / ETA are an ELAPSED-TIME ESTIMATE, not a real signal from
// the server (Anthropic/OpenAI don't report mid-call progress). They anchor to
// the guide's generation_started_at, which lives in the DB — so they read the
// same after a page refresh and on any device, instead of resetting. The bar
// eases toward (never quite reaches) a ceiling per stage; the caller snaps it
// to done once status flips to "ready".
const GUIDE_TOTAL_TYPICAL_SECS = 70; // rough writing(~20) + narrating(~50)
const GUIDE_STUCK_SECS = 200;        // past this, treat as stalled and offer a retry

function guideElapsedSecs(guide: StudyGuide): number {
  const anchor = guide.generation_started_at ?? guide.created_at;
  const t = anchor ? Date.parse(anchor) : Date.now();
  return Math.max(0, (Date.now() - t) / 1000);
}
function guideProgressPercent(guide: StudyGuide): number {
  const e = guideElapsedSecs(guide);
  if (guide.stage === "narrating") return Math.round(Math.min(94, 50 + 44 * (1 - Math.exp(-Math.max(0, e - 15) / 22))));
  return Math.round(Math.min(46, 5 + 41 * (1 - Math.exp(-e / 9)))); // "writing" or unknown
}
function guideEtaLabel(guide: StudyGuide): string {
  const remaining = Math.round(GUIDE_TOTAL_TYPICAL_SECS - guideElapsedSecs(guide));
  return remaining > 5 ? `~${remaining}s left` : "almost done";
}
function guideIsStuck(guide: StudyGuide): boolean {
  return guide.status === "generating" && guideElapsedSecs(guide) > GUIDE_STUCK_SECS;
}
const guideStageLabel: Record<string, string> = { writing: "Writing the guide", designing: "Designing the slides", narrating: "Recording the audio" };

/* Rough AI cost per run, shown as a tiny chip on the generation buttons so
   nobody triggers a paid run unknowingly. Ballpark: the two Claude calls
   (guide text + slide design) + ~5 images ≈ $0.85; TTS narration ≈ $0.15.
   Downloads of already-generated material are free and get no chip. */
const GUIDE_COST = "~$1", SLIDES_COST = "~85¢", AUDIO_COST = "~15¢";
function CostChip({ amount, light }: { amount: string; light?: boolean }) {
  // light: for use inside solid teal primary buttons
  return (
    <span
      title="Approximate AI generation cost — downloads of anything already generated are free"
      style={{
        fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "1px 6px", marginLeft: 2, whiteSpace: "nowrap",
        color: light ? "rgba(255,255,255,0.85)" : T.faint,
        border: `1px solid ${light ? "rgba(255,255,255,0.45)" : T.paperEdge}`,
      }}
    >
      {amount}
    </span>
  );
}

// YYYY-MM-DD for the next upcoming Tuesday (sessions are on Tuesdays) — the
// default the date picker opens on.
function nextTuesdayYmd(): string {
  const d = new Date();
  const delta = (2 - d.getDay() + 7) % 7 || 7; // days until the *next* Tuesday (never today)
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// A YYYY-MM-DD date rendered as "Tue, Nov 12" — parsed as local, not UTC, so
// it doesn't slip a day.
function fmtSessionDate(ymd: string | null): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/* Shown before generation kicks off: pick the date of the upcoming review
   session this guide is prep for. Defaults to the next Tuesday. */
function StudyGuideCreateModal({
  test, existingDate, onClose, onConfirm,
}: {
  test: SavedTest;
  existingDate: string | null;
  onClose: () => void;
  onConfirm: (sessionDate: string | null) => void;
}) {
  const [date, setDate] = useState<string>(existingDate || nextTuesdayYmd());
  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 420 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Study guide · {test.name}</div>
            <div style={s.apTitle}>When's the session?</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={{ padding: "4px 22px 22px" }}>
          <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.6, margin: "0 0 14px" }}>
            Label this guide with the date of the review session it's prep for — it'll show on the guide and in the Study guides library.
          </p>
          <label style={{ display: "block", fontSize: 12.5, color: T.faint, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>
            Review session date
          </label>
          <input
            type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ width: "100%", padding: "9px 10px", borderRadius: 9, border: `1px solid ${T.paperEdge}`, fontSize: 14, color: T.text, background: "#fff" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button style={{ ...s.primarySm, opacity: date ? 1 : 0.5 }} disabled={!date} onClick={() => onConfirm(date || null)}>
              <BookOpen size={13} strokeWidth={2.3} /> Generate study guide
              <CostChip amount={GUIDE_COST} light />
            </button>
            <button style={{ ...s.ghost, marginLeft: 0 }} onClick={() => onConfirm(null)} title="Generate without a session date">
              Skip date
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TestsPanel({
  tests, byId, onClose, onStudy, onHost, onPptx, onRename, onDelete, guidesByTest, onStudyGuide, onOpenGuide, onSlides, canGenerate,
}: {
  tests: SavedTest[];
  byId: Map<string, RawQuestion>;
  onClose: () => void;
  onStudy: (t: SavedTest) => void;
  onHost: (t: SavedTest) => void;
  onPptx: (t: SavedTest) => void;
  onRename: (t: SavedTest) => void;
  onDelete: (t: SavedTest) => void;
  guidesByTest: Record<string, StudyGuide>;
  onStudyGuide: (t: SavedTest) => void;
  onOpenGuide: (t: SavedTest, guide: StudyGuide) => void;
  onSlides: (t: SavedTest) => void;
  canGenerate: boolean; // admins + education-chief allowlist — generation costs money
}) {
  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 560 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Class sessions · saved sets</div>
            <div style={s.apTitle}>Tests</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        {tests.length === 0 ? (
          <p style={{ ...s.apEmpty, fontStyle: "normal", fontSize: 14.5, lineHeight: 1.7, padding: "26px 22px 30px", textAlign: "center", margin: 0 }}>
            <b style={{ display: "block", fontSize: 15.5, marginBottom: 8 }}>No saved tests yet</b>
            Open <b>Search</b>, check the questions you want, and hit <b>Save as test</b> —
            then run it here as a live poll, restudy it, or export it to PowerPoint.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {tests.map((t) => {
              const found = t.qids.filter((id) => byId.has(id)).length;
              return (
                <div key={t.id} style={{ border: `1px solid ${T.paperEdge}`, borderRadius: 12, padding: "12px 14px", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 15.5, color: T.text }}>{t.name}</b>
                    <span style={{ fontSize: 12.5, color: T.faint }}>
                      {found} question{found === 1 ? "" : "s"}{found !== t.qids.length ? ` (${t.qids.length - found} not in this bank)` : ""} · saved {new Date(t.created).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    <button style={s.primarySm} onClick={() => onHost(t)} title="Run this test as a live class poll">
                      <Radio size={13} strokeWidth={2.3} /> Host poll
                    </button>
                    <button style={{ ...s.ghost, marginLeft: 0 }} onClick={() => onStudy(t)} title="Go through this test yourself">
                      <Target size={13} strokeWidth={2.3} /> Study
                    </button>
                    <button style={{ ...s.ghost, marginLeft: 0 }} onClick={() => onPptx(t)} title="Download as PowerPoint (question + reveal slide per question)">
                      <FileText size={13} strokeWidth={2.3} /> PowerPoint
                    </button>
                    {(() => {
                      const guide = guidesByTest[t.id];
                      const hasSlides = (guide?.slides?.length ?? 0) > 0;
                      // Mid-generation the study-guide section below already
                      // shows the shared progress bar — no second button here.
                      if (!hasSlides && guide?.status === "generating") return null;
                      // Generating costs money — chiefs/admins only. Once the
                      // slides exist this button is just a free download, so
                      // it stays for everyone.
                      if (!hasSlides && !canGenerate) return null;
                      return (
                        <button
                          style={hasSlides ? { ...s.ghost, marginLeft: 0, border: `1px solid ${T.teal}`, color: T.tealDeep, background: T.tealSoft } : { ...s.ghost, marginLeft: 0 }}
                          onClick={() => onSlides(t)}
                          title={hasSlides
                            ? "Prep slides already written — download the teaching deck (.pptx) to send as pre-reading"
                            : "Generate an AI teaching slide deck (.pptx) to send as pre-reading — background and context only, doesn't give away answers"}
                        >
                          {hasSlides ? <Download size={13} strokeWidth={2.3} /> : <Monitor size={13} strokeWidth={2.3} />} Prep slides
                          {!hasSlides && <CostChip amount={SLIDES_COST} />}
                        </button>
                      );
                    })()}
                    {(() => {
                      const guide = guidesByTest[t.id];
                      // Text is ready → the guide is already "made". Show a
                      // distinct check-marked View button (not the plain
                      // generate button) so nobody re-triggers it by mistake.
                      // Audio may still be rendering, or have failed — noted
                      // alongside, but the written guide is viewable now.
                      if (guide?.text_ready) {
                        return (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <button
                              style={{ ...s.ghost, marginLeft: 0, border: `1px solid ${T.teal}`, color: T.tealDeep, background: T.tealSoft }}
                              onClick={() => onOpenGuide(t, guide)}
                              title="Study guide already made — view it or copy the share link (Regenerate is inside)"
                            >
                              <Check size={13} strokeWidth={2.6} /> Study guide
                            </button>
                            {guide.status === "generating" && <span style={{ fontSize: 11.5, color: T.faint }}>audio…</span>}
                            {guide.status === "error" && <span style={{ fontSize: 11.5, color: T.wrongLine }} title={guide.error_message ?? ""}>audio failed</span>}
                          </span>
                        );
                      }
                      if (guide?.status === "generating") {
                        if (guideIsStuck(guide)) {
                          return (
                            <button style={{ ...s.ghost, marginLeft: 0, color: T.wrongLine }} onClick={() => onStudyGuide(t)} title="This is taking much longer than usual — click to restart it">
                              <BookOpen size={13} strokeWidth={2.3} /> Taking a while — retry?
                            </button>
                          );
                        }
                        const pct = guideProgressPercent(guide);
                        return (
                          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 4px", fontSize: 12.5, color: T.muted }}
                            title="Runs in the background — safe to close this panel, the Tests button will badge when it's ready">
                            <div style={{ width: 62, height: 6, borderRadius: 999, background: T.paperEdge, overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: T.teal, transition: "width 1s linear" }} />
                            </div>
                            {guideStageLabel[guide.stage ?? ""] ?? "Working"}… <span style={{ color: T.faint }}>({guideEtaLabel(guide)})</span>
                          </div>
                        );
                      }
                      if (!canGenerate) return null; // generating costs money — chiefs/admins only
                      return (
                        <button
                          style={{ ...s.ghost, marginLeft: 0, color: guide?.status === "error" ? T.wrongLine : undefined }}
                          onClick={() => onStudyGuide(t)}
                          title={guide?.status === "error"
                            ? `Last attempt failed: ${guide.error_message ?? "unknown error"} — click to retry`
                            : "Generate a prep page + ~10-min audio overview to send the class before the session — background and context only, doesn't give away answers"}
                        >
                          <BookOpen size={13} strokeWidth={2.3} /> {guide?.status === "error" ? "Retry study guide" : "Study guide"}
                          <CostChip amount={GUIDE_COST} />
                        </button>
                      );
                    })()}
                    <button style={{ ...s.ghost, marginLeft: 0 }} onClick={() => onRename(t)} title="Rename">
                      <Pencil size={13} strokeWidth={2.3} /> Rename
                    </button>
                    <button style={{ ...s.ghost, marginLeft: 0, color: T.wrongLine }} onClick={() => onDelete(t)} title="Delete this test">
                      <Trash2 size={13} strokeWidth={2.3} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* Shown right after a study guide is (re)generated: the shareable ?study=<id>
   link to paste into an email/chat to the class, plus a regenerate option. */
function StudyGuideShareModal({
  guide, onClose, onRegenerate, onAddAudio,
}: {
  guide: StudyGuide;
  onClose: () => void;
  onRegenerate: () => void;
  onAddAudio: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const regenerating = guide.status === "generating";
  // Guide written slides-first (no narration yet): offer to add just the
  // audio — the edge function narrates the stored script without rewriting.
  const audioMissing = guide.status === "ready" && !guide.audio_path;
  const link = studyGuideUrl(guide.id);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { window.prompt("Copy this link:", link); }
  };
  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 480 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>{regenerating ? "Rewriting — the old link still works meanwhile" : "Ready to send"}{guide.session_date ? ` · ${fmtSessionDate(guide.session_date)} session` : ""}</div>
            <div style={s.apTitle}>{guide.title}</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={{ padding: "4px 22px 22px" }}>
          <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.6, margin: "0 0 14px" }}>
            Send this link to the class to read (and listen to, ~10 min) before the session.
            It's background and context only — it won't give away the quiz answers.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()}
              style={{ flex: 1, minWidth: 0, padding: "9px 10px", borderRadius: 9, border: `1px solid ${T.paperEdge}`, fontSize: 13, color: T.text, background: "#fff" }} />
            <button style={s.primarySm} onClick={copy}>
              <Copy size={13} strokeWidth={2.3} /> {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <a href={link} target="_blank" rel="noreferrer" style={{ ...s.ghost, marginLeft: 0, textDecoration: "none", display: "inline-flex" }}>
              <ExternalLink size={13} strokeWidth={2.3} /> Preview
            </a>
            <button style={{ ...s.ghost, marginLeft: 0, opacity: regenerating ? 0.6 : 1 }} disabled={regenerating} onClick={onRegenerate}>
              <Sparkles size={13} strokeWidth={2.3} /> {regenerating ? "Rewriting…" : "Regenerate"}
              {!regenerating && <CostChip amount={GUIDE_COST} />}
            </button>
            {audioMissing && (
              <button style={{ ...s.ghost, marginLeft: 0 }} onClick={onAddAudio} title="Narrate the existing guide to a ~10-min audio overview (doesn't rewrite anything)">
                <Volume2 size={13} strokeWidth={2.3} /> Add audio
                <CostChip amount={AUDIO_COST} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* The prep page itself, opened either from the share modal's Preview link or
   by anyone the speaker sent the ?study=<id> link to. Reads the generated
   material aloud via the browser's built-in text-to-speech (no server cost,
   plays through whatever the phone/car is routed to) — chunked sentence by
   sentence so Play/Pause/Stop stay responsive on a ~10-minute script. */
function StudyGuideView({ id, onClose }: { id: string; onClose: () => void }) {
  const [guide, setGuide] = useState<StudyGuide | null | undefined>(undefined); // undefined = loading
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [linkCopied, setLinkCopied] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // chiefs/admins can kick off the missing narration right from the shared
  // page (e.g. when a run died mid-generation and left a text-only guide)
  const [canGen, setCanGen] = useState(false);
  const [kickingAudio, setKickingAudio] = useState(false);
  const [kickErr, setKickErr] = useState<string | null>(null);
  useEffect(() => { canGenerateStudyGuides().then(setCanGen); }, []);
  const addAudio = async () => {
    if (!guide || kickingAudio) return;
    setKickingAudio(true); setKickErr(null);
    // topics are only used when the text is rewritten — a ready guide with a
    // stored audio_script goes down the narrate-only path, so a stub is fine
    const res = await generateStudyGuide(guide.saved_test_id, guide.title, [{ stem: "(narration retry)" }], false, guide.session_date ?? null, false);
    setKickingAudio(false);
    if ("error" in res) setKickErr(res.error);
    else setGuide(res as StudyGuide); // status flips to generating → the poll below takes over
  };

  const copyLink = async () => {
    const link = studyGuideUrl(id);
    try { await navigator.clipboard.writeText(link); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1800); }
    catch { window.prompt("Copy this link:", link); }
  };

  // Same 0.5x-2.5x speed range as the AcademicWiki read-aloud player.
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate; }, [rate, audioUrl]);

  useEffect(() => {
    let alive = true;
    getStudyGuide(id).then((g) => { if (alive) setGuide(g); });
    return () => { alive = false; };
  }, [id]);

  // If opened while still generating (text ready, audio rendering), keep
  // polling so the audio player appears on its own once it's done — no manual
  // refresh needed.
  useEffect(() => {
    if (!guide || guide.status !== "generating") return;
    const timer = setInterval(() => { getStudyGuide(id).then((g) => { if (g) setGuide(g); }); }, 4000);
    return () => clearInterval(timer);
  }, [id, guide?.status]);

  // Lazily fetch the generated MP3 once the guide (and its audio_path) load;
  // revoke the blob: URL on unmount so it doesn't leak memory.
  useEffect(() => {
    if (!guide?.audio_path) return;
    let alive = true;
    let url: string | null = null;
    getStudyGuideAudioUrl(guide.audio_path).then((u) => {
      if (!alive) return;
      if (!u) { setAudioError("Couldn't load the audio for this guide."); return; }
      url = u; setAudioUrl(u);
    });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [guide?.audio_path]);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause(); else el.play().catch(() => setAudioError("Couldn't play the audio."));
  };
  const stop = () => {
    const el = audioRef.current;
    if (!el) return;
    el.pause(); el.currentTime = 0;
  };
  const seek = (secs: number) => {
    const el = audioRef.current;
    if (el) el.currentTime = secs;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: T.paper, zIndex: 60, overflowY: "auto" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <button style={{ ...s.ghost, marginLeft: 0 }} onClick={onClose}>
            <ArrowLeft size={14} strokeWidth={2.3} /> Back to Prite Daily
          </button>
          {guide && (
            <button style={{ ...s.ghost, marginLeft: 0 }} onClick={copyLink} title="Copy this guide's shareable link to send the class">
              <Copy size={14} strokeWidth={2.3} /> {linkCopied ? "Copied!" : "Copy link"}
            </button>
          )}
        </div>

        {guide === undefined && <p style={{ color: T.muted }}>Loading…</p>}
        {guide === null && <p style={{ color: T.muted }}>This study guide link isn't valid, or you may need to sign in.</p>}

        {guide && (
          <>
            <div style={{ fontSize: 12.5, letterSpacing: 0.4, textTransform: "uppercase", color: T.teal, fontWeight: 700, marginBottom: 6 }}>
              Prep material · doesn't give away the quiz{guide.session_date ? ` · ${fmtSessionDate(guide.session_date)} session` : ""}
            </div>
            <h1 style={{ fontSize: 30, lineHeight: 1.2, margin: "0 0 14px", color: T.ink }}>{guide.title}</h1>
            {guide.intro && <p style={{ fontSize: 16, lineHeight: 1.65, color: T.text, margin: "0 0 22px" }}>{guide.intro}</p>}

            {/* Audio: full player once ready; a "still recording" note while it
                renders (the written guide below is already readable); or a
                "couldn't generate" note if audio failed. */}
            {(guide.audio_path || guide.status === "generating" || canGen) && (
              <div style={{ padding: "14px 16px", borderRadius: 14, background: T.tealSoft, marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Volume2 size={18} strokeWidth={2.2} color={T.tealDeep} />
                  <div style={{ flex: 1, fontSize: 13.5, color: T.tealDeep }}>
                    <b>Listen instead</b> — a ~10-minute audio overview. Good for the car.
                  </div>
                  {audioUrl ? (
                    <>
                      <button style={s.primarySm} onClick={toggle}>
                        {playing ? <Pause size={13} strokeWidth={2.3} /> : <Play size={13} strokeWidth={2.3} />} {playing ? "Pause" : current > 0 ? "Resume" : "Play"}
                      </button>
                      <button style={{ ...s.ghost, marginLeft: 0 }} onClick={stop}><Square size={13} strokeWidth={2.3} /> Stop</button>
                    </>
                  ) : guide.audio_path && !audioError ? (
                    <span style={{ fontSize: 12.5, color: T.tealDeep }}>Loading audio…</span>
                  ) : guide.status === "generating" ? (
                    <span style={{ fontSize: 12.5, color: T.tealDeep }}>Recording… appears here when ready</span>
                  ) : canGen ? (
                    <button style={s.primarySm} onClick={addAudio} disabled={kickingAudio} title="Narrate this guide to a ~10-min audio overview (uses the already-written script — doesn't rewrite anything)">
                      <Volume2 size={13} strokeWidth={2.3} /> {kickingAudio ? "Starting…" : "Add audio"}
                    </button>
                  ) : (
                    <span style={{ fontSize: 12.5, color: T.tealDeep }}>No audio yet — an education chief can add it.</span>
                  )}
                </div>
                {kickErr && <div style={{ fontSize: 12.5, color: T.wrongLine, marginTop: 8 }}>Couldn't start the narration: {kickErr}</div>}
                {audioUrl && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                    <span style={{ fontSize: 12, color: T.tealDeep, minWidth: 34 }}>{fmtTime(Math.floor(current))}</span>
                    <input
                      type="range" min={0} max={duration || 0} step={1} value={Math.min(current, duration || 0)}
                      onChange={(e) => seek(Number(e.target.value))}
                      style={{ flex: 1, accentColor: T.teal }}
                    />
                    <span style={{ fontSize: 12, color: T.tealDeep, minWidth: 34 }}>{fmtTime(Math.floor(duration))}</span>
                  </div>
                )}
                {audioUrl && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: T.tealDeep }}>Speed</span>
                    <input
                      type="range" min={0.5} max={2.5} step={0.1} value={rate}
                      onChange={(e) => setRate(Number(e.target.value))}
                      style={{ width: 100, accentColor: T.teal }}
                    />
                    <span style={{ fontSize: 12, color: T.tealDeep, minWidth: 30 }}>{rate.toFixed(1)}×</span>
                  </div>
                )}
                <audio
                  ref={audioRef} src={audioUrl ?? undefined} preload="metadata"
                  onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                  onEnded={() => setPlaying(false)}
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                  onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
                  onError={() => setAudioError("Couldn't play the audio.")}
                  style={{ display: "none" }}
                />
              </div>
            )}
            {audioError && <p style={{ fontSize: 13, color: T.wrongLine, marginTop: -18, marginBottom: 24 }}>{audioError}</p>}

            {/* Teaching slides: the pre-reading alternative to the audio — a
                downloadable .pptx built from the guide's AI-written slide
                outline (guides generated before slides existed have none). */}
            {guide.text_ready && (guide.slides?.length ?? 0) > 0 && (
              <div style={{ padding: "14px 16px", borderRadius: 14, background: T.tealSoft, marginBottom: 28, display: "flex", alignItems: "center", gap: 10 }}>
                <Monitor size={18} strokeWidth={2.2} color={T.tealDeep} />
                <div style={{ flex: 1, fontSize: 13.5, color: T.tealDeep }}>
                  <b>Slides instead</b> — a {guide.slides.length + 2}-slide teaching deck with speaker notes. Good for skimming.
                </div>
                <button
                  style={s.primarySm}
                  onClick={() => exportTeachingPptx(guide, `${guide.title.replace(/[^\w\- ]+/g, "").trim() || "prite-prereading"}.pptx`)}
                  title="Download the pre-reading deck as PowerPoint"
                >
                  <Download size={13} strokeWidth={2.3} /> Download .pptx
                </button>
              </div>
            )}
            {guide.status === "error" && guide.text_ready && (
              <p style={{ fontSize: 13, color: T.wrongLine, margin: "0 0 24px" }}>
                Audio for this guide couldn't be generated — the written guide below is complete. (It can be regenerated from the Tests panel.)
              </p>
            )}

            {!guide.text_ready ? (
              <p style={{ fontSize: 15, color: T.muted, lineHeight: 1.6 }}>
                The written guide is still being generated… this page updates automatically — hang tight.
              </p>
            ) : (
              <>
                {guide.sections.map((sec, i) => (
                  <div key={i} style={{ marginBottom: 24 }}>
                    <h2 style={{ fontSize: 19, color: T.ink, margin: "0 0 8px" }}>{sec.heading}</h2>
                    <p style={{ fontSize: 15.5, lineHeight: 1.7, color: T.text, margin: 0, whiteSpace: "pre-wrap" }}>{sec.body}</p>
                  </div>
                ))}

                {guide.key_terms.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12.5, letterSpacing: 0.3, textTransform: "uppercase", color: T.faint, fontWeight: 700, marginBottom: 8 }}>Key terms</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {guide.key_terms.map((term, i) => (
                        <span key={i} style={{ fontSize: 13, padding: "5px 11px", borderRadius: 999, background: T.card, border: `1px solid ${T.paperEdge}`, color: T.text }}>{term}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* Every finished study guide any speaker in the residency has generated,
   newest first — so residents can find past sessions' prep material even
   without the original share link. RLS already makes study_guides readable
   residency-wide, so this is just a plain list, not "your" tests. */
function StudyGuideLibraryPanel({
  guides, onClose, onOpen,
}: {
  guides: LibraryStudyGuide[] | null;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyLink = async (id: string) => {
    const link = studyGuideUrl(id);
    try { await navigator.clipboard.writeText(link); setCopiedId(id); setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800); }
    catch { window.prompt("Copy this link:", link); }
  };
  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 600 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Residency-wide · past sessions</div>
            <div style={s.apTitle}>Study guides</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        {guides === null ? (
          <p style={{ ...s.apEmpty, textAlign: "center", padding: "26px 22px 30px" }}>Loading…</p>
        ) : guides.length === 0 ? (
          <p style={{ ...s.apEmpty, fontStyle: "normal", fontSize: 14.5, lineHeight: 1.7, padding: "26px 22px 30px", textAlign: "center", margin: 0 }}>
            <b style={{ display: "block", fontSize: 15.5, marginBottom: 8 }}>No study guides yet</b>
            When an education chief generates one from a saved test, it'll show up here for everyone to read and listen to.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10, maxHeight: "60vh", overflowY: "auto" }}>
            {guides.map((g) => (
              <div key={g.id} style={{ border: `1px solid ${T.paperEdge}`, borderRadius: 12, padding: "12px 14px", background: "#fff" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, justifyContent: "space-between" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                      <b style={{ fontSize: 15, color: T.text }}>{g.title}</b>
                      {g.session_date && (
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: T.tealDeep, background: T.tealSoft, padding: "2px 8px", borderRadius: 999 }}>
                          {fmtSessionDate(g.session_date)} session
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, color: T.faint, marginTop: 3 }}>
                      {g.creator_name ? `${g.creator_name} · ` : ""}{new Date(g.created_at).toLocaleDateString()}
                      {g.audio_path ? " · 🔊 audio" : ""}{(g.slides?.length ?? 0) > 0 ? " · 🖥 slides" : ""}
                    </div>
                    <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, margin: "6px 0 0" }}>{g.intro}</p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    <button style={s.primarySm} onClick={() => onOpen(g.id)} title="Read or listen to this guide">
                      <BookOpen size={13} strokeWidth={2.3} /> Open
                    </button>
                    <button style={{ ...s.ghost, marginLeft: 0 }} onClick={() => copyLink(g.id)} title="Copy the shareable link to send the class">
                      <Copy size={13} strokeWidth={2.3} /> {copiedId === g.id ? "Copied!" : "Copy link"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MissedPanel({
  missedIds, byId, answers, notes, onReview, onExport, onClear, onClose,
}: {
  missedIds: string[];
  byId: Map<string, RawQuestion>;
  answers: Record<string, AnswerRow>;
  notes: Record<string, string>;
  onReview: () => void;
  onExport: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const rows = missedIds.map((id) => ({ id, q: byId.get(id) })).filter((x) => x.q) as { id: string; q: RawQuestion }[];
  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 620 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Learning opportunities</div>
            <div style={s.apTitle}>Missed questions ({rows.length})</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.missActions}>
          <button style={s.apApprove} onClick={onReview}><RotateCcw size={13} strokeWidth={2.3} /> Review these</button>
          <button style={s.ghost} onClick={onExport}><Download size={13} strokeWidth={2.2} /> Export all</button>
          {rows.length > 0 && (
            <button style={s.missClear} onClick={onClear} title="Hide these from your learning opportunities (history is kept)"><Check size={13} strokeWidth={2.4} /> Clear all</button>
          )}
        </div>
        <div style={s.apBody}>
          {rows.length === 0 && <p style={s.apEmpty}>Nothing missed — go get some questions wrong. 😉</p>}
          {rows.map(({ id, q }) => {
            const a = answers[id];
            const correct = q.answer_letters?.length ? q.answer_letters : q.answer_letter ? [q.answer_letter] : [];
            return (
              <div key={id} style={s.missQ}>
                <div style={s.eyebrow2}>{q.year} · Q{q.q_index}</div>
                <p style={s.missStem}>{q.stem}</p>
                <div style={s.missMeta}>
                  <span style={{ color: T.correctText }}>Correct: <b>{correct.join(", ")}</b>{q.answer_text ? ` — ${q.answer_text}` : ""}</span>
                  {a && <span style={{ color: T.wrongText }}>· You: {a.picked.join(", ")}</span>}
                </div>
                {notes[id] && <div style={s.missNote}>{notes[id]}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Spaced-repetition (SM-2) flashcard review of missed questions. Card
    content is the shared AI cloze card for the question (front = cloze_text,
    back = extra); if one hasn't been generated yet it's created on the fly,
    same as the per-question Flashcard tab. */
function ReviewPanel({
  due, byId, onGrade, onClose, bareScrim = false,
}: {
  due: SrsRow[];
  byId: Map<string, RawQuestion>;
  onGrade: (qid: string, grade: SrsGrade) => Promise<void>;
  onClose: () => void;
  bareScrim?: boolean; // when wrapped in ImmersiveScene, drop our own dark scrim so the settled room shows through
}) {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [card, setCard] = useState<Flashcard | null>(null);
  const [busy, setBusy] = useState(false);
  const [grading, setGrading] = useState(false);
  // One-time expectations note: web cards are the low-friction option, Anki
  // is probably the better one. Dismissal is remembered per device.
  const [showAnkiNote, setShowAnkiNote] = useState<boolean>(() => !readPref("pd_webcards_note_dismissed", false));
  const dismissAnkiNote = () => { setShowAnkiNote(false); writePref("pd_webcards_note_dismissed", true); schedulePrefsPush(); };

  const row = due[i];
  const q = row ? byId.get(row.question_id) : undefined;

  useEffect(() => {
    setRevealed(false); setCard(null);
    if (!row || !q) return;
    let cancelled = false;
    setBusy(true);
    getFlashcard(row.question_id).then(async (existing) => {
      if (cancelled) return;
      if (existing) { setCard(existing); setBusy(false); return; }
      // No cached card yet (rare — mainly very recently added questions) — generate one.
      const gen = await generateFlashcard({
        question_id: row.question_id, stem: q.stem, options: q.options,
        answer_letter: q.answer_letter, answer_text: q.answer_text,
      });
      if (cancelled) return;
      if (!("error" in gen)) setCard(gen);
      setBusy(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.question_id]);

  const prevState: SrsState = row
    ? { ease_factor: row.ease_factor, interval_days: row.interval_days, repetitions: row.repetitions }
    : SRS_DEFAULT;

  const grade = async (g: SrsGrade) => {
    if (!row || grading) return;
    setGrading(true);
    await onGrade(row.question_id, g);
    setGrading(false);
    setI((n) => n); // due[] shrinks under us (filtered by the parent); i stays put so the next card slides into this slot
  };

  return (
    <div style={bareScrim ? { ...s.scrim, background: "transparent", backdropFilter: "none", WebkitBackdropFilter: "none" } : s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 620 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Spaced repetition · SM-2</div>
            <div style={s.apTitle}>Web flashcards{due.length ? ` (${due.length} due)` : ""}</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.apBody}>
          {showAnkiNote && (
            <div style={s.webCardsNote}>
              <Lightbulb size={14} strokeWidth={2.3} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ flex: 1 }}>
                Heads-up: these web flashcards probably aren't as effective as studying the same
                cards in Anki — but they're a handy option if you don't want to go through the
                Anki download and import process.
              </span>
              <button style={s.webCardsNoteBtn} onClick={dismissAnkiNote}>Got it</button>
            </div>
          )}
          {due.length === 0 && (
            <p style={s.apEmpty}>Nothing due right now — cards resurface here after you miss a question, on an increasing schedule as you get them right.</p>
          )}
          {due.length > 0 && !q && (
            <p style={s.apEmpty}>All caught up for this session. 🎉</p>
          )}
          {row && q && (
            <div>
              <div style={s.eyebrow2}>{q.year} · Q{q.q_index}{row.repetitions > 0 ? ` · reviewed ${row.reviewed_count}x` : " · new"}</div>
              {busy && !card ? (
                <p style={{ ...s.apEmpty, fontStyle: "normal" }}>Loading card…</p>
              ) : card ? (
                <>
                  <p style={s.stem}>{revealed ? renderClozeResolved(card.cloze_text) : renderClozePreview(card.cloze_text)}</p>
                  {!revealed ? (
                    <button style={{ ...s.apApprove, padding: "10px 20px", fontSize: 14 }} onClick={() => setRevealed(true)}>
                      Show answer
                    </button>
                  ) : (
                    <>
                      <p style={s.expl}>{card.extra}</p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                        {SRS_GRADES.map(({ grade: g, label }) => {
                          const next = sm2Next(prevState, g);
                          const color =
                            g === "again" ? T.wrongText : g === "hard" ? T.gold : g === "good" ? T.teal : T.correctText;
                          return (
                            <button
                              key={g}
                              disabled={grading}
                              onClick={() => grade(g)}
                              style={{
                                flex: "1 1 100px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                                background: "#fff", border: `1.5px solid ${color}`, color, borderRadius: 10,
                                padding: "9px 6px", fontSize: 13.5, fontWeight: 700, cursor: grading ? "default" : "pointer",
                                opacity: grading ? 0.6 : 1,
                              }}
                            >
                              {label}
                              <span style={{ fontSize: 11, fontWeight: 500, color: T.muted }}>{intervalLabel(next.interval_days)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <p style={s.apEmpty}>Couldn't load a card for this question — try again shortly.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Leaderboard({ rows, meId, onClose, bareScrim = false }: { rows: LeaderRow[]; meId?: string; onClose: () => void; bareScrim?: boolean }) {
  const ranked = rows.filter((r) => r.answered > 0);
  return (
    <div style={bareScrim ? { ...s.scrim, background: "transparent", backdropFilter: "none", WebkitBackdropFilter: "none" } : s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 460 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Class standings</div>
            <div style={s.apTitle}>Leaderboard</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.apBody}>
          {ranked.length === 0 && <p style={s.apEmpty}>No questions answered yet. Be the first to get on the board.</p>}
          {ranked.map((r, i) => {
            const me = r.user_id === meId;
            return (
              <div key={r.user_id} style={{ ...s.lbRow, ...(me ? s.lbMe : {}) }}>
                <span style={{ ...s.lbRank, ...(i < 3 ? { color: [T.gold, "#97a0ab", "#b07a4f"][i], fontWeight: 700 } : {}) }}>{i + 1}</span>
                <span style={{ ...s.apAvatar, background: me ? T.teal : T.inkSoft, width: 30, height: 30 }}>{initials(r.full_name)}</span>
                <span style={s.lbName}>{me ? "You" : r.full_name}</span>
                <span style={s.lbDone}>{r.answered}</span>
              </div>
            );
          })}
          <div style={s.lbFoot}><span>questions answered →</span></div>
        </div>
      </div>
    </div>
  );
}

function TrainingLevelGate({ onSaved }: { onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const groups: { heading: string; opts: [string, string][] }[] = [
    { heading: "Resident", opts: [["R1", "R1 · PGY-1"], ["R2", "R2 · PGY-2"], ["R3", "R3 · PGY-3"], ["R4", "R4 · PGY-4"]] },
    { heading: "Child & Adolescent Fellow", opts: [["F1", "F1 · 1st year"], ["F2", "F2 · 2nd year"]] },
    { heading: "Other", opts: [["faculty", "Faculty"], ["alumni", "Alumni"]] },
  ];
  const pick = async (level: string) => {
    setSaving(true);
    await setTrainingLevel(level);
    await onSaved();
  };
  return (
    <div style={s.gateRoot}>
      <style>{CSS}</style>
      <div style={{ ...s.gateCard, maxWidth: 460 }}>
        <span style={s.gateMark}><Stethoscope size={22} strokeWidth={2.3} color="#fff" /></span>
        <h1 style={s.gateTitle}>One quick thing</h1>
        <p style={s.gateSub}>What's your training level? This powers the class insights and cohort comparisons.</p>
        {groups.map((g) => (
          <div key={g.heading} style={{ marginBottom: 14, textAlign: "left" }}>
            <div style={s.tlHeading}>{g.heading}</div>
            <div style={s.tlRow}>
              {g.opts.map(([code, label]) => (
                <button key={code} style={s.tlBtn} disabled={saving} onClick={() => pick(code)}>{label}</button>
              ))}
            </div>
          </div>
        ))}
        <p style={s.gateFine}>You can't change this yourself later — ask an admin if you advance a year.</p>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

/* ---------------------------------------------------------------------- */
/* Motivation-reward sheet with iOS-style drag-to-dismiss: 1:1 tracking from
   wherever it's grabbed (card chrome, not the iframe), rubber-banding when
   dragged upward, and on release a momentum projection decides dismiss vs.
   spring-back — with the finger's velocity handed off to the animation so
   there's no seam between dragging and animating. */
/* A little hand-drawn bird that flies around the screen for ~12 seconds.
   Spring-steered wander: it accelerates toward a waypoint, picks a new one
   as it arrives, banks into turns, bobs on a sine, and finally exits
   off the top-right. Click it to shoo it away early. */
function BirdFlight({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduced) {
      // perched, not flying: appear near the top, sit for a moment, leave
      el.style.transform = `translate(${window.innerWidth / 2 - 32}px, ${window.innerHeight * 0.22}px)`;
      const t = setTimeout(onDone, 4000);
      return () => clearTimeout(t);
    }
    let raf = 0;
    let x = -90, y = window.innerHeight * 0.45, vx = 120, vy = -40;
    let tx = 0, ty = 0, dir = 1, leaving = false, last = performance.now();
    const start = last;
    const pick = () => {
      tx = 50 + Math.random() * (window.innerWidth - 150);
      ty = 40 + Math.random() * (window.innerHeight * 0.65);
    };
    pick();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      const t = (now - start) / 1000;
      if (t > 11 && !leaving) { leaving = true; tx = window.innerWidth + 200; ty = -140; }
      // under-damped spring toward the waypoint = swoopy, bird-like paths
      vx += ((tx - x) * 2.4 - vx * 1.5) * dt;
      vy += ((ty - y) * 2.4 - vy * 1.5) * dt;
      x += vx * dt; y += vy * dt + Math.sin(t * 7.5) * 0.9;
      if (!leaving && Math.hypot(tx - x, ty - y) < 70) pick();
      if (Math.abs(vx) > 12) dir = vx >= 0 ? 1 : -1;
      const bank = Math.max(-20, Math.min(20, vy * 0.045)) * dir;
      el.style.transform = `translate(${x}px, ${y}px) scaleX(${dir}) rotate(${bank}deg)`;
      if (leaving && (x > window.innerWidth + 150 || y < -150)) { onDone(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [onDone]);
  return (
    <div ref={ref} onClick={onDone} title="Shoo" style={{ position: "fixed", left: 0, top: 0, zIndex: 95, cursor: "pointer", willChange: "transform", lineHeight: 0, filter: "drop-shadow(0 6px 10px rgba(0,0,0,.35))" }}>
      <svg width="64" height="52" viewBox="0 0 64 52" aria-label="A little bird">
        {/* tail */}
        <path d="M14 28 L2 20 L6 30 L2 38 Z" fill="#0e7a6b" />
        {/* body */}
        <ellipse cx="27" cy="30" rx="16" ry="11" fill="#12907e" />
        {/* belly */}
        <ellipse cx="30" cy="34" rx="11" ry="6.5" fill="#7ee0cf" />
        {/* head */}
        <circle cx="43" cy="19" r="9.5" fill="#12907e" />
        {/* beak */}
        <path d="M51 16.5 L61 20 L51 23 Z" fill="#e8c069" />
        {/* eye */}
        <circle cx="46" cy="17" r="2.6" fill="#fff" />
        <circle cx="46.9" cy="17.3" r="1.3" fill="#11131c" />
        {/* wing — flaps via CSS */}
        <path className="birdWing" d="M24 27 Q14 8 38 12 Q34 24 26 29 Z" fill="#0b5f54" />
        {/* feet tucked in flight */}
        <path d="M22 40 q2 3 4 1 M28 41 q2 3 4 1" stroke="#e8c069" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}

const REWARD_TILES: { kind: RewardKind | "bird"; emoji: string; label: string; sub: string }[] = [
  { kind: "motivation", emoji: "🔥", label: "Motivation", sub: "a reel to fire you up" },
  { kind: "funny", emoji: "😂", label: "Something funny", sub: "from the psychiatry stash" },
  { kind: "trip", emoji: "✈️", label: "Trip idea", sub: "somewhere to dream about" },
  { kind: "bird", emoji: "🐦", label: "A little bird", sub: "it flies around, that's it" },
];

function RewardSheet({ onClose, onBird }: { onClose: () => void; onBird: () => void }) {
  const [kind, setKind] = useState<RewardKind | null>(null);
  const [post, setPost] = useState<string | null>(null);
  const choose = (k: RewardKind | "bird") => {
    if (k === "bird") { onBird(); return; }
    setKind(k); setPost(nextRewardPost(k));
  };
  const cardRef = useRef<HTMLDivElement | null>(null);
  const scrimRef = useRef<HTMLDivElement | null>(null);
  const d = useRef({ active: false, startY: 0, y: 0, hist: [] as { t: number; y: number }[], anim: 0 });
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  const setY = (y: number) => {
    d.current.y = y;
    if (cardRef.current) cardRef.current.style.transform = y ? `translateY(${y}px)` : "";
    // scrim dims in proportion to how far the sheet has been pulled — the
    // dim reads as a property of the sheet's position, not a separate fade
    if (scrimRef.current) scrimRef.current.style.opacity = String(Math.max(0, Math.min(1, 1 - y / 520)));
  };
  const stopAnim = () => cancelAnimationFrame(d.current.anim);
  useEffect(() => stopAnim, []);

  // critically damped spring to 0 (damping 1.0, response .4) with velocity handoff
  const springBack = (v0: number) => {
    let x = d.current.y, v = v0, last = performance.now();
    const w = (2 * Math.PI) / 0.4;
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      v += (-2 * w * v - w * w * x) * dt; x += v * dt;
      if (Math.abs(x) < 0.5 && Math.abs(v) < 20) { setY(0); return; }
      setY(x);
      d.current.anim = requestAnimationFrame(step);
    };
    d.current.anim = requestAnimationFrame(step);
  };
  // continue the throw off-screen at the finger's velocity, then unmount
  const throwOut = (v0: number) => {
    const top = cardRef.current?.getBoundingClientRect().top ?? 0;
    const end = window.innerHeight - top + d.current.y + 60;
    let x = d.current.y, v = Math.max(v0, 900), last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      v += 2600 * dt; x += v * dt;
      if (x >= end) { onClose(); return; }
      setY(x);
      d.current.anim = requestAnimationFrame(step);
    };
    d.current.anim = requestAnimationFrame(step);
  };
  const dismiss = (v0 = 1100) => { if (reduced) onClose(); else throwOut(v0); };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("button, a, iframe")) return;
    stopAnim();
    d.current.active = true;
    d.current.startY = e.clientY - d.current.y; // respect the grab offset
    d.current.hist = [{ t: e.timeStamp, y: e.clientY }];
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* keep tracking uncaptured */ }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!d.current.active) return;
    let y = e.clientY - d.current.startY;
    if (y < 0) { const c = 0.55, dim = 300; y = (y * dim * c) / (dim + c * Math.abs(y)); } // rubber-band upward
    setY(y);
    const h = d.current.hist;
    h.push({ t: e.timeStamp, y: e.clientY });
    while (h.length > 2 && e.timeStamp - h[0].t > 100) h.shift();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!d.current.active) return;
    d.current.active = false;
    const h = d.current.hist;
    const dt = (e.timeStamp - h[0].t) / 1000;
    const vel = dt > 0.004 ? (e.clientY - h[0].y) / dt : 0; // px/s
    if (reduced) { d.current.y > 160 || vel > 500 ? onClose() : setY(0); return; }
    // momentum projection (deceleration .998): where would it come to rest?
    const projected = d.current.y + (vel / 1000) * (0.998 / (1 - 0.998));
    if (vel > 450 || (projected > 220 && vel > -300)) throwOut(vel);
    else springBack(vel);
  };
  const onPointerCancel = () => { if (d.current.active) { d.current.active = false; reduced ? setY(0) : springBack(0); } };

  return (
    <div ref={scrimRef} style={s.scrim} onClick={() => dismiss()}>
      <div
        ref={cardRef}
        style={{ background: T.ink, border: "1px solid rgba(255,255,255,.12)", borderRadius: 18, padding: 14, width: "min(420px, 94vw)", boxShadow: "0 30px 80px -20px rgba(0,0,0,.8)", touchAction: "none", cursor: "grab", willChange: "transform" }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="materialize"
      >
        <div style={{ width: 36, height: 5, borderRadius: 3, background: "rgba(255,255,255,.28)", margin: "-4px auto 10px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "#fff" }}>
          {post && (
            <button style={{ ...s.doneBtn, background: "transparent", padding: "4px 6px", marginLeft: -4 }} onClick={() => { setKind(null); setPost(null); }} title="Pick a different reward"><ArrowLeft size={15} strokeWidth={2.4} /></button>
          )}
          <Flame size={16} strokeWidth={2.4} color={T.teal} />
          <b style={{ fontSize: 14.5, flex: 1, letterSpacing: "-0.01em" }}>{post ? "You earned this." : "Set complete — pick your reward."}</b>
          <button style={{ ...s.doneBtn, background: "transparent", padding: "4px 8px" }} onClick={() => dismiss()} title="Close"><X size={15} strokeWidth={2.4} /></button>
        </div>
        {!post ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "4px 2px 2px" }}>
            {REWARD_TILES.map((tile) => (
              <button
                key={tile.kind}
                className="rewardTile"
                onClick={() => choose(tile.kind)}
                style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, background: T.inkSoft, border: `1px solid ${T.inkLine}`, borderRadius: 14, padding: "14px 14px 12px", cursor: "pointer", textAlign: "left" }}
              >
                <span style={{ fontSize: 26, lineHeight: 1 }}>{tile.emoji}</span>
                <b style={{ fontSize: 14, color: "#fff", letterSpacing: "-0.01em", marginTop: 4 }}>{tile.label}</b>
                <span style={{ fontSize: 11.5, color: "#9aa0ab", lineHeight: 1.35 }}>{tile.sub}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            {post.startsWith("meme:") ? (
              <img
                key={post}
                src={post.slice(5)}
                alt="Residency meme"
                style={{ display: "block", width: "100%", maxHeight: "min(560px, 68vh)", objectFit: "contain", borderRadius: 10, background: "#000" }}
              />
            ) : (
              <iframe
                key={post}
                src={`https://www.instagram.com/${post}/embed/`}
                style={{ width: "100%", height: "min(560px, 68vh)", border: "none", borderRadius: 10, background: "#000" }}
                allow="autoplay; encrypted-media"
                allowFullScreen
                title="Motivation reward"
              />
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
              <button style={{ ...s.doneBtn, background: "transparent" }} onClick={() => kind && setPost(nextRewardPost(kind))}><RotateCcw size={13} strokeWidth={2.3} /> Another one</button>
              <button style={s.doneBtn} onClick={() => dismiss()}><Check size={13} strokeWidth={2.6} /> Back to work</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const CSS = `
* { box-sizing: border-box; }
button { font-family: inherit; -webkit-appearance: none; appearance: none; }
.opt:hover:not(:disabled) { border-color: ${T.teal}33 !important; transform: translateY(-1px); box-shadow: 0 8px 20px -14px rgba(20,24,40,.4); }
.opt:disabled { cursor: default; }
.opt { transition: transform .12s cubic-bezier(.2,.7,.3,1), border-color .12s ease, box-shadow .15s ease; }
.tab:hover { color: ${T.text}; }
/* Exam focus mode: fade the surrounding chrome down to a whisper, bring it
   back on hover so the question is the only thing competing for attention. */
.examDim { opacity: .1; transition: opacity .4s ease; }
.examDim:hover, .examDim:focus-within { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .examDim { opacity: .55; } }
.topActBtn { transition: filter .15s ease, transform .16s cubic-bezier(.2,.7,.3,1); }
.topActBtn:hover { filter: brightness(1.22); }
.rewardTile { transition: transform .16s cubic-bezier(.2,.7,.3,1), border-color .15s ease, background .15s ease; }
.rewardTile:hover { transform: translateY(-2px); border-color: ${T.teal}66 !important; background: #2b3145 !important; }
.birdWing { transform-origin: 26px 26px; animation: birdFlap .3s ease-in-out infinite alternate; }
@keyframes birdFlap { from { transform: rotate(-34deg); } to { transform: rotate(16deg); } }
.fade { animation: fade .28s ease both; }
@keyframes fade { from { opacity: 0; transform: translateY(4px); } }
.dist { animation: grow .6s cubic-bezier(.22,.61,.36,1) both; }
@keyframes grow { from { width: 0 !important; } }
.toast { animation: tin .3s ease both; }
@keyframes tin { from { opacity: 0; transform: translateY(8px); } }
/* Press feedback: instant on pointer-down (short in), soft springy release (longer out). */
button:not(.opt) { transition: transform .16s cubic-bezier(.2,.7,.3,1); }
button:not(.opt):active { transform: scale(.96); transition-duration: .06s; }
.opt:active:not(:disabled) { transform: scale(.99); transition-duration: .06s; }
/* Modal surfaces materialize (scale + settle) instead of hard-cutting in;
   scrims fade separately so the dim reads as a layer beneath the surface. */
.materialize { animation: materialize .34s cubic-bezier(.22,.9,.3,1.04) both; }
@keyframes materialize { from { opacity: 0; transform: scale(.96) translateY(10px); } }
.scrimIn { animation: scrimIn .22s ease both; }
@keyframes scrimIn { from { opacity: 0; } }
.pop { animation: pop .5s cubic-bezier(.3,1.4,.5,1) both; }
@keyframes pop {
  0% { box-shadow: 0 0 0 0 ${T.correctLine}00; }
  35% { transform: scale(1.015); box-shadow: 0 0 0 4px ${T.correctLine}33; }
  100% { transform: scale(1); box-shadow: 0 0 0 0 ${T.correctLine}00; }
}
.slidein { animation: slidein .34s cubic-bezier(.22,.7,.3,1) both; }
@keyframes slidein { from { opacity: 0; transform: translateY(-6px); } }
.rise { animation: rise .26s cubic-bezier(.22,.61,.36,1) both; }
@keyframes rise { from { opacity: 0; transform: translateY(14px) scale(.98); } }
.streakPop { animation: streakPop .5s cubic-bezier(.2,1.4,.4,1) both; }
@keyframes streakPop { 0% { opacity: 0; transform: translateY(-18px) scale(.85); } 60% { transform: translateY(0) scale(1.04); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
.streakGlow { animation: streakPop .5s cubic-bezier(.2,1.4,.4,1) both, streakGlow 1.5s ease-in-out .5s infinite; }
@keyframes streakGlow { 0%, 100% { box-shadow: 0 24px 60px -20px rgba(0,0,0,.7), 0 0 0 0 rgba(242,193,78,0); } 50% { box-shadow: 0 24px 60px -20px rgba(0,0,0,.7), 0 0 26px 2px rgba(242,193,78,.45); } }
.balloonRiseA, .balloonRiseB { position: absolute; bottom: -14vh; line-height: 1; opacity: 0; will-change: transform, opacity; animation-timing-function: ease-in; animation-fill-mode: both; }
.balloonRiseA { animation-name: balloonRiseA; }
.balloonRiseB { animation-name: balloonRiseB; }
@keyframes balloonRiseA { 0% { transform: translateY(0) rotate(-6deg); opacity: 0; } 12% { opacity: .95; } 88% { opacity: .95; } 100% { transform: translateY(-118vh) translateX(26px) rotate(6deg); opacity: 0; } }
@keyframes balloonRiseB { 0% { transform: translateY(0) rotate(6deg); opacity: 0; } 12% { opacity: .95; } 88% { opacity: .95; } 100% { transform: translateY(-118vh) translateX(-26px) rotate(-6deg); opacity: 0; } }
.penguinDance { display: inline-block; animation: penguinDance 0.9s ease-in-out infinite; }
@keyframes penguinDance { 0%, 100% { transform: translateY(0) rotate(-10deg); } 50% { transform: translateY(-16px) rotate(10deg); } }
.tabInd { transition: left .32s cubic-bezier(.5,.1,.2,1), width .32s cubic-bezier(.5,.1,.2,1), top .25s ease; }
textarea, input, select { font-family: inherit; }
textarea:focus, input:focus, select:focus { outline: 2px solid ${T.teal}55; outline-offset: 1px; }
button { -webkit-tap-highlight-color: transparent; }
button:focus { outline: none; }
button:focus-visible { outline: 2px solid ${T.teal}; outline-offset: 2px; }
::selection { background: ${T.tealSoft}; }
/* --- animated sign-in gate ---
   Perf ground rules learned the hard way: no filter: blur() (glow falloff is
   baked into the radial gradients), no will-change, no animated box-shadow —
   the first version's giant blurred layers exceeded the compositor's GPU
   budget and whole layers (the card!) stopped painting after a few seconds. */
.gateAurora { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.gateBlob { position: absolute; border-radius: 50%; }
.gateBlobA { width: 58vmax; height: 58vmax; top: -20vmax; left: -16vmax; background: radial-gradient(circle at 42% 42%, rgba(14,122,107,.38) 0%, rgba(14,122,107,.16) 34%, rgba(14,122,107,0) 66%); animation: gateBlobA 26s ease-in-out infinite alternate; }
.gateBlobB { width: 52vmax; height: 52vmax; bottom: -22vmax; right: -16vmax; background: radial-gradient(circle at 50% 50%, rgba(191,138,48,.26) 0%, rgba(191,138,48,.10) 36%, rgba(191,138,48,0) 66%); animation: gateBlobB 33s ease-in-out infinite alternate; }
.gateBlobC { width: 40vmax; height: 40vmax; top: 24%; left: 54%; background: radial-gradient(circle at 50% 50%, rgba(70,86,201,.22) 0%, rgba(70,86,201,.08) 36%, rgba(70,86,201,0) 64%); animation: gateBlobC 21s ease-in-out infinite alternate; }
@keyframes gateBlobA { to { transform: translate(10vmax, 8vmax) scale(1.22); } }
@keyframes gateBlobB { to { transform: translate(-9vmax, -7vmax) scale(.88); } }
@keyframes gateBlobC { to { transform: translate(-12vmax, 7vmax) scale(1.3); } }
/* Parallax depth layers for the gate backdrop: --mx/--my (set on gateRoot in
   SignIn, one per mousemove, no re-render) inherit down to each layer, which
   scales them by its own depth. A CSS transition smooths the per-pixel JS
   updates into a drift instead of a jitter. */
.gateParallax { position: absolute; inset: 0; transition: transform .5s cubic-bezier(.2,.6,.3,1); }
.gateParallaxFar { transform: translate(calc(var(--mx, 0) * 10px), calc(var(--my, 0) * 8px)); }
.gateParallaxMid { transform: translate(calc(var(--mx, 0) * 20px), calc(var(--my, 0) * 16px)); }
.gateParallaxNear { transform: translate(calc(var(--mx, 0) * 34px), calc(var(--my, 0) * 26px)); }
.gateGrid { position: absolute; inset: -30px; background-image: radial-gradient(rgba(255,255,255,.13) 1px, transparent 1.6px); background-size: 26px 26px; -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 45%, #000 25%, transparent 72%); mask-image: radial-gradient(ellipse 70% 60% at 50% 45%, #000 25%, transparent 72%); animation: gateGridPan 30s linear infinite; }
@keyframes gateGridPan { to { transform: translate(26px, 26px); } }
.gateGhost { position: absolute; color: rgba(126,224,207,.13); animation-name: gateGhostFloat; animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
@keyframes gateGhostFloat { 0%, 100% { transform: translate(0, 0) rotate(-7deg); } 50% { transform: translate(16px, -26px) rotate(8deg); } }
.gateSpark { position: absolute; bottom: -12px; border-radius: 50%; background: #7ee0cf; box-shadow: 0 0 10px 2px rgba(126,224,207,.4); opacity: 0; animation-name: gateSparkRise; animation-timing-function: linear; animation-iteration-count: infinite; }
@keyframes gateSparkRise { 0% { transform: translateY(0); opacity: 0; } 8% { opacity: .85; } 85% { opacity: .3; } 100% { transform: translateY(-104vh); opacity: 0; } }
/* Ribbon burst: a single curve periodically splits into a fan of gradient
   ribbons and settles back — ported from a CSS/SVG effect (no JS animation
   library needed) rather than reaching for framer-motion/motion, matching
   every other gate effect here. */
.gateRibbon { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.gateRibbonSvg { position: absolute; }
.gateRibbonPath { fill: none; stroke: url(#gateRibbonGrad); stroke-width: 2; stroke-linecap: round; }
.gateRibbonBase { opacity: .7; animation: gateRibbonBaseFade 7s ease-in-out infinite; }
@keyframes gateRibbonBaseFade { 0%, 55% { opacity: .7; } 64%, 86% { opacity: 0; } 96%, 100% { opacity: .7; } }
.gateRibbonFan { opacity: 0; animation: gateRibbonFan 7s ease-out infinite; }
@keyframes gateRibbonFan {
  0%, 58% { opacity: 0; transform: translateY(0); }
  64% { opacity: 1; transform: translateY(calc(var(--dy) * .4)); }
  78% { opacity: 1; transform: translateY(var(--dy)); }
  88%, 100% { opacity: 0; transform: translateY(0); }
}
.gateRing { position: relative; border-radius: 20px; padding: 1.5px; overflow: hidden; background: rgba(255,255,255,.09); box-shadow: 0 30px 80px -30px rgba(0,0,0,.65); z-index: 1; }
.gateRing::before { content: ""; position: absolute; inset: -55%; background: conic-gradient(from 0deg, rgba(46,196,169,0) 0deg, rgba(46,196,169,0) 120deg, rgba(46,196,169,.9) 165deg, rgba(232,192,105,.9) 190deg, rgba(46,196,169,0) 235deg, rgba(46,196,169,0) 360deg); animation: gateRingSpin 6.5s linear infinite; }
.gateRing > * { position: relative; z-index: 1; }
.gateRing::after { content: ""; position: absolute; inset: 1.5px; border-radius: 18.5px; background: radial-gradient(430px circle at var(--glareX, 50%) var(--glareY, 18%), rgba(255,255,255,.16), rgba(255,255,255,0) 58%); pointer-events: none; z-index: 2; }
@keyframes gateRingSpin { to { transform: rotate(360deg); } }
.gateTilt { transform: perspective(950px) rotateX(var(--tiltX, 0deg)) rotateY(var(--tiltY, 0deg)); transition: transform .18s ease-out; }
.gateIn { animation: gateIn .8s cubic-bezier(.22,.9,.32,1.15) backwards; }
@keyframes gateIn { from { opacity: 0; transform: translateY(26px) scale(.94); } }
.gs1, .gs2, .gs3, .gs4 { animation: gateItem .55s cubic-bezier(.22,.7,.3,1) backwards; }
.gs1 { animation-delay: .3s; } .gs2 { animation-delay: .42s; } .gs3 { animation-delay: .54s; } .gs4 { animation-delay: .66s; }
@keyframes gateItem { from { opacity: 0; transform: translateY(10px); } }
.gateMarkAnim { animation: gateItem .55s cubic-bezier(.22,.7,.3,1) .18s backwards, gateMarkFloat 4.6s ease-in-out 1s infinite; }
@keyframes gateMarkFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.gatePing { position: absolute; inset: 0; border-radius: 14px; border: 2px solid rgba(14,122,107,.55); opacity: 0; animation: gatePing 2.7s cubic-bezier(.2,.55,.35,1) 1.4s infinite; }
@keyframes gatePing { 0% { transform: scale(1); opacity: .75; } 75%, 100% { transform: scale(1.7); opacity: 0; } }
@supports ((-webkit-background-clip: text) or (background-clip: text)) {
  .gateShimmer { background-image: linear-gradient(100deg, ${T.text} 38%, ${T.teal} 48%, #2ec4a9 52%, ${T.text} 62%); background-size: 240% 100%; -webkit-background-clip: text; background-clip: text; color: transparent !important; animation: gateItem .55s cubic-bezier(.22,.7,.3,1) .3s backwards, gateShimmer 4.2s ease-in-out 1.2s infinite; }
}
@keyframes gateShimmer { 0% { background-position: 115% 0; } 55%, 100% { background-position: -125% 0; } }
.gateBtn { position: relative; overflow: hidden; transition: transform .16s ease, box-shadow .16s ease; }
.gateBtn:hover { transform: translateY(-1px); box-shadow: 0 10px 26px -12px rgba(0,0,0,.45); }
.gateBtn::after { content: ""; position: absolute; top: 0; bottom: 0; left: -55%; width: 34%; background: linear-gradient(105deg, rgba(14,122,107,0), rgba(14,122,107,.13), rgba(14,122,107,0)); transform: skewX(-18deg); animation: gateBtnSheen 3.6s ease-in-out 1.8s infinite; }
@keyframes gateBtnSheen { 0%, 55% { left: -55%; } 90%, 100% { left: 130%; } }
/* --- main-page micro-animations --- */
.qIn { animation: qIn .32s cubic-bezier(.22,.7,.3,1) both; }
@keyframes qIn { from { opacity: 0; transform: translateY(7px); } }
.qIn .opt:not(.pop) { animation: optIn .38s cubic-bezier(.22,.7,.3,1) backwards; }
.qIn .opt:not(.pop):nth-child(1) { animation-delay: .05s; }
.qIn .opt:not(.pop):nth-child(2) { animation-delay: .1s; }
.qIn .opt:not(.pop):nth-child(3) { animation-delay: .15s; }
.qIn .opt:not(.pop):nth-child(4) { animation-delay: .2s; }
.qIn .opt:not(.pop):nth-child(5) { animation-delay: .25s; }
.qIn .opt:not(.pop):nth-child(6) { animation-delay: .3s; }
@keyframes optIn { from { opacity: 0; transform: translateY(9px); } }
.confetti { position: absolute; left: 22px; top: 50%; width: 7px; height: 7px; border-radius: 2px; opacity: 0; animation: confettiPop .85s cubic-bezier(.15,.6,.3,1) both; }
@keyframes confettiPop { 0% { opacity: 1; transform: translate(0, 0) rotate(0deg) scale(1); } 100% { opacity: 0; transform: translate(var(--dx, 40px), var(--dy, -50px)) rotate(var(--rot, 180deg)) scale(.5); } }
.flameFlicker { display: inline-flex; animation: flameFlicker 2.6s ease-in-out infinite; transform-origin: 50% 88%; }
/* Brand wordmark: mark + name float on an infinitely scrolling cloud horizon.
   The track holds mirror-image pairs of the strip, so every junction is a
   reflection of itself — scrolling by exactly half the track (one pair
   period) loops with no visible seam, forever. */
@keyframes cloudScroll { to { transform: translateX(-50%); } }
/* Hover must never change animation-duration — CSS re-maps elapsed time onto
   the new duration and the loop position visibly teleports. The steady 55s
   scroll lives on .cloudTrack untouched; hover instead nudges the WRAPPER
   with a plain transform transition, which composes with the scroll — a
   smooth gust that eases in and back out with no jump either way. */
.cloudWrap { position: absolute; inset: 0; pointer-events: none; transition: transform 2.8s ease; }
.cloudTrack { position: absolute; top: 0; left: 0; height: 100%; width: max-content; display: flex; animation: cloudScroll 55s linear infinite; opacity: 0.65; }
.cloudTrack img { height: 100%; width: auto; display: block; }
.cloudTrack img:nth-child(even) { transform: scaleX(-1); }
@keyframes brandFloat { 0%, 100% { transform: translateY(1px) rotate(-1.2deg); } 50% { transform: translateY(-2px) rotate(1.2deg); } }
.brandFloat { animation: brandFloat 4.8s ease-in-out infinite; will-change: transform; }
/* The name bobs too — slower and offset, so it drifts out of phase with the mark. */
.brandFloatSlow { display: inline-flex; animation: brandFloat 6.6s ease-in-out infinite; animation-delay: -2.2s; will-change: transform; }
.brandHome { transition: transform 0.5s ease, opacity 0.5s ease; }
.brandHome:hover .cloudWrap { transform: translateX(-16px); }
.brandHome:hover { opacity: 0.95; transform: translateY(-1px); }
@media (prefers-reduced-motion: reduce) { .brandFloat, .brandFloatSlow, .cloudTrack { animation: none; } .cloudWrap, .brandHome { transition: none; } }
@keyframes flameFlicker { 0%, 100% { transform: scale(1) rotate(-2deg); } 28% { transform: scale(1.14) rotate(2.5deg); } 55% { transform: scale(.94) rotate(-1deg); } 78% { transform: scale(1.08) rotate(1.5deg); } }
.timerLow { animation: timerPulse 1s ease-in-out infinite; }
@keyframes timerPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
.progFillDone { animation: progGlowPop .6s cubic-bezier(.3,1.3,.5,1) both; }
@keyframes progGlowPop { 0% { transform: scaleY(1); } 45% { transform: scaleY(1.6); } 100% { transform: scaleY(1); } }
@media (prefers-reduced-motion: reduce) {
  /* Global backstop: also neutralizes inline animations (scrim/panel materialize). */
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
  .fade, .toast, .pop, .slidein, .materialize, .scrimIn { animation: none !important; }
  button:not(.opt), .opt { transition: none !important; }
  .streakPop, .streakGlow { animation: none !important; }
  .balloonRiseA, .balloonRiseB { display: none !important; }
  .tabInd { transition: none !important; }
  button:not(.opt):active, .opt:active:not(:disabled) { transform: none !important; }
  .gateBlob, .gateGrid, .gateRing::before, .gateIn, .gs1, .gs2, .gs3, .gs4, .gateMarkAnim, .gatePing, .gateShimmer, .gateBtn::after { animation: none !important; }
  .gateSpark, .gateGhost, .gateRibbon { display: none !important; }
  .gateTilt, .gateParallax { transform: none !important; transition: none !important; }
  .qIn, .qIn .opt:not(.pop), .flameFlicker, .timerLow, .progFillDone { animation: none !important; }
  .confetti { display: none !important; }
  .progFill, .progFillDone { transition: none !important; }
}
/* The mobile "Menu" toggle lives in the header; desktop never sees it. */
.mobMenuBtn { display: none !important; align-items: center; gap: 5px; }
@media (max-width: 680px) {
  .topInner { flex-wrap: wrap !important; padding: 10px 14px !important; gap: 8px 10px !important; }
  .topMeta { width: 100% !important; justify-content: space-between !important; gap: 8px !important; flex-wrap: wrap !important; }
  .topActions { gap: 6px !important; flex-wrap: wrap !important; justify-content: flex-end !important; }
  .topActBtn { padding: 7px 9px !important; }
  .btnTxt { display: none !important; }
  /* Collapse the pill clutter behind the Menu button: header actions, library
     buttons, study toggles etc. are hidden until the menu is opened. */
  .mobMenuBtn { display: inline-flex !important; }
  .mobExtra { display: none !important; }
  .mobMenuOpen .mobExtra { display: inline-flex !important; }
  .mobMenuOpen .topActions { display: flex !important; }
}
/* Slow ambient drift for the participant poll's arena backdrop (same motion
   ImmersiveScene uses for its settled-room backdrop). */
@keyframes immDrift { from { transform: scale(1.045) translate(-1%,-.5%); } to { transform: scale(1.11) translate(1.5%,1%); } }
.imm-drift { animation: immDrift 26s ease-in-out infinite alternate; }
@media (prefers-reduced-motion: reduce) { .imm-drift { animation: none !important; } }
`;

/* ---------------------------------------------------------------------- */
const s: Record<string, React.CSSProperties> = {
  root: { minHeight: "100vh", background: T.ink, fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif", color: T.text },

  // Translucent chrome: content scrolls under the bar; the blur + saturation
  // make it read as a floating material layer rather than an opaque strip.
  top: { position: "sticky", top: 0, zIndex: 20, background: "rgba(27,30,43,.72)", backdropFilter: "blur(20px) saturate(1.6)", WebkitBackdropFilter: "blur(20px) saturate(1.6)", borderBottom: "1px solid rgba(255,255,255,.04)", transition: "box-shadow .25s ease, border-color .25s ease" },
  topScrolled: { borderBottom: "1px solid rgba(255,255,255,.09)", boxShadow: "0 10px 28px -14px rgba(0,0,0,.55)" },
  // Wider cap than the main content column, and wraps to a second line
  // instead of squeezing — with brand + countdown + up to ~9 admin controls,
  // an unwrapped 880px row forced the countdown text to break word-by-word
  // and pushed the button cluster off-screen.
  topInner: { maxWidth: 1180, margin: "0 auto", padding: "13px 22px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 14px" },
  brand: { position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 9, flexShrink: 0, background: "transparent", border: `1px solid ${T.inkLine}`, borderRadius: 11, padding: "5px 14px 5px 5px", cursor: "pointer", font: "inherit" },
  brandMark: { position: "relative", width: 28, height: 28, borderRadius: 8, background: T.teal, color: "#fff", display: "grid", placeItems: "center", flexShrink: 0, boxShadow: "0 2px 6px rgba(4,16,20,0.5)" },
  brandName: { position: "relative", color: "#fff", fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em", whiteSpace: "nowrap", textShadow: "0 1px 3px rgba(4,16,20,0.75)" },
  // marginLeft: auto keeps this cluster pinned to the right whether it shares
  // a line with the brand or wraps onto its own line below it.
  topMeta: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 13px", marginLeft: "auto", justifyContent: "flex-end" },
  countdown: { color: "#c7ccd6", fontSize: 12.5, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", whiteSpace: "nowrap", flexShrink: 0 },
  countNum: { color: T.gold, fontWeight: 700 },
  pollCreditNum: { color: T.teal, fontWeight: 700, fontSize: "0.82em", marginLeft: 3 },
  who: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 7px", justifyContent: "flex-end" },
  avatarSm: { width: 28, height: 28, borderRadius: 8, background: T.teal, color: "#fff", display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 700, flexShrink: 0 },
  adminTag: { display: "inline-flex", alignItems: "center", gap: 4, color: "#9aa0ab", fontSize: 11, fontWeight: 500, textTransform: "capitalize", whiteSpace: "nowrap", flexShrink: 0 },
  signOut: { display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 8, background: T.inkSoft, color: "#aeb4c0", border: `1px solid ${T.inkLine}`, cursor: "pointer", flexShrink: 0 },
  approveBtn: { position: "relative", display: "inline-flex", alignItems: "center", gap: 6, background: T.inkSoft, color: "#e7d9b4", border: `1px solid ${T.inkLine}`, padding: "6px 11px", borderRadius: 8, fontSize: 12.5, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 },
  navSegRow: { display: "inline-flex", background: T.inkSoft, border: `1px solid ${T.inkLine}`, borderRadius: 9, padding: 2, gap: 2, flexShrink: 0 },
  navSegBtn: { display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", color: "#aeb4c0", border: "none", padding: "5px 10px", borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" },
  navSegOn: { background: T.teal, color: "#fff", boxShadow: "0 1px 5px rgba(0,0,0,.28)" },
  pendingBadge: { display: "inline-grid", placeItems: "center", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: T.gold, color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },

  scrim: { position: "fixed", inset: 0, background: "rgba(15,17,26,.6)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 18, zIndex: 80, animation: "scrimIn .22s ease both" },
  apPanel: { width: "100%", maxWidth: 540, maxHeight: "84vh", display: "flex", flexDirection: "column", background: T.paper, borderRadius: 18, overflow: "hidden", border: `1px solid ${T.paperEdge}`, boxShadow: "0 30px 80px -30px rgba(0,0,0,.6)", animation: "materialize .34s cubic-bezier(.22,.9,.3,1.04) both" },
  apHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 22px 12px" },
  apEyebrow: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: T.muted },
  apTitle: { fontSize: 22, fontWeight: 700, color: T.text, marginTop: 3, letterSpacing: "-0.015em", lineHeight: 1.15 },
  close: { background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 8, width: 32, height: 32, display: "grid", placeItems: "center", cursor: "pointer", color: T.muted },
  apBody: { padding: "0 18px 18px", overflowY: "auto" },
  apSectionLbl: { display: "flex", alignItems: "center", gap: 8, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: T.faint, margin: "8px 4px 10px" },
  apRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderBottom: `1px solid ${T.paperEdge}`, flexWrap: "wrap" as const },
  apAvatar: { width: 34, height: 34, borderRadius: 9, background: T.inkSoft, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  apName: { fontSize: 14.5, fontWeight: 600, color: T.text, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  apMatch: { fontSize: 11, fontWeight: 600, color: T.correctText, background: T.correctBg, border: `1px solid ${T.correctLine}55`, borderRadius: 5, padding: "1px 6px" },
  apNoMatch: { fontSize: 11, fontWeight: 500, color: T.muted, background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 5, padding: "1px 6px" },
  apEmail: { fontSize: 12.5, color: T.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  apActions: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" as const, justifyContent: "flex-end", marginLeft: "auto" },
  apApprove: { background: T.teal, color: "#fff", border: "none", padding: "7px 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  apSelect: { background: "#fff", color: T.text, border: `1px solid ${T.paperEdge}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, cursor: "pointer" },
  apBlock: { display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, background: "#fff", color: T.wrongLine, border: `1px solid ${T.paperEdge}`, cursor: "pointer" },
  apToggle: { background: "#fff", color: T.muted, border: `1px solid ${T.paperEdge}`, borderRadius: 999, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const },
  apToggleOn: { background: T.teal, color: "#fff", borderColor: T.teal },
  apToggleLocked: { opacity: 0.5, cursor: "not-allowed" as const },
  apEmpty: { fontSize: 13.5, color: T.muted, lineHeight: 1.5, margin: "0 4px", fontStyle: "italic" },
  webCardsNote: { display: "flex", alignItems: "flex-start", gap: 9, background: T.goldSoft, border: `1px solid ${T.gold}55`, borderRadius: 10, padding: "10px 12px", margin: "0 0 14px", fontSize: 12.5, lineHeight: 1.5, color: "#6b5518" },
  webCardsNoteBtn: { flexShrink: 0, background: "none", border: `1px solid ${T.gold}88`, color: "#6b5518", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  reportSelect: { width: "100%", padding: "9px 11px", borderRadius: 9, border: `1px solid ${T.paperEdge}`, background: "#fff", color: T.text, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" },
  reportText: { width: "100%", padding: "10px 12px", borderRadius: 9, border: `1px solid ${T.paperEdge}`, background: "#fff", color: T.text, fontSize: 14, fontFamily: "inherit", lineHeight: 1.5, resize: "vertical", boxSizing: "border-box" },
  bugRow: { padding: "12px 4px", borderBottom: `1px solid ${T.paperEdge}`, display: "flex", flexDirection: "column", gap: 7 },
  bugMeta: { display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", fontSize: 12 },
  bugKind: { fontWeight: 700, color: T.text },
  bugQ: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", color: T.teal, background: T.tealSoft, padding: "1px 7px", borderRadius: 6 },
  bugWho: { color: T.faint },
  bugStatus: { marginLeft: "auto", fontWeight: 700, textTransform: "uppercase", fontSize: 11, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  bugStem: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 14.5, color: T.muted, lineHeight: 1.4, maxHeight: 42, overflow: "hidden" },
  bugMsg: { margin: 0, fontSize: 14, color: T.text, lineHeight: 1.5, whiteSpace: "pre-wrap" },
  missActions: { display: "flex", gap: 9, padding: "4px 22px 14px", borderBottom: `1px solid ${T.paperEdge}` },
  missClear: { display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${T.wrongLine}`, color: T.wrongText, padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  missQ: { padding: "14px 6px", borderBottom: `1px solid ${T.paperEdge}` },
  eyebrow2: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: T.faint, marginBottom: 6 },
  missStem: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 15.5, lineHeight: 1.5, color: T.text, margin: "0 0 8px" },
  missMeta: { display: "flex", flexWrap: "wrap", gap: 8, fontSize: 13, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  missNote: { background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 8, padding: "9px 12px", marginTop: 9, fontSize: 14, lineHeight: 1.5, color: T.text, whiteSpace: "pre-wrap" },

  statGrid: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, margin: "12px 4px 6px" },
  statCard: { background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 12, padding: "13px 15px" },
  statNum: { fontFamily: "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif", fontSize: 26, fontWeight: 700, lineHeight: 1.1, color: T.text, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" },
  statLbl: { fontSize: 13, fontWeight: 600, color: T.text, marginTop: 4 },
  statSub: { fontSize: 11.5, color: T.muted, marginTop: 2 },
  chartCard: { background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 12, padding: "12px 14px 10px", margin: "12px 4px 6px" },
  predCard: { background: T.tealSoft, border: `1px solid ${T.paperEdge}`, borderRadius: 12, padding: "12px 14px 10px", margin: "10px 4px 6px" },
  secHead: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: T.faint, marginBottom: 8 } as React.CSSProperties,
  chartNote: { fontSize: 12.5, color: T.muted, lineHeight: 1.5, margin: "8px 2px 2px" },
  predRow: { display: "flex", alignItems: "center", gap: 14, margin: "2px 0 4px" },
  predOrd: { fontSize: 14, fontWeight: 600, marginLeft: 1, verticalAlign: "super" } as React.CSSProperties,
  insTabs: { display: "flex", gap: 4, flexWrap: "wrap", padding: "2px 20px 14px", borderBottom: `1px solid ${T.paperEdge}` },
  insTab: { background: T.paper, color: T.muted, border: `1px solid ${T.paperEdge}`, padding: "6px 11px", borderRadius: 8, fontSize: 12.5, fontWeight: 500, cursor: "pointer" },
  insTabOn: { background: T.teal, color: "#fff", border: `1px solid ${T.teal}` },
  cohortSel: { background: "#fff", color: T.text, border: `1px solid ${T.paperEdge}`, borderRadius: 9, padding: "7px 10px", fontSize: 13, cursor: "pointer" },
  insHead: { display: "flex", justifyContent: "space-between", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: T.faint, margin: "10px 4px 12px" },
  insHeadR: { textAlign: "right" },
  insRow: { display: "flex", alignItems: "center", gap: 10, padding: "7px 4px" },
  insLabel: { width: 168, fontSize: 13.5, color: T.text, textTransform: "capitalize", flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  insBarWrap: { flex: 1, height: 16, background: "#eef0f3", borderRadius: 5, overflow: "hidden" },
  insBar: { height: "100%", borderRadius: 5 },
  insPct: { width: 40, textAlign: "right", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 13, fontWeight: 700, color: T.text },
  insAtt: { width: 34, textAlign: "right", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 12, color: T.faint },
  insFoot: { fontSize: 12, color: T.muted, lineHeight: 1.5, margin: "14px 4px 0", paddingTop: 12, borderTop: `1px solid ${T.paperEdge}` },
  lbRow: { display: "flex", alignItems: "center", gap: 11, padding: "9px 10px", borderRadius: 10 },
  lbMe: { background: T.tealSoft, boxShadow: `inset 0 0 0 1px ${T.teal}55` },
  lbRank: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 13, color: T.faint, width: 22, textAlign: "center", flexShrink: 0 },
  lbName: { flex: 1, fontSize: 14, fontWeight: 500, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  lbAcc: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 12.5, color: T.muted, width: 44, textAlign: "right" },
  lbDone: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 14, fontWeight: 700, color: T.text, width: 48, textAlign: "right" },
  lbFoot: { display: "flex", justifyContent: "flex-end", gap: 12, padding: "10px 12px 2px", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, color: T.faint },

  gateRoot: { minHeight: "100vh", background: T.ink, display: "grid", placeItems: "center", padding: 24, fontFamily: "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif", position: "relative", overflow: "hidden" },
  gateCard: { maxWidth: 400, width: "100%", background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 18, padding: "34px 30px", textAlign: "center", boxShadow: "0 30px 80px -30px rgba(0,0,0,.6)" },
  gateMark: { width: 52, height: 52, borderRadius: 14, background: T.teal, display: "inline-grid", placeItems: "center", marginBottom: 16, position: "relative" },
  gateTitle: { fontSize: 24, fontWeight: 700, color: T.text, margin: "0 0 8px", letterSpacing: "-0.01em" },
  gateSub: { fontSize: 14.5, lineHeight: 1.55, color: T.muted, margin: "0 0 22px" },
  googleBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", background: "#fff", color: "#1f2330", border: `1px solid ${T.paperEdge}`, padding: "12px 18px", borderRadius: 11, fontSize: 15, fontWeight: 600, cursor: "pointer" },
  gateFine: { fontSize: 12, color: T.faint, lineHeight: 1.5, margin: "18px 0 0" },
  tlHeading: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: T.faint, marginBottom: 7 },
  tlRow: { display: "flex", flexWrap: "wrap", gap: 7 },
  tlBtn: { flex: "1 1 auto", background: "#fff", color: T.text, border: `1px solid ${T.paperEdge}`, borderRadius: 9, padding: "10px 12px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },

  well: { maxWidth: 740, margin: "0 auto", padding: "20px 22px 90px" },

  nav: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  sel: { background: T.inkSoft, color: "#e7eaf0", border: `1px solid ${T.inkLine}`, borderRadius: 9, padding: "8px 11px", fontSize: 13, cursor: "pointer" },
  modeToggle: { display: "inline-flex", background: T.inkSoft, border: `1px solid ${T.inkLine}`, borderRadius: 10, padding: 3, gap: 2 },
  modeBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: "#8c93a1", border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  customEdit: { display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4, background: "transparent", color: T.teal, border: `1px solid ${T.inkLine}`, borderRadius: 7, padding: "3px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  modeOn: { background: T.teal, color: "#fff" },
  todayProg: { display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 13.5 },
  progTrack: { width: 54, height: 5, borderRadius: 999, background: "rgba(255,255,255,.13)", overflow: "hidden", flexShrink: 0 },
  progFill: { display: "block", height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${T.teal}, #2ec4a9)`, transition: "width .55s cubic-bezier(.22,.7,.3,1)" },
  missChip: { display: "inline-flex", alignItems: "center", gap: 6, background: T.inkSoft, color: "#c9a35a", border: `1px solid ${T.inkLine}`, padding: "6px 11px", borderRadius: 8, fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },

  doneBanner: { display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap", background: T.tealSoft, border: `1px solid ${T.teal}66`, borderRadius: 12, padding: "12px 15px", marginBottom: 16, fontSize: 14, color: T.text },
  doneIcon: { width: 22, height: 22, borderRadius: 6, background: T.teal, display: "grid", placeItems: "center", flexShrink: 0 },
  doneBtn: { display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", background: T.teal, color: "#fff", border: "none", padding: "7px 13px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },

  studyBar: { display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 16 },
  studyToggle: { display: "inline-flex", alignItems: "center", gap: 6, background: T.inkSoft, color: "#9aa0ab", border: `1px solid ${T.inkLine}`, padding: "6px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  studyToggleOn: { background: T.teal, color: "#fff", border: `1px solid ${T.teal}` },
  studySecs: { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#c7ccd6" },
  secsInput: { width: 52, background: T.inkSoft, color: "#fff", border: `1px solid ${T.inkLine}`, borderRadius: 8, padding: "5px 8px", fontSize: 13, fontWeight: 600, textAlign: "center", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  timerPill: { display: "inline-flex", alignItems: "center", gap: 5, marginLeft: "auto", background: T.inkSoft, color: "#e7eaf0", border: `1px solid ${T.inkLine}`, padding: "6px 12px", borderRadius: 9, fontSize: 14, fontWeight: 700, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontVariantNumeric: "tabular-nums" },
  timerPillLow: { background: "#3a2018", color: "#ff9b80", border: "1px solid #7a3a2a" },
  reviewBar: { display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap", background: T.inkSoft, border: `1px solid ${T.inkLine}`, borderRadius: 12, padding: "11px 15px", marginBottom: 16, fontSize: 13.5, color: "#c7ccd6" },

  lockedRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 20, padding: "12px 15px", border: `1.5px solid ${T.paperEdge}`, borderRadius: 11, background: "#f4f5f7" },
  lockedIcon: { width: 22, height: 22, borderRadius: 6, background: T.teal, display: "grid", placeItems: "center", flexShrink: 0 },
  lockedHint: { color: T.muted, fontSize: 12.5 },

  setBlock: { padding: "16px 0", borderBottom: `1px solid ${T.paperEdge}` },
  setLbl: { fontSize: 13.5, fontWeight: 600, color: T.text, marginBottom: 10 },
  setHint: { fontSize: 12, color: T.muted, marginTop: 5, lineHeight: 1.45 },
  segRow: { display: "inline-flex", background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: 3, gap: 3 },
  segBtn: { background: "transparent", color: T.muted, border: "none", padding: "8px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  segOn: { background: T.teal, color: "#fff" },
  dateInput: { border: `1px solid ${T.paperEdge}`, borderRadius: 9, padding: "9px 12px", fontSize: 14, background: "#fff", color: T.text },
  toggleRow: { display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", fontSize: 14, color: T.text },
  afterRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13.5, color: T.muted },
  daysInput: { width: 60, border: `1px solid ${T.paperEdge}`, borderRadius: 8, padding: "6px 9px", fontSize: 14, background: "#fff", color: T.text, textAlign: "center" },
  navMid: { display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" },
  navBtn: { width: 34, height: 34, display: "grid", placeItems: "center", background: T.inkSoft, color: "#e7eaf0", border: `1px solid ${T.inkLine}`, borderRadius: 9, cursor: "pointer" },
  navInfo: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 13.5, color: "#e7eaf0", minWidth: 86, textAlign: "center" },
  jumpWrap: { display: "flex", alignItems: "center", gap: 6 },
  jump: { width: 78, background: T.inkSoft, color: "#e7eaf0", border: `1px solid ${T.inkLine}`, borderRadius: 9, padding: "8px 10px", fontSize: 13 },
  jumpBtn: { background: T.teal, color: "#fff", border: "none", borderRadius: 9, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  deckBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: T.inkSoft, color: "#e7d9b4", border: `1px solid ${T.inkLine}`, padding: "8px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 500, cursor: "pointer" },
  deckFilters: { padding: "2px 20px 12px", borderBottom: `1px solid ${T.paperEdge}` },
  deckSearch: { width: "100%", border: `1px solid ${T.paperEdge}`, borderRadius: 9, padding: "10px 13px", fontSize: 14, background: "#fff", color: T.text, marginBottom: 9 },
  deckSearchRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 9, flexWrap: "wrap" },
  scopeToggle: { display: "inline-flex", background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 9, padding: 2, gap: 2 },
  scopeBtn: { background: "transparent", color: T.muted, border: "none", padding: "7px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  scopeOn: { background: T.teal, color: "#fff" },
  deckSelRow: { display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 },
  deckCount: { display: "flex", alignItems: "center", fontSize: 13, color: T.muted, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  deckRow: { display: "flex", alignItems: "flex-start", gap: 11, padding: "11px 4px", borderBottom: `1px solid ${T.paperEdge}` },
  deckRowText: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1, cursor: "pointer" },
  deckRowMeta: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 10.5, letterSpacing: "0.04em", textTransform: "uppercase", color: T.faint },
  repeatBadge: { display: "inline-flex", alignItems: "center", gap: 2, marginLeft: 6, padding: "1px 5px", borderRadius: 999, background: T.goldSoft, color: T.gold, fontWeight: 700, letterSpacing: 0 },
  deckRowStem: { fontSize: 13.5, color: T.text, lineHeight: 1.45 },
  deckRowAns: { fontSize: 12.5, color: T.tealDeep, fontWeight: 500 },
  deckFoot: { display: "flex", alignItems: "center", gap: 13, padding: "14px 22px", borderTop: `1px solid ${T.paperEdge}`, flexWrap: "wrap" },

  progressRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 },
  qeyebrow: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 12, letterSpacing: "0.04em", color: "#8c93a1", textTransform: "uppercase" },
  reportBtn: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", color: T.faint, fontSize: 12, cursor: "pointer", padding: "2px 4px" },
  multiTag: { display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, color: T.gold, background: T.goldSoft, borderRadius: 6, padding: "3px 9px" },

  qcard: { background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 16, padding: "26px 26px 22px", boxShadow: "0 1px 0 rgba(0,0,0,.04), 0 18px 40px -28px rgba(20,24,40,.5)" },
  caughtCard: { width: "100%", maxWidth: 440, background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 18, padding: "32px 28px", textAlign: "center", boxShadow: "0 30px 80px -30px rgba(0,0,0,.5)" },
  figRow: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18, justifyContent: "center" },
  figImg: { maxWidth: "100%", maxHeight: 320, borderRadius: 10, border: `1px solid ${T.paperEdge}`, background: "#fff" },
  stem: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 20, lineHeight: 1.5, color: T.text, margin: "0 0 22px", fontWeight: 400 },
  stemSelectable: { cursor: "text", marginBottom: 8 },
  hlMark: { background: T.goldSoft, color: "inherit", borderRadius: 3, padding: "0 1px", boxShadow: `inset 0 -2px 0 ${T.gold}`, cursor: "pointer" },
  hlHint: { display: "flex", justifyContent: "center", alignItems: "center", gap: 5, fontSize: 11.5, color: T.faint, margin: "12px 0 0" },

  options: { display: "flex", flexDirection: "column", gap: 9 },
  askWrap: { marginTop: 14, display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 9 },
  noClueBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${T.paperEdge}`, color: T.muted, padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  askToggle: { display: "inline-flex", alignItems: "center", gap: 7, background: T.tealSoft, border: `1px solid ${T.tealSoft}`, color: T.tealDeep, padding: "9px 15px", borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: "pointer" },
  askToggleOn: { background: T.teal, border: `1px solid ${T.teal}`, color: "#fff" },
  askPanel: { flexBasis: "100%", marginTop: 1, padding: "13px 15px", background: T.card, border: `1px solid ${T.paperEdge}`, borderRadius: 12 },
  askRow: { display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center", marginBottom: 9 },
  askLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: T.faint, minWidth: 50 },
  askChip: { display: "inline-flex", alignItems: "center", background: "#fff", border: `1px solid ${T.paperEdge}`, color: T.text, padding: "6px 11px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  askChipOn: { background: T.teal, color: "#fff", border: `1px solid ${T.teal}` },
  askGo: { display: "inline-flex", alignItems: "center", gap: 5, background: T.ink, border: `1px solid ${T.ink}`, color: "#fff", padding: "6px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  askInput: { flex: 1, minWidth: 200, background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 9, padding: "8px 11px", fontSize: 13, color: T.text },
  askNote: { margin: "2px 0 0", fontSize: 11.5, color: T.faint, lineHeight: 1.4 },
  opt: { position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 13, textAlign: "left", width: "100%", background: T.card, border: `1.5px solid ${T.paperEdge}`, borderRadius: 11, padding: "13px 15px", fontSize: 15, color: T.text, cursor: "pointer" },
  optChosen: { border: `1.5px solid ${T.teal}`, background: T.tealSoft },
  optCorrect: { border: `1.5px solid ${T.correctLine}`, background: T.correctBg },
  optWrong: { border: `1.5px solid ${T.wrongLine}`, background: T.wrongBg },
  optCrossed: { opacity: 0.55, background: "#f3f1ec" },
  optKey: { flexShrink: 0, width: 26, height: 26, borderRadius: 7, border: "1.5px solid", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", background: "rgba(255,255,255,.7)" },
  optText: { flex: 1, lineHeight: 1.35 },
  optTextCrossed: { textDecoration: "line-through", textDecorationThickness: "2px", color: T.muted },
  optRight: { display: "flex", alignItems: "center", gap: 9, flexShrink: 0 },
  dist: { position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 0, borderRadius: "10px 0 0 10px" },
  optPct: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 12.5, fontWeight: 600 },

  actionRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, gap: 10 },
  actionHint: { fontSize: 13, color: T.muted, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  primary: { background: T.teal, color: "#fff", border: "none", padding: "11px 22px", borderRadius: 10, fontSize: 14.5, fontWeight: 600, cursor: "pointer" },

  verdict: { display: "flex", alignItems: "center", gap: 10, marginTop: 20, padding: "12px 15px", border: "1.5px solid", borderRadius: 11, flexWrap: "wrap" },
  verdictIcon: { width: 22, height: 22, borderRadius: 6, display: "grid", placeItems: "center", flexShrink: 0 },
  verdictMeta: { marginLeft: "auto", fontSize: 12.5, color: T.muted, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", maxWidth: "100%" },

  below: { marginTop: 18 },
  tabs: { position: "relative", display: "flex", gap: 4, borderBottom: `1px solid ${T.inkLine}`, flexWrap: "wrap" },
  tab: { display: "flex", alignItems: "center", gap: 7, background: "transparent", border: "none", color: "#8c93a1", padding: "9px 13px", fontSize: 13.5, fontWeight: 500, cursor: "pointer", borderBottom: "2px solid transparent", marginBottom: -1 },
  tabActive: { color: "#fff" },
  tabInd: { position: "absolute", height: 2, background: T.teal, borderRadius: 2, pointerEvents: "none" },
  tabCount: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, background: T.inkSoft, color: "#c7ccd6", borderRadius: 20, padding: "1px 7px" },

  panel: { background: T.paper, border: `1px solid ${T.paperEdge}`, borderTop: "none", borderRadius: "0 0 14px 14px", padding: 22 },

  expl: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 16.5, lineHeight: 1.6, color: T.text, margin: "0 0 16px", whiteSpace: "pre-wrap" },
  explImg: { display: "block", maxWidth: "100%", borderRadius: 10, border: `1px solid ${T.paperEdge}`, background: "#fff", margin: "0 0 12px" },
  emptyExpl: { display: "flex", alignItems: "center", gap: 10, color: T.muted, fontSize: 14, background: "#fff", border: `1px dashed ${T.paperEdge}`, borderRadius: 11, padding: "14px 16px" },
  videoLink: { display: "flex", alignItems: "center", gap: 10, color: T.text, textDecoration: "none", fontSize: 14.5, background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 11, padding: "13px 15px" },
  videoNote: { fontSize: 12.5, color: T.muted, marginTop: 10, lineHeight: 1.5 },
  diagramBox: { background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 11, padding: "16px 14px", display: "flex", justifyContent: "center" },
  diagramCaption: { fontSize: 13, color: T.muted, marginTop: 9, lineHeight: 1.5, fontStyle: "italic" },
  cmpTable: { borderCollapse: "collapse", width: "100%", fontSize: 13.5, background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 11, overflow: "hidden" },
  cmpTh: { textAlign: "left", padding: "9px 12px", background: T.paper, borderBottom: `1px solid ${T.paperEdge}`, fontWeight: 600, color: T.text },
  cmpTd: { padding: "9px 12px", borderBottom: `1px solid ${T.paperEdge}`, color: T.text, verticalAlign: "top" },

  flashEmpty: { textAlign: "center", padding: "10px 10px 6px" },
  cardChrome: { background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 12, padding: 18 },
  cardChromeHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" },
  cardType: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, fontWeight: 600, color: T.tealDeep, background: T.tealSoft, borderRadius: 6, padding: "3px 9px" },
  cardCached: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: T.faint },
  tinyBtn: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, background: T.paper, border: `1px solid ${T.paperEdge}`, color: T.muted, padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: "pointer" },
  fieldLbl: { display: "block", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: T.faint, marginBottom: 7 },
  clozeRaw: { display: "block", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 13, lineHeight: 1.6, background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 9, padding: "11px 13px", color: T.text, whiteSpace: "pre-wrap" },
  clozePreview: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 15.5, lineHeight: 1.55, color: T.text, marginTop: 10 },
  clozeEdit: { width: "100%", minHeight: 70, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 13, lineHeight: 1.6, border: `1px solid ${T.teal}66`, borderRadius: 9, padding: "11px 13px", background: T.paper, color: T.text, resize: "vertical" },
  blank: { display: "inline-block", background: T.goldSoft, color: "#8a6414", borderRadius: 5, padding: "0 8px", margin: "0 2px", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 13, fontWeight: 600 },
  extra: { background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 9, padding: "13px 15px", marginTop: 4 },
  extraLine: { fontSize: 14, lineHeight: 1.5, margin: "0 0 8px", color: T.text },
  flashActions: { display: "flex", alignItems: "center", gap: 13, marginTop: 14, flexWrap: "wrap" },
  flashNote: { fontSize: 12, color: T.muted },

  lbl: { display: "block", fontSize: 12, color: T.muted, marginBottom: 9, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  textarea: { width: "100%", minHeight: 96, resize: "vertical", border: `1px solid ${T.paperEdge}`, borderRadius: 10, padding: "12px 14px", fontSize: 14.5, lineHeight: 1.5, background: "#fff", color: T.text },
  saveRow: { display: "flex", alignItems: "center", gap: 9, marginTop: 11 },
  savedDot: { width: 7, height: 7, borderRadius: 7, background: T.teal },
  savedTxt: { fontSize: 12.5, color: T.muted },
  ghost: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${T.paperEdge}`, color: T.text, padding: "7px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 500, cursor: "pointer" },
  teamModeOpt: { display: "flex", alignItems: "flex-start", gap: 12, textAlign: "left", background: "#fff", border: `1px solid ${T.paperEdge}`, color: T.text, padding: "14px 16px", borderRadius: 12, cursor: "pointer" },
  teamModeRegen: { display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", color: T.muted, fontSize: 11.5, padding: "6px 4px 0", cursor: "pointer", textDecoration: "underline" },

  // admin roster editor (inside the paper apPanel)
  teamEdSection: { borderTop: `1px solid ${T.paperEdge}`, paddingTop: 10, marginBottom: 12 },
  teamEdHead: { fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 6 },
  teamEdRow: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" },
  teamEdName: { flex: 1, minWidth: 0, fontSize: 13.5, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  teamEdLvl: { flexShrink: 0, fontSize: 11, fontWeight: 700, color: T.tealDeep, background: T.tealSoft, borderRadius: 6, padding: "2px 7px", textTransform: "capitalize" },
  teamEdSel: { flexShrink: 0, background: "#fff", color: T.text, border: `1px solid ${T.paperEdge}`, borderRadius: 8, padding: "5px 8px", fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" },
  teamEdRemove: { flexShrink: 0, display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 8, background: "none", border: `1px solid ${T.paperEdge}`, color: T.muted, cursor: "pointer" },
  teamEdAddTeam: { display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${T.paperEdge}`, color: T.text, borderRadius: 9, padding: "7px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  teamEdSuggest: { flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, background: T.tealSoft, border: `1px solid ${T.teal}55`, color: T.tealDeep, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  teamEdOthersToggle: { display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", color: T.muted, fontSize: 12.5, fontWeight: 600, padding: "4px 0", cursor: "pointer" },

  threadHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 },
  thread: { display: "flex", flexDirection: "column", gap: 14 },
  note: { display: "flex", gap: 11 },
  avatar: { width: 32, height: 32, borderRadius: 9, color: "#fff", display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 700, flexShrink: 0 },
  noteMeta: { display: "flex", alignItems: "center", gap: 8 },
  noteAuthor: { fontSize: 13.5, color: T.text },
  roleTag: { fontSize: 10.5, fontWeight: 600, color: T.muted, background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 5, padding: "1px 6px" },
  noteTime: { fontSize: 11.5, color: T.faint, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  del: { marginLeft: "auto", background: "transparent", border: "none", color: T.faint, cursor: "pointer", padding: 3, display: "grid", placeItems: "center", borderRadius: 6 },
  noteText: { margin: "4px 0 0", fontSize: 14.5, lineHeight: 1.5, color: T.text },
  emptyNote: { fontSize: 13.5, color: T.faint, fontStyle: "italic", margin: 0 },
  addRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.paperEdge}` },
  addInput: { flex: 1, border: `1px solid ${T.paperEdge}`, borderRadius: 9, padding: "10px 13px", fontSize: 14, background: "#fff", color: T.text },
  primarySm: { display: "inline-flex", alignItems: "center", gap: 7, background: T.teal, color: "#fff", border: "none", padding: "9px 16px", borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: "pointer" },

  nextRow: { display: "flex", justifyContent: "flex-end", marginTop: 20 },
  next: { display: "inline-flex", alignItems: "center", gap: 9, background: T.inkSoft, color: "#fff", border: `1px solid ${T.inkLine}`, padding: "11px 20px", borderRadius: 10, fontSize: 14.5, fontWeight: 600, cursor: "pointer" },

  confetti: { position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 70 },
  balloonField: { position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 75 },
  toast: { position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: T.ink, color: "#fff", padding: "11px 18px", borderRadius: 11, fontSize: 13.5, fontWeight: 500, boxShadow: "0 16px 40px -16px rgba(0,0,0,.6)", zIndex: 60, maxWidth: "90vw", textAlign: "center" },

  disclaimer: { maxWidth: 620, margin: "44px auto 0", paddingTop: 16, borderTop: `1px solid ${T.inkLine}`, color: T.faint, fontSize: 11.5, lineHeight: 1.5, textAlign: "center" },
  siteReportBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${T.paperEdge}`, color: T.muted, fontSize: 12, padding: "6px 12px", borderRadius: 8, cursor: "pointer" },
  quizapineAd: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: T.faint, textDecoration: "none", opacity: 0.85 },
  quizapineBadge: { display: "grid", placeItems: "center", width: 15, height: 15, borderRadius: 4.5, background: "linear-gradient(135deg, #a855f7, #ec4899)", flexShrink: 0 },
  quizapineWordmark: { background: "linear-gradient(90deg, #8b6cf0, #d15fd6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", fontWeight: 700 },

  streakChip: { display: "inline-flex", alignItems: "center", gap: 3, color: "#e07a5f", fontWeight: 700, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },

  streakWrap: { position: "fixed", top: 86, left: 0, right: 0, display: "grid", placeItems: "center", zIndex: 80, pointerEvents: "none", padding: "0 16px" },
  streakCard: { display: "inline-flex", alignItems: "center", gap: 14, background: T.ink, border: `1px solid ${T.inkLine}`, borderRadius: 16, padding: "14px 20px 14px 14px", boxShadow: "0 24px 60px -20px rgba(0,0,0,.7)", maxWidth: "92vw" },
  streakCardEpic: { background: "linear-gradient(135deg, #2a1f12 0%, #1b1e2b 55%, #122a25 100%)", border: "1px solid #6b5320" },
  streakIcon: { width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #e07a5f, #bf8a30)", display: "grid", placeItems: "center", flexShrink: 0, boxShadow: "0 8px 20px -6px rgba(224,122,95,.6)" },
  streakIconEpic: { background: "linear-gradient(135deg, #f2c14e, #e07a5f 60%, #a06cd5)" },
  streakBig: { color: "#fff", fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em" },
  streakSub: { color: "#c7ccd6", fontSize: 12.5, marginTop: 2 },

  // live crowd poll — host (big screen)
  pollRoot: { position: "fixed", inset: 0, zIndex: 90, background: T.ink, color: "#fff", display: "flex", flexDirection: "column", fontFamily: "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif" },
  pollHead: { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "16px 26px", borderBottom: `1px solid ${T.inkLine}`, fontSize: 16 },
  pollHeadDrag: { display: "flex", justifyContent: "center", padding: "3px 0", cursor: "ns-resize", touchAction: "none", borderBottom: `1px solid ${T.inkLine}`, background: "rgba(255,255,255,.02)" },
  pollHeadDragBar: { width: 56, height: 4, borderRadius: 999, background: "rgba(255,255,255,.18)" },
  pollLive: { display: "inline-flex", alignItems: "center", gap: 7, color: "#e07a5f", fontWeight: 700, letterSpacing: "0.04em", fontSize: 14 },
  pollJoin: { color: "#c7ccd6", fontSize: 15 },
  pollCode: { color: "#fff", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", letterSpacing: "0.18em", background: T.inkSoft, border: `1px solid ${T.inkLine}`, borderRadius: 8, padding: "3px 10px", fontSize: 18 },
  pollVoters: { display: "inline-flex", alignItems: "center", gap: 7, marginLeft: "auto", color: "#e7eaf0", fontWeight: 600, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  pollClose: { display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 10, background: T.inkSoft, color: "#aeb4c0", border: `1px solid ${T.inkLine}`, cursor: "pointer" },
  pollBody: { flex: 1, overflow: "auto", padding: "clamp(20px, 4vw, 48px)", width: "100%" },
  pollMeta: { color: T.faint, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 15, marginBottom: 14 },
  pollStem: { fontSize: "clamp(22px, 3.2vw, 38px)", lineHeight: 1.3, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", color: "#f4f5f7", margin: "0 0 28px" },
  pollOpts: { display: "flex", flexDirection: "column", gap: 12 },
  pollOpt: { position: "relative", display: "flex", alignItems: "center", gap: 16, overflow: "hidden", background: T.inkSoft, border: `1.5px solid ${T.inkLine}`, borderRadius: 14, padding: "clamp(14px, 1.8vw, 22px) 22px", fontSize: "clamp(17px, 2vw, 24px)" },
  pollOptCorrect: { border: "1.5px solid #48c78e" },
  pollBar: { position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 0, borderRadius: "13px 0 0 13px", transition: "width .5s cubic-bezier(.22,.61,.36,1)" },
  pollLetter: { position: "relative", zIndex: 1, flexShrink: 0, width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 11, background: "rgba(255,255,255,.06)", border: `1px solid ${T.inkLine}`, fontWeight: 700, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  pollOptText: { position: "relative", zIndex: 1, flex: 1 },
  pollOptCount: { position: "relative", zIndex: 1, display: "inline-flex", alignItems: "center", flexShrink: 0, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontWeight: 700, color: "#e7eaf0" },
  pollControls: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap", padding: "16px 26px", borderTop: `1px solid ${T.inkLine}` },
  pollBtn: { display: "inline-flex", alignItems: "center", gap: 8, background: T.inkSoft, color: "#e7eaf0", border: `1px solid ${T.inkLine}`, padding: "12px 22px", borderRadius: 11, fontSize: 16, fontWeight: 600, cursor: "pointer" },
  pollBtnPrimary: { background: T.teal, color: "#fff", border: `1px solid ${T.teal}` },
  pollAnswerLine: { fontSize: 18, color: "#c7ccd6" },
  qrThumb: { padding: 5, border: "none", borderRadius: 10, background: "#fff", cursor: "pointer", lineHeight: 0, flexShrink: 0, boxShadow: "0 4px 14px -6px rgba(0,0,0,.5)" },
  qrThumbImg: { display: "block", width: 48, height: 48 },
  qrOverlay: { position: "fixed", inset: 0, zIndex: 60, background: "rgba(11,13,20,.86)", display: "grid", placeItems: "center", padding: 24 },
  qrCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 14, background: "#fff", borderRadius: 20, padding: "26px 26px 22px" },
  qrBigImg: { display: "block", width: "min(60vh, 70vw, 420px)", height: "min(60vh, 70vw, 420px)" },
  qrCardCode: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 30, fontWeight: 700, letterSpacing: "0.22em", color: "#11131c" },
  qrCardUrl: { color: "#6c7280", fontSize: 14, marginTop: -6 },
  endCard: { width: "100%", maxWidth: 500, background: T.inkSoft, border: `1px solid ${T.inkLine}`, borderRadius: 16, padding: "26px 26px 22px", textAlign: "center", boxShadow: "0 24px 60px -20px rgba(0,0,0,.7)" },
  endCardTitle: { color: "#fff", fontWeight: 700, fontSize: 19, margin: "0 0 10px" },
  endCardText: { color: "#c7ccd6", fontSize: 14.5, lineHeight: 1.6, margin: "0 0 18px" },
  zoomImg: { display: "block", maxWidth: "92vw", maxHeight: "88vh", width: "auto", height: "auto", objectFit: "contain", borderRadius: 12, background: "#fff", cursor: "default" },

  // live crowd poll — participant (phone)
  // The participant poll is its OWN full-screen page (not a fixed overlay): a
  // normal-flow block that grows with its content so the DOCUMENT scrolls
  // natively — the one scroll model iOS Safari never fights. `margin:auto` on
  // the card (below) centres it when short and lets it overflow-and-scroll when
  // tall, with no inner scroll container to trap touches. Opaque background
  // since nothing of the app is mounted behind it.
  joinRoot: { minHeight: "100dvh", width: "100%", display: "flex", padding: 20, boxSizing: "border-box", background: T.ink, fontFamily: "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif" },
  // Decorative arena-room backdrop behind the card (same look ImmersiveScene
  // gave the old overlay). position:fixed + pointerEvents:none: it paints to
  // the viewport but can't intercept touches or join the layout, so the page's
  // native document scroll is completely untouched by it.
  joinBackdrop: { position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" },
  joinBackdropImg: { position: "absolute", inset: "-5%", backgroundImage: "url(/immersive/arena-bg.webp)", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(9px) brightness(.42) saturate(1.05)", transform: "scale(1.06)" },
  joinBackdropTint: { position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 50% 30%, rgba(13,15,22,.12), rgba(13,15,22,.72))" },
  // `margin:auto` (not flex `center`) so a card taller than the viewport stays
  // fully scrollable — flex centering would clip the top out of reach.
  // relative+zIndex lifts it above the fixed backdrop layer.
  joinCard: { position: "relative", zIndex: 1, width: "100%", maxWidth: 460, margin: "auto", background: T.inkSoft, border: `1px solid ${T.inkLine}`, borderRadius: 18, padding: 22, boxShadow: "0 24px 60px -20px rgba(0,0,0,.7)" },
  joinHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  joinMsg: { color: "#c7ccd6", fontSize: 15, lineHeight: 1.5, margin: "0 0 18px" },
  joinOpts: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(64px, 1fr))", gap: 12 },
  joinOpt: { aspectRatio: "1 / 1", display: "grid", placeItems: "center", background: T.ink, color: "#e7eaf0", border: `2px solid ${T.inkLine}`, borderRadius: 16, fontSize: 30, fontWeight: 700, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", cursor: "pointer" },
  joinOptsFull: { display: "flex", flexDirection: "column", gap: 10 },
  joinOptFull: { display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: T.ink, color: "#e7eaf0", border: `2px solid ${T.inkLine}`, borderRadius: 14, padding: "13px 16px", fontSize: 16.5, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", cursor: "pointer" },
  joinOptFullLetter: { flexShrink: 0, width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 9, background: "rgba(255,255,255,.1)", fontWeight: 700 },
  joinOptMine: { background: T.teal, color: "#fff", border: `2px solid ${T.teal}` },
  joinOptCorrect: { background: "#1a7a4a", color: "#fff", border: "2px solid #48c78e" },
  joinOptWrong: { background: "#7a2a2a", color: "#fff", border: "2px solid #e07a5f" },
  joinState: { marginTop: 18, marginBottom: 0, color: "#c7ccd6", fontSize: 14.5, textAlign: "center", minHeight: 20 },

  // live polling group statistics — host (big screen), pinned at the top
  pollStats: { marginBottom: 28, paddingBottom: 22, borderBottom: `1px solid ${T.inkLine}`, display: "flex", flexDirection: "column", gap: 8 },
  // Same panel, but capped in height with its own scroll — used while a
  // question is still on screen (live team stats, individual-mode peek) so a
  // big-class roster doesn't push the question itself off the visible area.
  pollStatsLive: { marginBottom: 22, paddingBottom: 16, borderBottom: `1px solid ${T.inkLine}`, display: "flex", flexDirection: "column", gap: 8, maxHeight: "34vh", overflowY: "auto" },
  pollStatsHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 4, position: "sticky", top: 0, background: T.ink, paddingBottom: 4, zIndex: 1 },
  pollStatsExport: { display: "inline-flex", alignItems: "center", gap: 7, background: T.inkSoft, color: "#e7eaf0", border: `1px solid ${T.inkLine}`, padding: "8px 14px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  teamBoardHead: { display: "inline-flex", alignItems: "center", gap: 9, color: "#f2c14e", fontWeight: 700, letterSpacing: "0.03em", fontSize: 15 },
  teamRow: { display: "flex", alignItems: "center", gap: 16, background: T.inkSoft, border: `1.5px solid ${T.inkLine}`, borderRadius: 12, padding: "12px 18px", fontSize: "clamp(16px, 1.7vw, 21px)" },
  teamRowLead: { border: "1.5px solid #f2c14e", background: "rgba(242,193,78,.10)" },
  teamRank: { flexShrink: 0, width: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontWeight: 700, color: "#aeb4c0" },
  teamName: { flex: 1, color: "#f4f5f7", fontWeight: 600 },
  teamMembers: { flexShrink: 0, color: T.faint, fontSize: 14, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  teamScore: { flexShrink: 0, minWidth: 44, textAlign: "right", color: "#fff", fontWeight: 700, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },

  // team picker + standings — participant (phone)
  teamBar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16, minHeight: 38 },
  teamForm: { display: "flex", alignItems: "center", gap: 8, width: "100%" },
  teamInput: { flex: 1, minWidth: 0, background: T.ink, color: "#fff", border: `1.5px solid ${T.inkLine}`, borderRadius: 10, padding: "9px 12px", fontSize: 15, fontFamily: "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif" },
  teamSet: { flexShrink: 0, background: T.teal, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 14.5, fontWeight: 700, cursor: "pointer" },
  teamSetOff: { opacity: 0.4, cursor: "default" },
  teamTag: { display: "inline-flex", alignItems: "center", gap: 7, color: "#c7ccd6", fontSize: 14.5 },
  teamChange: { marginLeft: "auto", background: "none", border: `1px solid ${T.inkLine}`, color: "#aeb4c0", borderRadius: 8, padding: "5px 11px", fontSize: 13, cursor: "pointer" },
  teamScoreHint: { margin: "-8px 0 16px", color: T.faint, fontSize: 12.5, lineHeight: 1.4 },
  teamDownload: { marginTop: 14, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, background: T.ink, color: "#c7ccd6", border: `1px solid ${T.inkLine}`, borderRadius: 10, padding: "10px 12px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  teamBoardMini: { marginTop: 16, display: "flex", flexDirection: "column", gap: 6 },
  teamMiniRow: { display: "flex", alignItems: "center", gap: 12, background: T.ink, border: `1px solid ${T.inkLine}`, borderRadius: 10, padding: "9px 13px", fontSize: 14.5 },
  teamMiniLead: { border: "1px solid #f2c14e", background: "rgba(242,193,78,.10)" },
  teamMiniMine: { border: `1px solid ${T.teal}` },
  teamMiniRank: { flexShrink: 0, width: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontWeight: 700, color: "#aeb4c0" },
  teamMiniName: { flex: 1, color: "#e7eaf0", fontWeight: 600 },
  teamMiniScore: { flexShrink: 0, color: "#fff", fontWeight: 700, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  joinExplBox: { marginTop: 12, marginBottom: 4, background: T.ink, border: `1px solid ${T.inkLine}`, borderRadius: 12, padding: "12px 14px" },
  joinExplLabel: { display: "inline-flex", alignItems: "center", gap: 6, color: "#f2c14e", fontWeight: 700, fontSize: 12.5, letterSpacing: "0.02em", textTransform: "uppercase" },
  joinExpl: { margin: "8px 0 0", color: "#c7ccd6", fontSize: 14.5, lineHeight: 1.55, whiteSpace: "pre-wrap" },
  joinExplImg: { display: "block", maxWidth: "100%", borderRadius: 8, marginTop: 10 },
  pollReviewHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 },
  pollReviewBar: { marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.inkLine}` },
  pollReviewBarLabel: { display: "inline-flex", alignItems: "center", gap: 6, color: T.faint, fontSize: 12.5, marginBottom: 8 },
  pollReviewChipsRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  pollReviewChip: { background: T.ink, color: "#c7ccd6", border: `1px solid ${T.inkLine}`, borderRadius: 8, padding: "6px 11px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  pollReviewChipActive: { background: T.teal, color: "#fff", border: `1px solid ${T.teal}` },
  // A plain tap button — NOT a drag gesture. A draggable pull-tab needs
  // touch-action:none + pointer capture, which turns this strip into a dead
  // zone that swallows a phone user's scroll (they land on the bar trying to
  // scroll the poll and nothing moves). Tap-to-toggle keeps scrolling free.
  stemPull: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "6px 0 12px", cursor: "pointer", userSelect: "none", background: "none", border: "none", width: "100%", font: "inherit" },
  stemPullBar: { width: 36, height: 4, borderRadius: 999, background: T.inkLine },
  stemPullLabel: { display: "inline-flex", alignItems: "center", gap: 5, color: T.faint, fontSize: 12.5, fontWeight: 600 },
  stemPeek: { margin: "0 0 14px", padding: "12px 14px", background: T.ink, border: `1px solid ${T.inkLine}`, borderRadius: 12, color: "#e7eaf0", fontSize: 16, lineHeight: 1.5 },
};
