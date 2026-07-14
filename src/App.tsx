import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  ShieldCheck, Trophy, NotebookPen, Users, Layers, Stethoscope,
  Check, X, Image as ImageIcon, Trash2, Download, Flame, ArrowRight,
  ArrowLeft, ListChecks, LogOut, Clock, Settings as SettingsIcon,
  Sparkles, Target, RotateCcw, BarChart3, Pencil, Search, FileText, ExternalLink,
  TrendingUp, Youtube, Network, Zap, Crown, Radio, Lightbulb, Highlighter, Bug,
  ChevronDown, ChevronRight, Share2, Archive, Baby, Mail, Minus, Plus, Repeat,
  Eye, EyeOff, PanelRight, PanelBottom,
  BookOpen, Volume2, Play, Pause, Square, Copy,
} from "lucide-react";
import mermaid from "mermaid";
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
import { isConfigured, supabase, signInWithGoogle, signOut, questionId } from "./lib/supabase";
import { useAuth } from "./lib/useAuth";
import { matchRoster } from "./lib/roster";
import { recordToday, peekStreak, totalDays, ymd } from "./lib/streaks";
import { dueReminderPromptStage, markReminderPromptShown } from "./lib/reminderPrompt";
import { isAutoReminderActive, guessedExamDate } from "./lib/reminderWindow";
import {
  makePollCode, channelName, pollJoinUrl, pollCodeFromUrl, clearPollParam, assignBalancedTeams, stableTeamLevel,
  POLL_EVENTS, type PollState, type PollVote, type PollHello, type PollAssign, type TeamStanding, type TeamMode,
} from "./lib/poll";
import {
  loadQuestionBank,
  getMyAnswers, saveAnswer, clearMissedAnswers, getMyNote, saveMyNote,
  getGroupNotes, addGroupNote, deleteGroupNote,
  listProfiles, updateProfile, setTrainingLevel, getStableTeams, regenerateStableTeams,
  getQuestionStats, getLeaderboard,
  getMySettings, saveSettings,
  getAllMyNotes, getAllGroupNotes,
  getTagMissStats,
  getFlashcard, generateFlashcard, saveFlashcard, getFlashcardsForIds,
  getMyHighlights, saveMyHighlights, getQuestionContext,
  submitBugReport, listBugReports, updateBugReport,
  submitOfficialPollResults, listOfficialPollResults, clearOfficialPollResults,
  ensureTrackedForReview, getDueReviewCards, gradeReviewCard,
  type AnswerRow, type GroupNote as DbGroupNote, type Profile,
  type QuestionStats, type LeaderRow, type Settings, type TagMissRow, type Flashcard, type HlRange, type BugReport,
  type OfficialPollResult, type QuestionStat, type SrsRow,
} from "./lib/db";
import { exportMyNotes, exportGroupNotes, exportMissed, ankingLecture, exportPptx, exportPollTeams, exportOfficialPollResults, exportPollMissed } from "./lib/exports";
import { loadTests, saveTest, renameTest, deleteTest, type SavedTest } from "./lib/tests";
import {
  generateStudyGuide, getStudyGuideForTest, getStudyGuide, getStudyGuideAudioUrl, studyGuideUrl,
  studyGuideIdFromUrl, clearStudyParam, type StudyGuide,
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

  // --- exam mode + timer (UI prefs, kept in localStorage to avoid a DB migration) ---
  const [examMode, setExamMode] = useState<boolean>(() => readPref("pd_exam_mode", false));
  const [examReview, setExamReview] = useState(false); // entered the post-set review phase
  const [timerOn, setTimerOn] = useState<boolean>(() => readPref("pd_timer_on", false));
  const [timerSecs, setTimerSecs] = useState<number>(() => clampSecs(readPref("pd_timer_secs", 60)));
  const [secsDraft, setSecsDraft] = useState<string>(() => String(clampSecs(readPref("pd_timer_secs", 60))));
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const commitSecs = () => { const n = clampSecs(Number(secsDraft)); setTimerSecs(n); setSecsDraft(String(n)); };

  // --- study guides (prep page + audio overview generated from a saved test) ---
  const [openStudyGuideId, setOpenStudyGuideId] = useState<string | null>(null); // reading/listening the shared page
  const [pendingGuideTest, setPendingGuideTest] = useState<SavedTest | null>(null); // generating one now
  const [guideToShare, setGuideToShare] = useState<{ guide: StudyGuide; test: SavedTest } | null>(null); // just (re)generated — show the link

  // --- live crowd poll (Supabase Realtime, see lib/poll.ts) ---
  const [hostCode, setHostCode] = useState<string | null>(null);   // big screen is hosting
  const [joinCode, setJoinCode] = useState<string | null>(null);   // this device is a participant
  const [hostSet, setHostSet] = useState<RawQuestion[] | null>(null); // poll a saved test instead of the current set
  const [teamMode, setTeamMode] = useState<TeamMode>("self");      // how teams get formed for the session about to start
  const [teamModePrompt, setTeamModePrompt] = useState<RawQuestion[] | null | false>(false); // pending "Host poll" click, awaiting the team-mode choice (false = not prompting; null/array = the set to host once chosen)
  const [stableTeams, setStableTeams] = useState<Record<string, string>>({}); // profile_id -> team name, the season-long roster
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
      .filter((p) => p.status === "approved")
      .map((p) => ({ voter: p.id, level: stableTeamLevel(p.training_level) }))
      .filter((e): e is { voter: string; level: string } => e.level !== null);
    if (!entries.length) return false;
    const ok = await regenerateStableTeams(assignBalancedTeams(entries));
    if (ok) setStableTeams(await getStableTeams());
    return ok;
  };

  // --- saved tests (hand-picked sets for class sessions, see lib/tests.ts) ---
  const [savedTests, setSavedTests] = useState<SavedTest[]>([]);
  const [showTests, setShowTests] = useState(false);
  useEffect(() => { writePref("pd_exam_mode", examMode); }, [examMode]);
  useEffect(() => { writePref("pd_timer_on", timerOn); }, [timerOn]);
  useEffect(() => { writePref("pd_timer_secs", timerSecs); }, [timerSecs]);

  // --- auth + persistence ---
  const { session, profile, loading: authLoading, reloadProfile } = useAuth();
  const signedIn = Boolean(session);
  const approved = !isConfigured || profile?.status === "approved";
  const persist = isConfigured && signedIn && approved;
  const [answers, setAnswers] = useState<Record<string, AnswerRow>>({});
  const [groupNotes, setGroupNotes] = useState<DbGroupNote[]>([]);
  const [showApprovals, setShowApprovals] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [stats, setStats] = useState<QuestionStats | null>(null);
  const [showBoard, setShowBoard] = useState(false);
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
      getMySettings().then(setSettings);
      getDueReviewCards().then(setSrsDue);
      loadTests().then(setSavedTests);
    } else { setAnswers({}); setAnswersLoaded(false); setSettings(null); setSrsDue([]); setSavedTests([]); }
  }, [persist]);

  // build today's set: due-review (missed, past the recycle interval) first,
  // then new unanswered, capped at the regimen. Built from an answers snapshot
  // so answering doesn't reshuffle it mid-session.
  // extra=true ignores the daily cap (an explicit "give me another set")
  const buildToday = useCallback((extra = false) => {
    if (!all) return;
    const regimen = settings?.regimen ?? 10;
    const recycle = settings?.recycle_missed ?? true;
    const reviewCap = settings?.review_per_day ?? 3;
    const afterMs = (settings?.recycle_after_days ?? 14) * 86400000;
    const now = Date.now();
    const a = answersRef.current;
    const answeredToday = Object.values(a).filter((r) => isSameDay(r.updated_at)).length;
    const remaining = extra ? regimen : Math.max(0, regimen - answeredToday);
    const due: RawQuestion[] = [], fresh: RawQuestion[] = [];
    for (const qq of all) {
      const id = questionId(qq.year, qq.q_index);
      const row = a[id];
      if (!row) fresh.push(qq);
      else if (recycle && !row.first_correct && !row.cleared && now - Date.parse(row.updated_at) >= afterMs) due.push(qq);
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
  const adminLoggedIn = isConfigured && profile?.role === "admin";
  useEffect(() => {
    if (adminLoggedIn) listProfiles().then(setProfiles);
  }, [adminLoggedIn, showApprovals]);

  // Season-long stable-team roster: any approved member may need to look up
  // their own team, and admins need it to show/regenerate it from the modal.
  useEffect(() => {
    if (isConfigured && signedIn && approved) getStableTeams().then(setStableTeams);
  }, [isConfigured, signedIn, approved]);

  // admins: load bug reports (for the triage panel + open-count badge)
  useEffect(() => {
    if (adminLoggedIn) listBugReports().then(setBugs);
  }, [adminLoggedIn, showBugs]);
  const openBugs = bugs.filter((b) => b.status === "open").length;
  const actOnBug = async (id: string, status: string) => {
    await updateBugReport(id, status);
    listBugReports().then(setBugs);
  };

  // admins: load official poll-result submissions (for the archive panel)
  useEffect(() => {
    if (adminLoggedIn) listOfficialPollResults().then(setOfficialResults);
  }, [adminLoggedIn, showOfficialResults]);

  const actOnProfile = async (id: string, patch: Partial<Pick<Profile, "status" | "role">>) => {
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
  // question is presented FRESH (answer hidden) so you get another attempt.
  // Keyed on the question ID itself (not `answers`) so submitting an answer
  // doesn't re-hide what you just revealed — and so picks always reset even
  // when the set changes underneath the same index (stale-highlight bug).
  useEffect(() => {
    const prior = navQid ? answers[navQid] : undefined;
    if (!reviewMode && prior) { setPicked(prior.picked); setRevealed(true); }
    else { setPicked([]); setRevealed(false); }
  }, [navQid, reviewMode, answersLoaded]); // eslint-disable-line

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

  // Login streak: fires once per app load. Also seeds the completion-streak chip.
  useEffect(() => {
    if (!persist || loginCheckedRef.current) return;
    loginCheckedRef.current = true;
    const uid = profile?.id ?? session?.user?.id ?? "anon";
    setDoneStreak(peekStreak(uid, "completion"));
    const { streak, isNew } = recordToday(uid, "login");
    if (isNew && streak >= 2) {
      const level = streak >= 14 ? 3 : streak >= 7 ? 2 : 1;
      setStreakReward({ kind: "login", streak, level });
      fireCelebration(level);
    }
  }, [persist, profile?.id, session?.user?.id]);

  // Nudge to opt into daily reminder emails: on day 2 of use, again at 2 weeks,
  // again at 4 weeks, then never again — skipped entirely if reminders are
  // already effectively on (explicit true, or auto-on within the exam window).
  useEffect(() => {
    if (!persist || !settings || reminderPromptCheckedRef.current) return;
    reminderPromptCheckedRef.current = true;
    const effectiveOn = settings.daily_reminder === true ? true
      : settings.daily_reminder === false ? false
      : isAutoReminderActive(settings.exam_date);
    if (effectiveOn) return;
    const uid = profile?.id ?? session?.user?.id ?? "anon";
    const stage = dueReminderPromptStage(uid, totalDays(uid, "login"));
    if (stage) setReminderPromptStage(stage);
  }, [persist, settings, profile?.id, session?.user?.id]);

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
  }, [persist]);

  // Auto-open a study guide when arriving via a ?study=<id> link.
  useEffect(() => {
    if (!persist) return;
    const id = studyGuideIdFromUrl();
    if (id) { setOpenStudyGuideId(id); clearStudyParam(); }
  }, [persist]);

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

  // --- auth gate (only when Supabase is configured) ---
  if (isConfigured && authLoading) return <Center>Signing you in…</Center>;
  if (isConfigured && !session) return <SignIn />;
  if (isConfigured && session && (!profile || profile.status !== "approved"))
    return <Pending email={session.user.email ?? ""} status={profile?.status ?? "pending"} />;
  if (isConfigured && session && profile && profile.status === "approved" && !profile.training_level)
    return <TrainingLevelGate onSaved={reloadProfile} />;

  if (loadErr) return <Center>Couldn’t load the question bank: {loadErr}</Center>;
  if (!all) return <Center>Loading the PRITE bank…</Center>;
  if (!q) {
    if (persist && mode === "today") {
      return (
        <div style={{ ...s.root, display: "grid", placeItems: "center", padding: 40 }}>
          <style>{CSS}</style>
          <div style={{ textAlign: "center", color: "#c7ccd6", maxWidth: 360 }}>
            {!answersLoaded ? "Building today’s set…" : (
              <>
                <p style={{ fontSize: 16, marginBottom: 16 }}>🎉 You’re all caught up — nothing due today.</p>
                <button style={s.jumpBtn} onClick={() => { setMode("browse"); setQi(0); }}>Browse all questions</button>
              </>
            )}
          </div>
        </div>
      );
    }
    return <Center>No questions for this filter.</Center>;
  }

  const correctSet = q.answer_letters && q.answer_letters.length ? q.answer_letters
    : q.answer_letter ? [q.answer_letter] : [];
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

  const hasExpl = q.explanation_text || q.explanation_images.length > 0;
  const hasDiagram = !!(q.diagram?.code || (q.comparison_table && q.comparison_table.rows?.length));
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

  const qid = questionId(q.year, q.q_index);
  const isAdmin = profile?.role === "admin";
  const pendingCount = profiles.filter((p) => p.status === "pending").length;
  const answeredCount = Object.keys(answers).length;
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
  const examDays = settings?.exam_date ? daysUntil(settings.exam_date) : null;
  const switchMode = (m: "today" | "browse" | "custom") => { setMode(m); setQi(0); setReviewMode(false); };
  // start a custom study session from a hand-picked set (from the Search modal)
  const startCustom = (qs: RawQuestion[], label: string) => {
    if (!qs.length) return;
    setCustomQueue(qs);
    setCustomLabel(label);
    setMode("custom"); setQi(0); setReviewMode(false);
    setShowDeck(false);
    fire(`Studying ${qs.length} question${qs.length === 1 ? "" : "s"}${label ? ` · ${label}` : ""}`);
  };
  // Generate (or regenerate) the study guide for a saved test, then show the
  // share-link modal. Only stem + topic tags are sent to the model — never
  // options/answer/explanation — so the result can't spoil the quiz.
  const buildStudyGuide = async (t: SavedTest, force = false) => {
    const qs = t.qids.map((id) => byId.get(id)).filter(Boolean) as RawQuestion[];
    if (!qs.length) { fire("None of this test's questions are in the current bank"); return; }
    setPendingGuideTest(t);
    const topics = qs.map((q) => ({ stem: q.stem, prite_category: q.prite_category, prite_label: q.prite_label, topics: q.tags?.topics }));
    const result = await generateStudyGuide(t.id, t.name, topics, force);
    setPendingGuideTest(null);
    if ("error" in result) { fire(`Couldn't build the study guide: ${result.error}`); return; }
    setGuideToShare({ guide: result, test: t });
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
    await buildApkg([{ questionId: qid, cloze: card.cloze_text, lecture: ankingLecture(q) }], `prite-${qid}.apkg`);
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
    <div style={s.root}>
      <style>{CSS}</style>

      {/* Top bar */}
      <header style={s.top}>
        <div style={s.topInner} className="topInner">
          <div style={s.brand}>
            <span style={s.brandMark}><Stethoscope size={16} strokeWidth={2.4} /></span>
            <span style={s.brandName}>PRITE&nbsp;<span style={{ color: T.faint, fontWeight: 500 }}>Daily</span></span>
          </div>
          <div style={s.topMeta} className="topMeta">
            <span style={s.countdown}>
              {examDays !== null
                ? <><span style={{ ...s.countNum, color: examDays <= 14 ? "#e07a5f" : T.gold }}>{examDays}</span> {examDays === 1 ? "day" : "days"} to exam</>
                : <><span style={s.countNum}>{all.length}</span> questions</>}
              {persist && <> · <span style={s.countNum}>{answeredCount}</span> done</>}
              {persist && doneStreak > 0 && (
                <> · <span style={s.streakChip} title={`${doneStreak}-day daily streak`}><Flame size={11} strokeWidth={2.6} /> {doneStreak}</span></>
              )}
            </span>
            {persist ? (
              <span style={s.who} className="topActions">
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
                {isAdmin && (
                  <button style={s.approveBtn} className="topActBtn" onClick={() => setShowOfficialResults(true)} title="Official poll results">
                    <Archive size={13} strokeWidth={2.3} /> <span className="btnTxt">Poll Results</span>
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

      <main style={s.well}>
        {/* Navigation / filter row */}
        <div style={s.nav}>
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
          <button style={s.deckBtn} onClick={() => setShowDeck(true)} title="Search & filter questions">
            <Search size={13} strokeWidth={2.4} /> Search
          </button>
          <button style={s.deckBtn} onClick={() => setShowTests(true)} title="Saved tests — hand-picked sets for class sessions">
            <ListChecks size={13} strokeWidth={2.4} /> Tests{savedTests.length ? ` (${savedTests.length})` : ""}
          </button>
          {persist && (
            <button style={s.deckBtn} onClick={() => setShowSrs(true)} title="Spaced-repetition flashcard review of questions you've missed">
              <Repeat size={13} strokeWidth={2.4} /> Review{srsDue.length ? ` (${srsDue.length})` : ""}
            </button>
          )}
          {inToday ? (
            <>
              <span style={s.todayProg}>
                <Target size={13} strokeWidth={2.3} color={dayComplete ? T.teal : T.faint} />
                <b style={{ color: dayComplete ? T.teal : "#e7eaf0" }}>{doneToday}</b>
                <span style={{ color: T.faint }}>/ {target} today</span>
              </span>
              {missedOutstanding > 0 && (
                <button style={s.missChip} onClick={openMissed} title="Read & review your missed questions">
                  <Flame size={12} strokeWidth={2.2} color={T.gold} />
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
          <div style={s.navMid}>
            <button style={s.navBtn} onClick={() => go(-1)} title="Previous"><ArrowLeft size={16} strokeWidth={2.4} /></button>
            <span style={s.navInfo}>{qi + 1} <span style={{ color: T.faint }}>/ {set.length}</span></span>
            <button style={s.navBtn} onClick={() => go(1)} title="Next"><ArrowRight size={16} strokeWidth={2.4} /></button>
          </div>
          {!inToday && (
            <div style={s.jumpWrap}>
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
          <div style={s.studyBar}>
            {inPractice && (
              <>
                <button
                  style={{ ...s.studyToggle, ...(examMode ? s.studyToggleOn : {}) }}
                  onClick={() => { setExamMode((v) => !v); setExamReview(false); }}
                  title="Answer every question in the set before any explanations are shown"
                >
                  <ListChecks size={13} strokeWidth={2.3} /> Exam mode: {examMode ? "on" : "off"}
                </button>
                <button
                  style={{ ...s.studyToggle, ...(timerOn ? s.studyToggleOn : {}) }}
                  onClick={() => setTimerOn((v) => !v)}
                  title="Countdown per question, like the real exam"
                >
                  <Clock size={13} strokeWidth={2.3} /> Timer: {timerOn ? "on" : "off"}
                </button>
                {timerOn && (
                  <span style={s.studySecs}>
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
              style={s.studyToggle}
              onClick={() => setTeamModePrompt(null)}
              title="Run a live poll on a big screen — residents vote from their phones"
            >
              <Radio size={13} strokeWidth={2.3} /> Host poll
            </button>
            <button
              style={s.studyToggle}
              onClick={() => { const c = window.prompt("Enter the poll code shown on the big screen:"); if (c && c.trim()) setJoinCode(c.trim().toUpperCase()); }}
              title="Join a poll from your phone"
            >
              <Users size={13} strokeWidth={2.3} /> Join poll
            </button>
            {timerOn && inPractice && timeLeft != null && !revealed && (
              <span style={{ ...s.timerPill, ...(timeLeft <= 10 ? s.timerPillLow : {}) }}>
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
          </div>
        )}

        {/* Provenance line */}
        <div style={s.progressRow}>
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
        <section style={s.qcard}>
          {q.figure_images.filter((p) => imgSrc(p)).length > 0 && (
            <div style={s.figRow}>
              {q.figure_images.filter((p) => imgSrc(p)).map((p, i) => (
                <img key={i} src={imgSrc(p)} alt="question figure" style={s.figImg} loading="lazy" />
              ))}
            </div>
          )}
          <HighlightableText
            text={q.stem}
            ranges={highlights.filter((h) => h.field === "stem")}
            editable={persist}
            onChange={updateHighlights}
            style={{ ...s.stem, marginBottom: 18 }}
          />

          <div style={s.options}>
            {q.options.map((o, oi) => {
              const chosen = picked.includes(o.letter);
              const correct = showAnswer && correctSet.includes(o.letter);
              const wrongPick = showAnswer && chosen && !correctSet.includes(o.letter);
              const isCrossed = !showAnswer && crossed.includes(o.letter);
              const base: React.CSSProperties = { ...s.opt };
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
            <div style={{ ...s.verdict, background: isCorrect ? T.correctBg : T.wrongBg, borderColor: isCorrect ? T.correctLine : T.wrongLine }} className="slidein">
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
                    <img key={i} src={imgSrc(p)} alt="explanation" style={s.explImg} loading="lazy" />
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

        <footer style={s.disclaimer}>
          AI-assisted explanations, flashcards, context, and diagrams can be wrong.
          Always verify against primary sources and your own clinical judgment.
          {persist && (
            <div style={s.hlHint}>
              <Highlighter size={12} strokeWidth={2.2} /> Select text to highlight · tap a highlight to remove · right-click a choice to cross it out
            </div>
          )}
          {persist && (
            <div style={{ marginTop: 10 }}>
              <button style={s.siteReportBtn} onClick={() => setShowSiteReport(true)}>
                <Bug size={12} strokeWidth={2.2} /> Report a problem with the site
              </button>
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

      {showApprovals && isAdmin && (
        <Approvals
          profiles={profiles}
          onClose={() => setShowApprovals(false)}
          onAct={actOnProfile}
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

      {showBugs && isAdmin && (
        <BugReportsPanel reports={bugs} byId={byId} onAct={actOnBug} onClose={() => setShowBugs(false)} />
      )}

      {showOfficialResults && isAdmin && (
        <OfficialResultsPanel
          results={officialResults}
          onClose={() => setShowOfficialResults(false)}
          onCleared={() => listOfficialPollResults().then(setOfficialResults)}
        />
      )}

      {showCapite && <CapiteComingSoon onClose={closeCapite} />}

      {showBoard && (
        <Leaderboard rows={leaders} meId={session?.user.id} onClose={() => setShowBoard(false)} />
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
          onStudyGuide={async (t) => {
            const existing = await getStudyGuideForTest(t.id);
            if (existing) { setGuideToShare({ guide: existing, test: t }); return; }
            await buildStudyGuide(t);
          }}
          generatingGuideId={pendingGuideTest?.id ?? null}
        />
      )}

      {guideToShare && (
        <StudyGuideShareModal
          guide={guideToShare.guide}
          onClose={() => setGuideToShare(null)}
          onRegenerate={() => buildStudyGuide(guideToShare.test, true)}
          regenerating={pendingGuideTest?.id === guideToShare.test.id}
        />
      )}

      {openStudyGuideId && (
        <StudyGuideView id={openStudyGuideId} onClose={() => setOpenStudyGuideId(null)} />
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

      {showSrs && (
        <ReviewPanel
          due={srsDue}
          byId={byId}
          onGrade={onGradeSrs}
          onClose={() => setShowSrs(false)}
        />
      )}

      {teamModePrompt !== false && (
        <TeamModeModal
          onChoose={startHosting}
          onClose={() => setTeamModePrompt(false)}
          isAdmin={isAdmin}
          stableCount={Object.keys(stableTeams).length}
          onGenerate={runGenerateStableTeams}
        />
      )}
      {hostCode && (
        <PollPresenter code={hostCode} set={hostSet ?? set} startIndex={hostSet ? 0 : qi} timerSecs={timerSecs} onTimerSecsChange={setTimerSecs} teamMode={teamMode} onClose={() => { setHostCode(null); setHostSet(null); }} />
      )}
      {joinCode && (
        <PollParticipant
          code={joinCode}
          voter={profile?.id ?? session?.user?.id ?? "anon"}
          trainingLevel={profile?.training_level ?? null}
          stableTeam={profile ? stableTeams[profile.id] ?? null : null}
          byId={byId}
          displayName={displayName}
          onClose={() => setJoinCode(null)}
        />
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
function TeamModeModal({ onChoose, onClose, isAdmin, stableCount, onGenerate }: {
  onChoose: (mode: TeamMode) => void; onClose: () => void;
  isAdmin: boolean; stableCount: number; onGenerate: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const hasStable = stableCount > 0;
  const stableDisabled = !hasStable && !isAdmin;

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
        <div style={{ padding: "4px 22px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button style={s.teamModeOpt} onClick={() => onChoose("self")}>
            <Users size={18} strokeWidth={2.2} />
            <span>
              <b style={{ display: "block", color: T.text }}>Residents pick their own teams</b>
              <span style={{ fontSize: 12.5, color: T.muted }}>Everyone types in a team name of their choosing when they join.</span>
            </span>
          </button>
          <button style={s.teamModeOpt} onClick={() => onChoose("auto")}>
            <Repeat size={18} strokeWidth={2.2} />
            <span>
              <b style={{ display: "block", color: T.text }}>Auto-assign for today</b>
              <span style={{ fontSize: 12.5, color: T.muted }}>Randomly group today's joiners so each team gets one R1, R2, R3 and R4 — reshuffled fresh each session; they can still rename their team.</span>
            </span>
          </button>
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
              <button style={s.teamModeRegen} onClick={regenerate} disabled={busy}>
                <Repeat size={11} strokeWidth={2.4} /> Regenerate rosters (e.g. a new academic year)
              </button>
            )}
          </div>
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
  const [showAnswerKey, setShowAnswerKey] = useState(false); // answer key on the finish screen (hidden by default)
  const [standingsFontSize, setStandingsFontSize] = useState(20); // adjustable text size for the answer-key stem/options/explanation
  const [pollStemScale, setPollStemScale] = useState(1); // adjustable text size for the question, independent of the choices
  const [pollOptScale, setPollOptScale] = useState(1);    // adjustable text size for the answer choices, independent of the question
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
  const [, force] = useState(0); // re-render when votes arrive
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [qr, setQr] = useState<string | null>(null); // join-URL QR as a data URL
  const [qrBig, setQrBig] = useState(false);          // enlarged QR overlay
  const votesRef = useRef<Map<string, Map<string, string>>>(new Map()); // qid -> voter -> choice
  const teamRef = useRef<Map<string, string>>(new Map());   // voter -> team name
  const levelRef = useRef<Map<string, string>>(new Map());  // voter -> PGY year (R1–R4), if known
  const joinedRef = useRef<Set<string>>(new Set());  // every voter who has said hello or voted
  const correctRef = useRef<Map<string, string[]>>(new Map()); // qid -> correct letters (recorded on reveal)
  const chanRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);

  // Cumulative team leaderboard: ranked by correct answers per person who
  // actually answered — not raw point total, and not per-vote accuracy —
  // so a team that fields more players (or gets more of them to vote) doesn't
  // win on headcount alone. Derived fresh from the raw vote log each call, so
  // it's idempotent (re-reveals and re-renders never double-count).
  const computeStandings = (): TeamStanding[] => {
    const correctCount = new Map<string, number>();
    const answerers = new Map<string, Set<string>>();
    const members = new Map<string, Set<string>>();
    for (const [vId, team] of teamRef.current) {
      if (!team) continue;
      if (!members.has(team)) { members.set(team, new Set()); answerers.set(team, new Set()); correctCount.set(team, 0); }
      members.get(team)!.add(vId);
    }
    for (const [qId, correct] of correctRef.current) {
      const m = votesRef.current.get(qId);
      if (!m) continue;
      for (const [vId, choice] of m) {
        const team = teamRef.current.get(vId);
        if (!team) continue;
        answerers.get(team)?.add(vId);
        if (correct.includes(choice)) correctCount.set(team, (correctCount.get(team) ?? 0) + 1);
      }
    }
    return [...members.keys()]
      .map((team) => {
        const n = answerers.get(team)?.size ?? 0;
        const c = correctCount.get(team) ?? 0;
        return { team, score: n > 0 ? Math.round((c / n) * 10) / 10 : 0, members: members.get(team)?.size ?? 0, correct: c, answerers: n };
      })
      .sort((a, b) => b.score - a.score || b.answerers - a.answerers || a.team.localeCompare(b.team));
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
      index, total, revealed,
      correct: revealed ? correctSet : [],
      standings: computeStandings(),
      teamMode,
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
      if (!v?.qid || !v?.choice || !v?.voter) return;
      let m = votesRef.current.get(v.qid);
      if (!m) { m = new Map(); votesRef.current.set(v.qid, m); }
      m.set(v.voter, v.choice);
      joinedRef.current.add(v.voter);
      if (v.team) teamRef.current.set(v.voter, v.team);
      if (v.level) levelRef.current.set(v.voter, v.level);
      force((n) => n + 1);
      broadcastRef.current(); // keep participants' voted/joined counters live
    });
    ch.on("broadcast", { event: POLL_EVENTS.hello }, ({ payload }: { payload: PollHello }) => {
      if (payload?.voter) {
        joinedRef.current.add(payload.voter);
        if (payload.team) teamRef.current.set(payload.voter, payload.team);
        if (payload.level) levelRef.current.set(payload.voter, payload.level);
        force((n) => n + 1);
      }
      broadcastRef.current();
    });
    ch.subscribe((st) => { if (st === "SUBSCRIBED") broadcastRef.current(); });
    chanRef.current = ch;
    return () => { supabase?.removeChannel(ch); chanRef.current = null; };
  }, [code]); // eslint-disable-line

  // re-broadcast the live question whenever it changes
  useEffect(() => { broadcastRef.current(); }, [index, revealed, finished]); // eslint-disable-line

  // per-question countdown; auto-reveal when it hits zero
  useEffect(() => {
    if (revealed || finished || !q) { setTimeLeft(null); return; }
    setTimeLeft(timerSecs);
    const id = setInterval(() => setTimeLeft((t) => (t == null ? t : t <= 1 ? 0 : t - 1)), 1000);
    return () => clearInterval(id);
  }, [index, revealed, finished, timerSecs, q?.year, q?.q_index]); // eslint-disable-line
  useEffect(() => { if (timeLeft === 0 && !revealed) setRevealed(true); }, [timeLeft, revealed]);

  if (!q) return null;
  const tally = votesRef.current.get(qid) ?? new Map<string, string>();
  const counts: Record<string, number> = {};
  for (const c of tally.values()) counts[c] = (counts[c] ?? 0) + 1;
  const voterCount = tally.size;
  const joinedCount = joinedRef.current.size;
  const allVoted = joinedCount > 0 && voterCount >= joinedCount;
  const standings = computeStandings();
  const goTo = (i: number) => { setRevealed(false); setIndex(Math.max(0, Math.min(i, total - 1))); };
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
      const tally = votesRef.current.get(qqid) ?? new Map<string, string>();
      const counts: Record<string, number> = {};
      for (const c of tally.values()) counts[c] = (counts[c] ?? 0) + 1;
      const totalVotes = tally.size;
      const wrongVotes = [...tally.values()].filter((c) => !correct.includes(c)).length;
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
  };

  // Votes/standings live only in this component's memory (votesRef etc.) —
  // ending the poll before the results/review-priority heat map has actually
  // been seen throws that session away for good. Confirm first so a stray
  // click on the header X doesn't accidentally do that.
  const confirmClose = () => {
    if (!finished) {
      if (!window.confirm("End the poll now? The results and review-priority heat map for this session haven't been shown yet — ending now discards them.")) return;
      onClose();
      return;
    }
    if (!showAnswerKey) {
      if (!window.confirm("End poll without viewing the answer key / review-priority heat map?")) return;
    }
    // Last chance to file this session with the admin archive before it's gone
    // for good — easy to miss the separate "Mark as official" button, so ask
    // for it right here on the way out.
    if (officialStatus === "idle" && standings.length > 0) {
      if (window.confirm("Mark this session as an official class review before ending? It's filed in the admin archive for the whole residency to reference.")) {
        submitOfficial();
        return; // stay open so the submit result — and the End poll button to finish closing — are still visible
      }
    }
    onClose();
  };

  return (
    <div style={s.pollRoot}>
      <style>{CSS}</style>
      <div style={s.pollHead}>
        {qr && (
          <button style={s.qrThumb} onClick={() => setQrBig(true)} title="Tap to enlarge for scanning">
            <img src={qr} alt={`QR code to join poll ${code}`} style={s.qrThumbImg} />
          </button>
        )}
        <span style={s.pollLive}><Radio size={16} strokeWidth={2.4} /> LIVE POLL</span>
        <span style={s.pollJoin}>Scan, or join at <b style={{ color: "#fff" }}>{joinHost}</b> · code <b style={s.pollCode}>{code}</b></span>
        <span style={{ ...s.pollVoters, ...(allVoted && !revealed ? { color: "#48c78e" } : {}) }}>
          <Users size={16} strokeWidth={2.3} /> {voterCount}{joinedCount > 0 ? ` of ${joinedCount}` : ""} voted{allVoted && !revealed ? " · all in!" : ""}
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
            <span style={{ ...s.timerPill, ...(timeLeft <= 10 ? s.timerPillLow : {}) }}><Clock size={14} strokeWidth={2.5} /> {fmtTime(timeLeft)}</span>
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
                style={{ ...s.pollBtn, padding: "6px 8px", opacity: pollStemScale >= 1.8 ? 0.4 : 1 }}
                onClick={() => setPollStemScale((v) => Math.min(1.8, +(v + 0.1).toFixed(2)))}
                disabled={pollStemScale >= 1.8}
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

      <div style={s.pollBody}>
        {finished ? (
          <>
            <div style={s.pollMeta}>Session complete · {total} question{total === 1 ? "" : "s"}{joinedCount > 0 ? ` · ${joinedCount} participant${joinedCount === 1 ? "" : "s"}` : ""}</div>
            <p style={s.pollStem}>Final standings</p>
            {standings.length > 0 ? (
              <div style={s.pollStats}>
                {standings.map((t, i) => (
                  <div key={t.team} style={{ ...s.teamRow, ...(i === 0 ? s.teamRowLead : {}) }}>
                    <span style={s.teamRank}>{i === 0 ? <Crown size={20} strokeWidth={2.4} color="#f2c14e" /> : i + 1}</span>
                    <span style={s.teamName}>{t.team}</span>
                    <span style={s.teamMembers}>{t.members} {t.members === 1 ? "player" : "players"} · {t.correct} correct · {t.answerers} answered</span>
                    <span style={s.teamScore}>{t.score}/player</span>
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
                  const qTally = votesRef.current.get(qqid) ?? new Map<string, string>();
                  const qTotalVotes = qTally.size;
                  const qWrongVotes = [...qTally.values()].filter((c) => !correct.includes(c)).length;
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
        ) : (
          <>
        {standings.length > 0 && (
          <div style={s.pollStats}>
            <div style={s.pollStatsHead}>
              <span style={s.teamBoardHead}><Trophy size={16} strokeWidth={2.4} /> Live polling group statistics</span>
              <button style={s.pollStatsExport} onClick={() => exportPollTeams(standings, { code, index: index + 1, total })} title="Download team data (opens in Excel)">
                <Download size={14} strokeWidth={2.3} /> Export to Excel
              </button>
            </div>
            {standings.map((t, i) => (
              <div key={t.team} style={{ ...s.teamRow, ...(i === 0 ? s.teamRowLead : {}) }}>
                <span style={s.teamRank}>{i === 0 ? <Crown size={20} strokeWidth={2.4} color="#f2c14e" /> : i + 1}</span>
                <span style={s.teamName}>{t.team}</span>
                <span style={s.teamMembers}>{t.members} {t.members === 1 ? "player" : "players"} · {t.correct} correct · {t.answerers} answered</span>
                <span style={s.teamScore}>{t.score}/player</span>
              </div>
            ))}
          </div>
        )}
        <div style={s.pollMeta}>{q.year} · Q{q.q_index} · Question {index + 1} of {total}</div>
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
          </>
        )}
      </div>

      <div style={s.pollControls}>
        {finished ? (
          <>
            <button style={s.pollBtn} onClick={() => { setFinished(false); setShowAnswerKey(false); }}><ArrowLeft size={16} strokeWidth={2.4} /> Back to questions</button>
            <button style={{ ...s.pollBtn, ...s.pollBtnPrimary }} onClick={confirmClose}><X size={16} strokeWidth={2.4} /> End poll</button>
          </>
        ) : (
          <>
        <button style={s.pollBtn} disabled={index === 0} onClick={() => goTo(index - 1)}><ArrowLeft size={16} strokeWidth={2.4} /> Prev</button>
        {!revealed ? (
          <button style={{ ...s.pollBtn, ...s.pollBtnPrimary }} onClick={() => setRevealed(true)}><Check size={16} strokeWidth={2.6} /> Reveal answer</button>
        ) : (
          <span style={s.pollAnswerLine}>Answer: <b style={{ color: "#48c78e" }}>{correctSet.join(", ")}</b>{q.answer_text ? ` — ${q.answer_text}` : ""}</span>
        )}
        {index >= total - 1 && revealed ? (
          <button style={{ ...s.pollBtn, ...s.pollBtnPrimary }} onClick={() => setFinished(true)}><Trophy size={16} strokeWidth={2.4} /> Finish · standings</button>
        ) : (
          <button style={s.pollBtn} disabled={index >= total - 1} onClick={() => goTo(index + 1)}>Next <ArrowRight size={16} strokeWidth={2.4} /></button>
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
    </div>
  );
}

const TEAM_KEY = "prite_poll_team";

function PollParticipant({ code, voter, trainingLevel, stableTeam, byId, displayName, onClose }: {
  code: string; voter: string; trainingLevel: string | null; stableTeam: string | null;
  byId: Map<string, RawQuestion>; displayName: string; onClose: () => void;
}) {
  const [remote, setRemote] = useState<PollState | null>(null);
  const [myVote, setMyVote] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "joined" | "error">("connecting");
  const [team, setTeamState] = useState<string>(() => { try { return localStorage.getItem(TEAM_KEY) || ""; } catch { return ""; } });
  const [draft, setDraft] = useState(team);
  const [editing, setEditing] = useState(false);
  const chanRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const lastQid = useRef<string>("");
  const teamRef = useRef(team);
  teamRef.current = team;
  const myVoteRef = useRef<string | null>(null);
  // My own answer history for this session, keyed by qid — snapshotted the
  // moment each question is revealed (myVoteRef still reflects that question;
  // it's reset only once the NEXT qid comes in). Drives the missed-questions
  // download at the end, and lets me flip back through past questions (with
  // their full explanation, pulled from the local question bank) while the
  // live question is still on the clock.
  const historyRef = useRef<Map<string, { correct: string[]; myChoice: string | null; index: number }>>(new Map());
  const [reviewQid, setReviewQid] = useState<string | null>(null); // set while browsing a past question instead of the live one

  // Set/clear my team and tell the host right away so it can roster me even
  // before I vote.
  const saveTeam = (name: string) => {
    const t = name.trim().slice(0, 24);
    setTeamState(t); setDraft(t); setEditing(false);
    try { t ? localStorage.setItem(TEAM_KEY, t) : localStorage.removeItem(TEAM_KEY); } catch { /* no-op */ }
    chanRef.current?.send({ type: "broadcast", event: POLL_EVENTS.hello, payload: { voter, team: t || undefined, level: trainingLevel || undefined } as PollHello });
  };

  useEffect(() => {
    if (!supabase) { setStatus("error"); return; }
    const ch = supabase.channel(channelName(code), { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: POLL_EVENTS.state }, ({ payload }: { payload: PollState }) => {
      if (payload.revealed && payload.qid) {
        historyRef.current.set(payload.qid, { correct: payload.correct, myChoice: myVoteRef.current, index: payload.index });
      }
      setRemote(payload);
      if (payload.qid !== lastQid.current) { lastQid.current = payload.qid; setMyVote(null); myVoteRef.current = null; setReviewQid(null); }
    });
    // Host ran the auto-assign shuffle — take the team it picked for me, unless
    // I've already got one (either from a prior shuffle or my own rename).
    ch.on("broadcast", { event: POLL_EVENTS.assign }, ({ payload }: { payload: PollAssign }) => {
      const assigned = payload?.assignments?.[voter];
      if (assigned && !teamRef.current) saveTeam(assigned);
    });
    ch.subscribe((st) => {
      if (st === "SUBSCRIBED") { setStatus("joined"); ch.send({ type: "broadcast", event: POLL_EVENTS.hello, payload: { voter, team: teamRef.current || undefined, level: trainingLevel || undefined } as PollHello }); }
      else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") setStatus("error");
    });
    chanRef.current = ch;
    return () => { supabase?.removeChannel(ch); chanRef.current = null; };
  }, [code, voter]); // eslint-disable-line

  // Stable mode: always use the season-long roster's pick for me, not
  // whatever I last typed in for a self/auto session.
  useEffect(() => {
    if (remote?.teamMode === "stable" && stableTeam && team !== stableTeam) saveTeam(stableTeam);
  }, [remote?.teamMode, stableTeam]); // eslint-disable-line

  const vote = (letter: string) => {
    if (!remote || remote.revealed) return;
    setMyVote(letter);
    myVoteRef.current = letter;
    chanRef.current?.send({ type: "broadcast", event: POLL_EVENTS.vote, payload: { qid: remote.qid, choice: letter, voter, team: team || undefined, level: trainingLevel || undefined } });
  };

  // Every question I saw revealed, that I either missed or never voted on —
  // built once the poll finishes, from the local question bank (byId) so the
  // export can include the full explanation (never broadcast over the poll
  // channel itself).
  const missedRows = () => {
    const rows: { q: RawQuestion; myChoice: string | null }[] = [];
    for (const [qid, h] of historyRef.current) {
      const q = byId.get(qid);
      if (!q) continue;
      if (!h.myChoice || !h.correct.includes(h.myChoice)) rows.push({ q, myChoice: h.myChoice });
    }
    return rows;
  };

  const letters = remote ? Array.from({ length: remote.nOptions }, (_, i) => String.fromCharCode(65 + i)) : [];
  const isStableMode = remote?.teamMode === "stable";
  const awaitingAutoAssign = remote?.teamMode === "auto" && !team;
  const awaitingStableTeam = isStableMode && !team;
  const showTeamEditor = !isStableMode && (editing || (!team && !awaitingAutoAssign));

  return (
    <div style={s.joinRoot}>
      <style>{CSS}</style>
      <div style={s.joinCard}>
        <div style={s.joinHead}>
          <span style={s.pollLive}><Radio size={15} strokeWidth={2.4} /> Poll {code}</span>
          <button style={s.pollClose} onClick={onClose} title="Leave poll"><X size={16} strokeWidth={2.4} /></button>
        </div>

        {status !== "error" && (
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
                  placeholder="Your team name"
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit" style={{ ...s.teamSet, ...(draft.trim() ? {} : s.teamSetOff) }} disabled={!draft.trim()}>
                  {team ? "Save" : "Join"}
                </button>
              </form>
            ) : awaitingAutoAssign ? (
              <span style={s.teamTag}><Users size={15} strokeWidth={2.3} /> Waiting for the host to assign teams…</span>
            ) : awaitingStableTeam ? (
              <span style={s.teamTag}><Users size={15} strokeWidth={2.3} /> No season team on file — ask an admin to set your PGY year.</span>
            ) : (
              <>
                <span style={s.teamTag}><Users size={15} strokeWidth={2.3} /> Team <b style={{ color: "#fff" }}>{team}</b></span>
                {!isStableMode && <button style={s.teamChange} onClick={() => { setDraft(team); setEditing(true); }}>change</button>}
              </>
            )}
          </div>
        )}
        {status !== "error" && !team && (
          <p style={s.teamScoreHint}>Teams are ranked by correct answers per person who answers — a bigger team doesn't get an edge.</p>
        )}

        {status === "error" ? (
          <p style={s.joinMsg}>Couldn't connect to the poll. Double-check the code and try again.</p>
        ) : !remote ? (
          <p style={s.joinMsg}>Joined poll <b style={{ color: "#fff" }}>{code}</b> — waiting for the host to start…</p>
        ) : (
          <>
            {reviewQid ? (() => {
              const rq = byId.get(reviewQid);
              const rh = historyRef.current.get(reviewQid);
              if (!rq) return <p style={s.joinMsg}>That question isn't available to review.</p>;
              const rCorrect = rh?.correct ?? [];
              const rMine = rh?.myChoice ?? null;
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
                      const isMine = rMine === o.letter;
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
                    {rMine ? (rCorrect.includes(rMine) ? " — you got it! 🎉" : ` — you picked ${rMine}`) : " — you didn't vote"}
                  </p>
                  {(rq.explanation_text || rq.explanation_images.length > 0) && (
                    <div style={s.joinExplBox}>
                      <span style={s.joinExplLabel}><Lightbulb size={13} strokeWidth={2.3} /> Explanation</span>
                      {rq.explanation_text && <p style={s.joinExpl}>{rq.explanation_text}</p>}
                      {rq.explanation_images.map((src, i) => <img key={i} src={src} alt="" style={s.joinExplImg} />)}
                    </div>
                  )}
                </>
              );
            })() : (
              <>
                <p style={s.joinMsg}>
                  {remote.finished
                    ? <>Poll complete — thanks for playing! 🎉</>
                    : <>Question {remote.index + 1} of {remote.total} — read it on the big screen, then tap your answer.</>}
                </p>
                {!remote.finished && !remote.revealed && (remote.joined ?? 0) > 0 && (
                  <p style={{ ...s.joinState, marginTop: 0 }}>{remote.voted ?? 0} of {remote.joined} voted</p>
                )}
                {!remote.finished && (
                <div style={s.joinOptsFull}>
                  {(remote.options?.length ? remote.options : letters.map((L) => ({ letter: L, text: "" }))).map((o) => {
                    const mine = myVote === o.letter;
                    const correct = remote.revealed && remote.correct.includes(o.letter);
                    const wrong = remote.revealed && mine && !correct;
                    return (
                      <button key={o.letter} onClick={() => vote(o.letter)} disabled={remote.revealed}
                        style={{ ...s.joinOptFull, ...(mine ? s.joinOptMine : {}), ...(correct ? s.joinOptCorrect : {}), ...(wrong ? s.joinOptWrong : {}) }}>
                        <span style={s.joinOptFullLetter}>{o.letter}</span>
                        <span style={{ flex: 1 }}>{o.text}</span>
                        {(correct || wrong) && <span>{correct ? "✓" : "✗"}</span>}
                      </button>
                    );
                  })}
                </div>
                )}
                {!remote.finished && (
                <p style={s.joinState}>
                  {remote.revealed
                    ? <>Answer: <b style={{ color: "#fff" }}>{remote.correct.join(", ")}</b>{myVote ? (remote.correct.includes(myVote) ? " — you got it! 🎉" : ` — you picked ${myVote}`) : " — you didn't vote"}</>
                    : myVote ? `You picked ${myVote}. Tap another to change it.` : "Tap a letter to cast your vote."}
                </p>
                )}
                {!remote.finished && remote.revealed && (() => {
                  const cq = byId.get(remote.qid);
                  if (!cq || (!cq.explanation_text && cq.explanation_images.length === 0)) return null;
                  return (
                    <div style={s.joinExplBox}>
                      <span style={s.joinExplLabel}><Lightbulb size={13} strokeWidth={2.3} /> Explanation</span>
                      {cq.explanation_text && <p style={s.joinExpl}>{cq.explanation_text}</p>}
                      {cq.explanation_images.map((src, i) => <img key={i} src={src} alt="" style={s.joinExplImg} />)}
                    </div>
                  );
                })()}
              </>
            )}
            {historyRef.current.size > 0 && (
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
            {(remote.finished || remote.revealed) && remote.standings?.length > 0 && (
              <div style={s.teamBoardMini}>
                {remote.standings.slice(0, 5).map((t, i) => (
                  <div key={t.team} style={{ ...s.teamMiniRow, ...(i === 0 ? s.teamMiniLead : {}), ...(t.team === team ? s.teamMiniMine : {}) }}>
                    <span style={s.teamMiniRank}>{i === 0 ? <Crown size={15} strokeWidth={2.4} color="#f2c14e" /> : i + 1}</span>
                    <span style={s.teamMiniName}>{t.team}{t.team === team ? " (you)" : ""}</span>
                    <span style={s.teamMiniScore}>{t.score}/player</span>
                  </div>
                ))}
              </div>
            )}
            {remote.standings && remote.standings.length > 0 && (
              <button
                style={s.teamDownload}
                onClick={() => exportPollTeams(remote.standings, { code, index: remote.index + 1, total: remote.total })}
              >
                <Download size={13} strokeWidth={2.3} /> Download team stats (Excel)
              </button>
            )}
            {remote.finished && (
              <button
                style={s.teamDownload}
                onClick={() => exportPollMissed(missedRows(), { code, who: displayName })}
                title="A study sheet of just the questions you missed, with the full explanation for each"
              >
                <Download size={13} strokeWidth={2.3} /> Download my missed questions
              </button>
            )}
          </>
        )}
      </div>
    </div>
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

function SignIn() {
  return (
    <div style={s.gateRoot}>
      <style>{CSS}</style>
      <div style={s.gateCard}>
        <span style={s.gateMark}><Stethoscope size={22} strokeWidth={2.3} color="#fff" /></span>
        <h1 style={s.gateTitle}>PRITE Daily</h1>
        <p style={s.gateSub}>Daily PRITE practice for the residency. Sign in with your Google account to continue.</p>
        <button style={s.googleBtn} onClick={() => signInWithGoogle()}>
          <GoogleG /> Sign in with Google
        </button>
        <p style={s.gateFine}>Residents and known faculty are approved automatically. Some faculty or alumni may still need admin approval.</p>
      </div>
    </div>
  );
}

function Pending({ email, status }: { email: string; status: string }) {
  return (
    <div style={s.gateRoot}>
      <style>{CSS}</style>
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
function BugReportsPanel({ reports, byId, onAct, onClose }: {
  reports: BugReport[];
  byId: Map<string, RawQuestion>;
  onAct: (id: string, status: string) => void;
  onClose: () => void;
}) {
  const open = reports.filter((r) => r.status === "open");
  const done = reports.filter((r) => r.status !== "open");
  const kindLabel = (k: string) => BUG_KINDS.find(([v]) => v === k)?.[1] ?? k;
  const row = (r: BugReport) => {
    const q = r.question_id ? byId.get(r.question_id) : null;
    return (
      <div key={r.id} style={s.bugRow}>
        <div style={s.bugMeta}>
          <span style={s.bugKind}>{kindLabel(r.kind)}</span>
          {r.question_id && <span style={s.bugQ}>{r.question_id}</span>}
          <span style={s.bugWho}>{r.reporter?.full_name || r.reporter?.email || "—"} · {ago(r.created_at)}</span>
          <span style={{ ...s.bugStatus, color: r.status === "open" ? T.wrongText : T.faint }}>{r.status}</span>
        </div>
        {q && <div style={s.bugStem}>{q.stem}</div>}
        <p style={s.bugMsg}>{r.message}</p>
        <div style={{ display: "flex", gap: 8 }}>
          {r.status !== "resolved" && <button style={s.apApprove} onClick={() => onAct(r.id, "resolved")}>Resolve</button>}
          {r.status === "open" && <button style={s.ghost} onClick={() => onAct(r.id, "dismissed")}>Dismiss</button>}
          {r.status !== "open" && <button style={s.ghost} onClick={() => onAct(r.id, "open")}>Reopen</button>}
        </div>
      </div>
    );
  };
  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 620 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Bug reports</div>
            <div style={s.apTitle}>{open.length} open · {reports.length} total</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.apBody}>
          {reports.length === 0 && <p style={s.apEmpty}>No reports yet. 🎉</p>}
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
function OfficialResultsPanel({ results, onClose, onCleared }: {
  results: OfficialPollResult[];
  onClose: () => void;
  onCleared: () => void;
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
            <div style={s.apEyebrow}>Admin · poll results</div>
            <div style={s.apTitle}>{results.length} official session{results.length === 1 ? "" : "s"}</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.apBody}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
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
  profiles, onClose, onAct,
}: {
  profiles: Profile[];
  onClose: () => void;
  onAct: (id: string, patch: Partial<Pick<Profile, "status" | "role">>) => void;
}) {
  const pending = profiles.filter((p) => p.status === "pending");
  const others = profiles.filter((p) => p.status !== "pending");
  const row = (p: Profile) => {
    const year = matchRoster(p.full_name);
    return (
      <div key={p.id} style={s.apRow}>
        <span style={s.apAvatar}>{initials(p.full_name || p.email)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={s.apName}>
            {p.full_name || "(no name)"}
            {year && <span style={s.apMatch}>✓ roster ’{year.slice(2)}</span>}
            {!year && p.status === "pending" && <span style={s.apNoMatch}>no roster match</span>}
          </div>
          <div style={s.apEmail}>{p.email} · {p.role}{p.status !== "pending" ? ` · ${p.status}` : ""}</div>
        </div>
        <div style={s.apActions}>
          {p.status !== "approved" && (
            <button style={s.apApprove} onClick={() => onAct(p.id, { status: "approved" })}>Approve</button>
          )}
          {p.status === "approved" && p.role !== "admin" && (
            <select
              value={p.role}
              onChange={(e) => onAct(p.id, { role: e.target.value as Profile["role"] })}
              style={s.apSelect}
            >
              <option value="resident">resident</option>
              <option value="faculty">faculty</option>
              <option value="alumni">alumni</option>
              <option value="admin">admin</option>
            </select>
          )}
          {p.status !== "blocked" && p.role !== "admin" && (
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
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.apBody}>
          <div style={s.apSectionLbl}>Pending {pending.length > 0 && <span style={s.pendingBadge}>{pending.length}</span>}</div>
          {pending.length ? pending.map(row) : <p style={s.apEmpty}>No one waiting. Residents whose Google name matches the roster are approved automatically.</p>}
          {others.length > 0 && <div style={{ ...s.apSectionLbl, marginTop: 18 }}>Members</div>}
          {others.map(row)}
        </div>
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
              {[5, 10, 20].map((n) => (
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
              value={settings.exam_date ?? ""}
              onChange={(e) => onChange({ exam_date: e.target.value || null })}
              style={s.dateInput}
            />
            <div style={s.setHint}>Drives the countdown in the header.</div>
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
                          ? <>Automatic: on during the 90 days before your exam{settings.exam_date ? "" : ` (using ${guessedExamDate()} since you haven't set one)`}, off after. Toggle to override.</>
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
          {m.answered === 0 ? (
            <p style={s.apEmpty}>You haven’t answered any questions yet. Once you start, your stats will show up here.</p>
          ) : (
            <>
              <div style={s.statGrid}>
                {card(m.answered, "Questions answered", `${m.attempts} total attempts`)}
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

  const matches = useMemo(() => all.filter((q) => {
    if (year !== "all" && q.year !== year) return false;
    if (cat !== "all" && q.prite_category !== cat) return false;
    if (med !== "all" && !(q.tags?.medication ?? []).includes(med)) return false;
    if (dx !== "all" && !(q.tags?.diagnosis ?? []).includes(dx)) return false;
    if (topic !== "all" && !(q.tags?.topics ?? []).includes(topic)) return false;
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
  }), [all, year, cat, med, dx, topic, search, scope]);

  // when the filter changes, select all matches by default
  useEffect(() => { setSelected(new Set(matches.map((q) => questionId(q.year, q.q_index)))); }, [year, cat, med, dx, topic, search, scope]); // eslint-disable-line

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
    const rows = ids.map((id) => {
      const q = byId.get(id); const cz = clozes[id];
      return q && cz ? { questionId: id, cloze: cz, lecture: ankingLecture(q) } : null;
    }).filter(Boolean) as { questionId: string; cloze: string; lecture: string }[];
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
function TestsPanel({
  tests, byId, onClose, onStudy, onHost, onPptx, onRename, onDelete, onStudyGuide, generatingGuideId,
}: {
  tests: SavedTest[];
  byId: Map<string, RawQuestion>;
  onClose: () => void;
  onStudy: (t: SavedTest) => void;
  onHost: (t: SavedTest) => void;
  onPptx: (t: SavedTest) => void;
  onRename: (t: SavedTest) => void;
  onDelete: (t: SavedTest) => void;
  onStudyGuide: (t: SavedTest) => void;
  generatingGuideId: string | null;
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
                    <button
                      style={{ ...s.ghost, marginLeft: 0, opacity: generatingGuideId === t.id ? 0.6 : 1 }}
                      disabled={generatingGuideId === t.id}
                      onClick={() => onStudyGuide(t)}
                      title="Generate a prep page + ~10-min audio overview to send the class before the session — background and context only, doesn't give away answers"
                    >
                      <BookOpen size={13} strokeWidth={2.3} /> {generatingGuideId === t.id ? "Writing…" : "Study guide"}
                    </button>
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
  guide, onClose, onRegenerate, regenerating,
}: {
  guide: StudyGuide;
  onClose: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const [copied, setCopied] = useState(false);
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
            <div style={s.apEyebrow}>Ready to send</div>
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
            </button>
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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Same 0.5x-2.5x speed range as the AcademicWiki read-aloud player.
  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = rate; }, [rate, audioUrl]);

  useEffect(() => {
    let alive = true;
    getStudyGuide(id).then((g) => { if (alive) setGuide(g); });
    return () => { alive = false; };
  }, [id]);

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
        <button style={{ ...s.ghost, marginLeft: 0, marginBottom: 18 }} onClick={onClose}>
          <ArrowLeft size={14} strokeWidth={2.3} /> Back to Prite Daily
        </button>

        {guide === undefined && <p style={{ color: T.muted }}>Loading…</p>}
        {guide === null && <p style={{ color: T.muted }}>This study guide link isn't valid, or you may need to sign in.</p>}

        {guide && (
          <>
            <div style={{ fontSize: 12.5, letterSpacing: 0.4, textTransform: "uppercase", color: T.teal, fontWeight: 700, marginBottom: 6 }}>
              Prep material · doesn't give away the quiz
            </div>
            <h1 style={{ fontSize: 30, lineHeight: 1.2, margin: "0 0 14px", color: T.ink }}>{guide.title}</h1>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: T.text, margin: "0 0 22px" }}>{guide.intro}</p>

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
                ) : !audioError ? (
                  <span style={{ fontSize: 12.5, color: T.tealDeep }}>Loading audio…</span>
                ) : null}
              </div>
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
            {audioError && <p style={{ fontSize: 13, color: T.wrongLine, marginTop: -18, marginBottom: 24 }}>{audioError}</p>}

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
  due, byId, onGrade, onClose,
}: {
  due: SrsRow[];
  byId: Map<string, RawQuestion>;
  onGrade: (qid: string, grade: SrsGrade) => Promise<void>;
  onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [card, setCard] = useState<Flashcard | null>(null);
  const [busy, setBusy] = useState(false);
  const [grading, setGrading] = useState(false);

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
    <div style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 620 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Spaced repetition · SM-2</div>
            <div style={s.apTitle}>Review{due.length ? ` (${due.length} due)` : ""}</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.apBody}>
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

function Leaderboard({ rows, meId, onClose }: { rows: LeaderRow[]; meId?: string; onClose: () => void }) {
  const ranked = rows.filter((r) => r.answered > 0);
  return (
    <div style={s.scrim} onClick={onClose}>
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
const CSS = `
* { box-sizing: border-box; }
button { font-family: inherit; }
.opt:hover:not(:disabled) { border-color: ${T.teal}33 !important; transform: translateY(-1px); }
.opt:disabled { cursor: default; }
.opt { transition: transform .12s ease, border-color .12s ease; }
.tab:hover { color: ${T.text}; }
.fade { animation: fade .28s ease both; }
@keyframes fade { from { opacity: 0; transform: translateY(4px); } }
.dist { animation: grow .6s cubic-bezier(.22,.61,.36,1) both; }
@keyframes grow { from { width: 0 !important; } }
.toast { animation: tin .3s ease both; }
@keyframes tin { from { opacity: 0; transform: translateY(8px); } }
button:not(.opt):active { transform: scale(.96); }
.opt:active:not(:disabled) { transform: scale(.99); }
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
@media (prefers-reduced-motion: reduce) {
  .fade, .toast, .pop, .slidein { animation: none !important; }
  .streakPop, .streakGlow { animation: none !important; }
  .balloonRiseA, .balloonRiseB { display: none !important; }
  .tabInd { transition: none !important; }
  button:not(.opt):active, .opt:active:not(:disabled) { transform: none !important; }
}
@media (max-width: 680px) {
  .topInner { flex-wrap: wrap !important; padding: 10px 14px !important; gap: 8px 10px !important; }
  .topMeta { width: 100% !important; justify-content: space-between !important; gap: 8px !important; flex-wrap: wrap !important; }
  .topActions { gap: 6px !important; flex-wrap: wrap !important; justify-content: flex-end !important; }
  .topActBtn { padding: 7px 9px !important; }
  .btnTxt { display: none !important; }
}
`;

/* ---------------------------------------------------------------------- */
const s: Record<string, React.CSSProperties> = {
  root: { minHeight: "100vh", background: T.ink, fontFamily: "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif", color: T.text },

  top: { position: "sticky", top: 0, zIndex: 20, background: T.ink, borderBottom: `1px solid ${T.inkLine}` },
  topInner: { maxWidth: 880, margin: "0 auto", padding: "13px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 },
  brand: { display: "flex", alignItems: "center", gap: 9 },
  brandMark: { width: 28, height: 28, borderRadius: 8, background: T.teal, color: "#fff", display: "grid", placeItems: "center" },
  brandName: { color: "#fff", fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em" },
  topMeta: { display: "flex", alignItems: "center", gap: 13 },
  countdown: { color: "#c7ccd6", fontSize: 12.5, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  countNum: { color: T.gold, fontWeight: 700 },
  who: { display: "flex", alignItems: "center", gap: 7 },
  avatarSm: { width: 28, height: 28, borderRadius: 8, background: T.teal, color: "#fff", display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 700 },
  adminTag: { display: "inline-flex", alignItems: "center", gap: 4, color: "#9aa0ab", fontSize: 11, fontWeight: 500, textTransform: "capitalize" },
  signOut: { display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 8, background: T.inkSoft, color: "#aeb4c0", border: `1px solid ${T.inkLine}`, cursor: "pointer" },
  approveBtn: { position: "relative", display: "inline-flex", alignItems: "center", gap: 6, background: T.inkSoft, color: "#e7d9b4", border: `1px solid ${T.inkLine}`, padding: "6px 11px", borderRadius: 8, fontSize: 12.5, fontWeight: 500, cursor: "pointer" },
  navSegRow: { display: "inline-flex", background: T.inkSoft, border: `1px solid ${T.inkLine}`, borderRadius: 9, padding: 2, gap: 2 },
  navSegBtn: { display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", color: "#aeb4c0", border: "none", padding: "5px 10px", borderRadius: 7, fontSize: 12.5, fontWeight: 500, cursor: "pointer" },
  navSegOn: { background: T.teal, color: "#fff" },
  pendingBadge: { display: "inline-grid", placeItems: "center", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: T.gold, color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },

  scrim: { position: "fixed", inset: 0, background: "rgba(15,17,26,.6)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", padding: 18, zIndex: 80 },
  apPanel: { width: "100%", maxWidth: 540, maxHeight: "84vh", display: "flex", flexDirection: "column", background: T.paper, borderRadius: 18, overflow: "hidden", border: `1px solid ${T.paperEdge}`, boxShadow: "0 30px 80px -30px rgba(0,0,0,.6)" },
  apHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 22px 12px" },
  apEyebrow: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: T.muted },
  apTitle: { fontSize: 22, fontWeight: 700, color: T.text, marginTop: 3 },
  close: { background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 8, width: 32, height: 32, display: "grid", placeItems: "center", cursor: "pointer", color: T.muted },
  apBody: { padding: "0 18px 18px", overflowY: "auto" },
  apSectionLbl: { display: "flex", alignItems: "center", gap: 8, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: T.faint, margin: "8px 4px 10px" },
  apRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderBottom: `1px solid ${T.paperEdge}` },
  apAvatar: { width: 34, height: 34, borderRadius: 9, background: T.inkSoft, color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  apName: { fontSize: 14.5, fontWeight: 600, color: T.text, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  apMatch: { fontSize: 11, fontWeight: 600, color: T.correctText, background: T.correctBg, border: `1px solid ${T.correctLine}55`, borderRadius: 5, padding: "1px 6px" },
  apNoMatch: { fontSize: 11, fontWeight: 500, color: T.muted, background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 5, padding: "1px 6px" },
  apEmail: { fontSize: 12.5, color: T.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  apActions: { display: "flex", alignItems: "center", gap: 7, flexShrink: 0 },
  apApprove: { background: T.teal, color: "#fff", border: "none", padding: "7px 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  apSelect: { background: "#fff", color: T.text, border: `1px solid ${T.paperEdge}`, borderRadius: 8, padding: "6px 8px", fontSize: 12.5, cursor: "pointer" },
  apBlock: { display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, background: "#fff", color: T.wrongLine, border: `1px solid ${T.paperEdge}`, cursor: "pointer" },
  apEmpty: { fontSize: 13.5, color: T.muted, lineHeight: 1.5, margin: "0 4px", fontStyle: "italic" },
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
  statNum: { fontFamily: "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif", fontSize: 26, fontWeight: 700, lineHeight: 1.1, color: T.text },
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
  insTabOn: { background: T.teal, color: "#fff", borderColor: T.teal },
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

  gateRoot: { minHeight: "100vh", background: T.ink, display: "grid", placeItems: "center", padding: 24, fontFamily: "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif" },
  gateCard: { maxWidth: 400, width: "100%", background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 18, padding: "34px 30px", textAlign: "center", boxShadow: "0 30px 80px -30px rgba(0,0,0,.6)" },
  gateMark: { width: 52, height: 52, borderRadius: 14, background: T.teal, display: "inline-grid", placeItems: "center", marginBottom: 16 },
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
  missChip: { display: "inline-flex", alignItems: "center", gap: 6, background: T.inkSoft, color: "#c9a35a", border: `1px solid ${T.inkLine}`, padding: "6px 11px", borderRadius: 8, fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },

  doneBanner: { display: "flex", alignItems: "center", gap: 11, flexWrap: "wrap", background: T.tealSoft, border: `1px solid ${T.teal}66`, borderRadius: 12, padding: "12px 15px", marginBottom: 16, fontSize: 14, color: T.text },
  doneIcon: { width: 22, height: 22, borderRadius: 6, background: T.teal, display: "grid", placeItems: "center", flexShrink: 0 },
  doneBtn: { display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", background: T.teal, color: "#fff", border: "none", padding: "7px 13px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },

  studyBar: { display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 16 },
  studyToggle: { display: "inline-flex", alignItems: "center", gap: 6, background: T.inkSoft, color: "#9aa0ab", border: `1px solid ${T.inkLine}`, padding: "6px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  studyToggleOn: { background: T.teal, color: "#fff", borderColor: T.teal },
  studySecs: { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#c7ccd6" },
  secsInput: { width: 52, background: T.inkSoft, color: "#fff", border: `1px solid ${T.inkLine}`, borderRadius: 8, padding: "5px 8px", fontSize: 13, fontWeight: 600, textAlign: "center", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  timerPill: { display: "inline-flex", alignItems: "center", gap: 5, marginLeft: "auto", background: T.inkSoft, color: "#e7eaf0", border: `1px solid ${T.inkLine}`, padding: "6px 12px", borderRadius: 9, fontSize: 14, fontWeight: 700, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontVariantNumeric: "tabular-nums" },
  timerPillLow: { background: "#3a2018", color: "#ff9b80", borderColor: "#7a3a2a" },
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
  deckRowStem: { fontSize: 13.5, color: T.text, lineHeight: 1.45 },
  deckRowAns: { fontSize: 12.5, color: T.tealDeep, fontWeight: 500 },
  deckFoot: { display: "flex", alignItems: "center", gap: 13, padding: "14px 22px", borderTop: `1px solid ${T.paperEdge}`, flexWrap: "wrap" },

  progressRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 },
  qeyebrow: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 12, letterSpacing: "0.04em", color: "#8c93a1", textTransform: "uppercase" },
  reportBtn: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", color: T.faint, fontSize: 12, cursor: "pointer", padding: "2px 4px" },
  multiTag: { display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, color: T.gold, background: T.goldSoft, borderRadius: 6, padding: "3px 9px" },

  qcard: { background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 16, padding: "26px 26px 22px", boxShadow: "0 1px 0 rgba(0,0,0,.04), 0 18px 40px -28px rgba(20,24,40,.5)" },
  figRow: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18, justifyContent: "center" },
  figImg: { maxWidth: "100%", maxHeight: 320, borderRadius: 10, border: `1px solid ${T.paperEdge}`, background: "#fff" },
  stem: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 20, lineHeight: 1.5, color: T.text, margin: "0 0 22px", fontWeight: 400 },
  stemSelectable: { cursor: "text", marginBottom: 8 },
  hlMark: { background: T.goldSoft, color: "inherit", borderRadius: 3, padding: "0 1px", boxShadow: `inset 0 -2px 0 ${T.gold}`, cursor: "pointer" },
  hlHint: { display: "flex", justifyContent: "center", alignItems: "center", gap: 5, fontSize: 11.5, color: T.faint, margin: "12px 0 0" },

  options: { display: "flex", flexDirection: "column", gap: 9 },
  opt: { position: "relative", overflow: "hidden", display: "flex", alignItems: "center", gap: 13, textAlign: "left", width: "100%", background: T.card, border: `1.5px solid ${T.paperEdge}`, borderRadius: 11, padding: "13px 15px", fontSize: 15, color: T.text, cursor: "pointer" },
  optChosen: { borderColor: T.teal, background: T.tealSoft },
  optCorrect: { borderColor: T.correctLine, background: T.correctBg },
  optWrong: { borderColor: T.wrongLine, background: T.wrongBg },
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
  pollOptCorrect: { borderColor: "#48c78e" },
  pollBar: { position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 0, borderRadius: "13px 0 0 13px", transition: "width .5s cubic-bezier(.22,.61,.36,1)" },
  pollLetter: { position: "relative", zIndex: 1, flexShrink: 0, width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 11, background: "rgba(255,255,255,.06)", border: `1px solid ${T.inkLine}`, fontWeight: 700, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  pollOptText: { position: "relative", zIndex: 1, flex: 1 },
  pollOptCount: { position: "relative", zIndex: 1, display: "inline-flex", alignItems: "center", flexShrink: 0, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontWeight: 700, color: "#e7eaf0" },
  pollControls: { display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap", padding: "16px 26px", borderTop: `1px solid ${T.inkLine}` },
  pollBtn: { display: "inline-flex", alignItems: "center", gap: 8, background: T.inkSoft, color: "#e7eaf0", border: `1px solid ${T.inkLine}`, padding: "12px 22px", borderRadius: 11, fontSize: 16, fontWeight: 600, cursor: "pointer" },
  pollBtnPrimary: { background: T.teal, color: "#fff", borderColor: T.teal },
  pollAnswerLine: { fontSize: 18, color: "#c7ccd6" },
  qrThumb: { padding: 5, border: "none", borderRadius: 10, background: "#fff", cursor: "pointer", lineHeight: 0, flexShrink: 0, boxShadow: "0 4px 14px -6px rgba(0,0,0,.5)" },
  qrThumbImg: { display: "block", width: 48, height: 48 },
  qrOverlay: { position: "absolute", inset: 0, zIndex: 5, background: "rgba(11,13,20,.86)", display: "grid", placeItems: "center", padding: 24 },
  qrCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 14, background: "#fff", borderRadius: 20, padding: "26px 26px 22px" },
  qrBigImg: { display: "block", width: "min(60vh, 70vw, 420px)", height: "min(60vh, 70vw, 420px)" },
  qrCardCode: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 30, fontWeight: 700, letterSpacing: "0.22em", color: "#11131c" },
  qrCardUrl: { color: "#6c7280", fontSize: 14, marginTop: -6 },
  zoomImg: { display: "block", maxWidth: "92vw", maxHeight: "88vh", width: "auto", height: "auto", objectFit: "contain", borderRadius: 12, background: "#fff", cursor: "default" },

  // live crowd poll — participant (phone)
  joinRoot: { position: "fixed", inset: 0, zIndex: 90, background: T.ink, display: "grid", placeItems: "center", padding: 20, fontFamily: "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif" },
  joinCard: { width: "100%", maxWidth: 460, background: T.inkSoft, border: `1px solid ${T.inkLine}`, borderRadius: 18, padding: 22, boxShadow: "0 24px 60px -20px rgba(0,0,0,.7)" },
  joinHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  joinMsg: { color: "#c7ccd6", fontSize: 15, lineHeight: 1.5, margin: "0 0 18px" },
  joinOpts: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(64px, 1fr))", gap: 12 },
  joinOpt: { aspectRatio: "1 / 1", display: "grid", placeItems: "center", background: T.ink, color: "#e7eaf0", border: `2px solid ${T.inkLine}`, borderRadius: 16, fontSize: 30, fontWeight: 700, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", cursor: "pointer" },
  joinOptsFull: { display: "flex", flexDirection: "column", gap: 10 },
  joinOptFull: { display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: T.ink, color: "#e7eaf0", border: `2px solid ${T.inkLine}`, borderRadius: 14, padding: "13px 16px", fontSize: 16.5, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", cursor: "pointer" },
  joinOptFullLetter: { flexShrink: 0, width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 9, background: "rgba(255,255,255,.1)", fontWeight: 700 },
  joinOptMine: { background: T.teal, color: "#fff", borderColor: T.teal },
  joinOptCorrect: { background: "#1a7a4a", color: "#fff", borderColor: "#48c78e" },
  joinOptWrong: { background: "#7a2a2a", color: "#fff", borderColor: "#e07a5f" },
  joinState: { marginTop: 18, marginBottom: 0, color: "#c7ccd6", fontSize: 14.5, textAlign: "center", minHeight: 20 },

  // live polling group statistics — host (big screen), pinned at the top
  pollStats: { marginBottom: 28, paddingBottom: 22, borderBottom: `1px solid ${T.inkLine}`, display: "flex", flexDirection: "column", gap: 8 },
  pollStatsHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 4 },
  pollStatsExport: { display: "inline-flex", alignItems: "center", gap: 7, background: T.inkSoft, color: "#e7eaf0", border: `1px solid ${T.inkLine}`, padding: "8px 14px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  teamBoardHead: { display: "inline-flex", alignItems: "center", gap: 9, color: "#f2c14e", fontWeight: 700, letterSpacing: "0.03em", fontSize: 15 },
  teamRow: { display: "flex", alignItems: "center", gap: 16, background: T.inkSoft, border: `1.5px solid ${T.inkLine}`, borderRadius: 12, padding: "12px 18px", fontSize: "clamp(16px, 1.7vw, 21px)" },
  teamRowLead: { borderColor: "#f2c14e", background: "rgba(242,193,78,.10)" },
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
  teamMiniLead: { borderColor: "#f2c14e", background: "rgba(242,193,78,.10)" },
  teamMiniMine: { borderColor: T.teal },
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
  pollReviewChipActive: { background: T.teal, color: "#fff", borderColor: T.teal },
};
