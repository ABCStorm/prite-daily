import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import {
  ShieldCheck, Trophy, NotebookPen, Users, User, Layers, Stethoscope,
  Check, X, Image as ImageIcon, Trash2, Download, Flame, ArrowRight, Monitor,
  ArrowLeft, ListChecks, LogOut, Clock, Settings as SettingsIcon,
  Sparkles, Target, RotateCcw, BarChart3, Pencil, Search, FileText, ExternalLink,
  TrendingUp, Youtube, Network, Zap, Crown, Radio, Lightbulb, Highlighter, Bug,
  ChevronDown, ChevronUp, ChevronRight, Share2, Archive, Baby, Mail, Minus, Plus, Repeat,
  Eye, EyeOff, PanelRight, PanelBottom,
  BookOpen, Volume2, Play, Pause, Square, Copy, Shuffle, GripVertical,
  Brain, Pill, HeartPulse, GraduationCap, LayoutDashboard, Pin, Headphones,
  Library, BookMarked, Sofa,
} from "lucide-react";
import mermaid from "mermaid";
import { nextRewardPost, RewardKind } from "./lib/motivation";
import { ExplanationText } from "./lib/explanationFormat";
import { KaplanPanel } from "./lib/kaplanPanel";
import { loadKaplanRefs, type KaplanRef } from "./lib/kaplanRefs";
import { ResearchPanel } from "./lib/researchPanel";
import { loadResearchRefs, type ResearchRef } from "./lib/researchRefs";
import { DsmPanel } from "./lib/dsmPanel";
import { loadDsmRefs, type DsmRef } from "./lib/dsmRefs";
import { KaufmanPanel, KaufmanFigure } from "./lib/kaufmanPanel";
import { loadKaufmanRefs, loadKaufmanQuestions, type KaufmanRef } from "./lib/kaufmanRefs";
import { loadTherapyQuestions } from "./lib/therapyQuestions";
import { BienenfeldPanel } from "./lib/bienenfeldPanel";
import { CarlatPanel } from "./lib/carlatPanel";
import {
  carlatCategory,
  carlatCategoryRank,
  carlatReaderHref,
  CARLAT_BOOK_BUY_URL,
  loadCarlatQuestions,
  type CarlatLoc,
} from "./lib/carlatRefs";
import {
  bienenfeldChapterLabel,
  bienenfeldReaderHref,
  bienenfeldReturnFromSearch,
  bienenfeldYearRank,
  clearBienenfeldReturnParams,
  loadBienenfeldQuestions,
  readTherapyReturn,
  writeTherapyReturn,
  type BienenfeldLoc,
  type BienenfeldReturn,
} from "./lib/bienenfeldRefs";
import {
  annotateTherapySequences,
  expandTherapySequences,
  keepTherapySequencesTogether,
  shuffleKeepingTherapySequences,
  type TherapySeq,
} from "./lib/therapySequences";
import {
  enrichBankQuestion, furtherReadingFor, autoFlashcard, podcastKeysFor,
  neuroChapter, therapyModality, therapyModalityRank, neuroYearRank, neuroTopicLabel,
  neuroChapterOptionLabel, slug, loadBankContext,
} from "./lib/bankExtras";
import { WiseOwl } from "./lib/WiseOwl";
import { loadOwlStats, type OwlStat } from "./lib/owlStats";
import { AnalystFox } from "./lib/AnalystFox";
import { loadDynPerspectives, type DynPearl } from "./lib/dynPerspectives";
import { MascotTab } from "./lib/MascotTab";
import { ZoomLightbox } from "./lib/ZoomLightbox";
import { ScenarioIllustration } from "./lib/ScenarioIllustration";
import { ResourceImagePanel, type AnkingMatchMeta } from "./lib/ResourceImagePanel";
import { mnemonicsForQuestion, type Mnemonic } from "./lib/mnemonics";
import { getPodcastRefs, podcastUrl, formatTimestamp, type PodcastRef } from "./lib/podcasts";
import QRCode from "qrcode";

mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose", fontFamily: "inherit" });

/* Team scores are fractional now (a team that splits a question earns 0.5), so
   show one decimal only when there is one: "29.5" but still "30", never
   "29.500000000001". Module scope because both the host screen and the
   participant's phone render standings. */
const fmtScore = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** The per-team detail line in every standings view. Shows who ANSWERED against
    who was assigned — "3 of 4 players answered" — because a team carrying a
    silent member is really competing a person short, and the bare roster count
    hid that. Collapses to "4 players answered" when everyone took part. */
const teamDetail = (t: { members: number; answerers: number; correct: number; answered: number }) =>
  `${t.answerers === t.members ? t.members : `${t.answerers} of ${t.members}`} ${t.members === 1 ? "player" : "players"} answered · ${fmtScore(t.correct)}/${t.answered} correct`;

/* Two-sentence plain-English note on how team scoring works, under every
   standings list — it's the first thing anyone asks when the board goes up.
   The host's copy mentions the ranking switch; the participant's doesn't,
   since only the host can flip it. */
const SCORING_RULE =
  "Each closed question counts once per active team; no answer is wrong, and a split team gets the fraction that was right.";
const SCORING_NOTE =
  `${SCORING_RULE} Teams are ranked by accuracy (correct ÷ questions) — use the button above to rank by raw points instead.`;
const SCORING_NOTE_PARTICIPANT =
  `${SCORING_RULE} Teams are ranked by accuracy (correct ÷ questions).`;

/* When you open/advance a question you are often scrolled deep into the prior
   explanation. This pins the white question card just under the sticky chrome
   so the stem is readable without a manual scroll — desktop and mobile.
   Instant (not smooth): animating hundreds of pixels of scroll feels like the
   page lurching. Lives in its own component because App's hooks run above
   several early returns; the parent <div key={qid}> remounts this on every
   question so the effect re-runs for free. */
function QuestionCardAnchor({ revealed }: { revealed: boolean }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Prefer the white card (section[data-qcard]); fall back to the remounting
    // stem host if the marker is ever moved.
    const card =
      (ref.current?.closest("[data-qcard]") as HTMLElement | null)
      ?? ref.current?.parentElement;
    if (!card) return;
    const place = () => {
      const bar = document.querySelector("[data-topbar]") as HTMLElement | null;
      // Work in viewport coordinates: the sticky header can change height as
      // the answer appears, and document-space math can leave the card behind
      // it. Moving by the measured delta always puts the visible card below
      // the header, including the post-submit correction.
      const targetTop = (bar?.getBoundingClientRect().bottom ?? 0) + 16;
      const delta = card.getBoundingClientRect().top - targetTop;
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "auto" });
    };
    // Two frames so the remount settles (previous question's layout is gone).
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => { raf2 = window.requestAnimationFrame(place); });
    // Figures above the stem can decode late and reflow; re-pin once more.
    const late = window.setTimeout(place, 320);
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      window.clearTimeout(late);
    };
  }, [revealed]);
  return <span ref={ref} aria-hidden style={{ display: "none" }} />;
}

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
  pickOneProfilePerPerson, shouldAcceptPollVote, computeTeamStandings,
  POLL_EVENTS, REVEAL_DELAY_MS, type PollState, type PollVote, type PollHello, type PollAssign, type TeamStanding, type IndividualStanding, type TeamMode,
} from "./lib/poll";
import { ImmersiveScene, ImmersiveFlash } from "./ImmersiveScene";
import { nextPollDrumrollGif, prefetchPollDrumrollGifs } from "./lib/pollGifs";
import { hydrateAnswers, rememberAnswer, confirmAnswer, retryPendingAnswers } from "./lib/answersSync";
import { buildPerfChart } from "./lib/perfChart";
import { DEFAULT_DAILY_ORDER, isUnspecifiedDailyOrder } from "./lib/dailyOrder";
import { AdminUsageDashboard } from "./AdminUsageDashboard";
import ClosingPlasmaBackground from "./ClosingPlasmaBackground";

// Per-device backdrop preference — "plasma" (default) or "plain".
const BG_PREF_KEY = "prite.background";
import {
  loadQuestionBank,
  getMyAnswers, saveAnswer, clearMissedAnswers, getMyNote, saveMyNote,
  getGroupNotes, addGroupNote, deleteGroupNote,
  listProfiles, updateProfile, declineAccess, type DeclineVariant, setTrainingLevel, getStableTeams, regenerateStableTeams, setStableTeam, removeStableTeam,
  listRosterNames, addRosterName, removeRosterName, type RosterName,
  listStudyGuideCreators, setStudyGuideCreator,
  getWeeklyTeams, regenerateWeeklyTeams, setWeeklyTeam, removeWeeklyTeam,
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
import { loadTests, saveTest, renameTest, deleteTest, updateTestQids, shareTest, listShareablePeople, type SavedTest, type SharePerson, type TestVisibility } from "./lib/tests";
import {
  generateStudyGuide, getStudyGuide, getStudyGuideAudioUrl, listStudyGuidesForTests, listLibraryStudyGuides, canGenerateStudyGuides,
  getOwnAiKeys, setOwnAiKeys, type OwnAiKeys,
  studyGuideUrl, studyGuideIdFromUrl, clearStudyParam, type StudyGuide, type LibraryStudyGuide,
} from "./lib/studyGuides";
import { SRS_GRADES, intervalLabel, sm2Next, SRS_DEFAULT, type SrsGrade, type SrsState } from "./lib/srs";
import {
  getAudioDrills, getAudioClipUrl, getAudioExportBlob,
  listAudioReviewProgress, saveAudioReviewProgress,
  type AudioReviewProgress,
} from "./lib/audioDrills";

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

function MnemonicCard({ mnemonic }: { mnemonic: Mnemonic }) {
  return (
    <article style={{ border: `1px solid ${T.paperEdge}`, borderRadius: 12, padding: "15px 17px", background: T.paper }}>
      <div style={{ display: "flex", gap: 9, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ color: T.tealDeep, fontSize: 17 }}>{mnemonic.title}</strong>
        <span style={{ color: T.muted, fontSize: 12 }}>{mnemonic.purpose}</span>
      </div>
      <p style={{ margin: "8px 0 10px", color: T.text, fontSize: 14.5, lineHeight: 1.55 }}>{mnemonic.memoryAid}</p>
      <ul style={{ margin: "0 0 8px", paddingLeft: 20, color: T.text, fontSize: 13.5, lineHeight: 1.55 }}>
        {mnemonic.breakdown.map((item) => <li key={item}>{item}</li>)}
      </ul>
      {mnemonic.caveat && <p style={{ margin: "8px 0", color: T.muted, fontSize: 12.5, lineHeight: 1.5 }}>{mnemonic.caveat}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 9 }}>
        {mnemonic.sources.map((source) => (
          <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" style={{ color: T.teal, fontSize: 12 }}>
            {source.label} <ExternalLink size={10} strokeWidth={2} style={{ verticalAlign: "-1px" }} />
          </a>
        ))}
      </div>
    </article>
  );
}

type FigureAttribution = {
  image_path?: string;
  original_path?: string;
  label: string;
  url: string;
  license: string;
  license_url: string;
  modifications?: string;
};
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
  figure_attributions?: FigureAttribution[];
  image_attributions?: FigureAttribution[];
  clinical_application?: string; video_query?: string;
  diagram?: { code: string; caption?: string } | null;
  comparison_table?: { title?: string; headers: string[]; rows: string[][] } | null;
  flags: string[];
  prite_category?: string; prite_label?: string; tags?: QTags;
  /** AnKing / AnkiHub Extra (+ First Aid) diagrams matched from Step decks. */
  anking_images?: string[];
  /** Sketchy / Sketchy 2 / Sketchy Extra panels matched from the same notes. */
  sketchy_images?: string[];
  /** Match metadata for the AnKing/Sketchy resource panels. */
  anking_match?: AnkingMatchMeta | null;
  /** Set only when this stem recurs (verbatim or near-verbatim) in another
      year's exam — see extraction/detect_repeats.mjs. count includes this
      occurrence; years lists every year the group appeared in. */
  repeat_count?: number; repeat_years?: string[];
  /** Present on extracted Kaufman 9e practice items. */
  kaufman?: {
    chapter_num?: number | string;
    chapter?: string;
    pdf_page?: number;
    book_number?: number;
    needs_figure?: boolean;
    teach_page?: number;
    teach_lo?: number;
    teach_hi?: number;
    teach_section?: string;
    teach_title?: string;
    stem_figures?: { id: string; page: number; file: string; caption?: string }[];
    expl_figures?: { id: string; page: number; file: string; caption?: string }[];
  };
  /** Present on Quizapine psychotherapy practice items. */
  quizapine?: {
    modality?: string;
    topic?: string;
    difficulty?: string;
    sources?: string[];
  };
  /** Present on Bienenfeld psychodynamic-theory items. */
  bienenfeld?: BienenfeldLoc;
  /** Present on Carlat 2026 medication vignette items. */
  carlat?: CarlatLoc;
  /** Quizapine vignette chain: keep these neighbors adjacent in practice. */
  therapy_seq?: TherapySeq;
  /** Optional sidecar story for Neuro/Therapy items (not the PRITE context table). */
  context?: string;
};

type GroupNote = { author: string; role: string; time: string; text: string };

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function imgSrc(p: string) {
  return p.startsWith("<") ? "" : "/" + p; // skip failed-export placeholders
}

function imageAttribution(q: RawQuestion, path: string, kind: "figure" | "explanation", index: number) {
  const exact = q.image_attributions?.find((credit) => credit.image_path === path);
  if (exact) return exact;
  // Backward compatibility for the first replacement-image audit, whose
  // credits were stored positionally before image_path/original_path existed.
  if (kind === "figure") return q.figure_attributions?.[index];
  return undefined;
}

function AuditedQuestionImage({
  q, path, kind, index, alt, style, onZoom, dark = false, showCredit = true,
}: {
  q: RawQuestion;
  path: string;
  kind: "figure" | "explanation";
  index: number;
  alt: string;
  style: React.CSSProperties;
  onZoom: (src: string) => void;
  dark?: boolean;
  showCredit?: boolean;
}) {
  const credit = imageAttribution(q, path, kind, index);
  const [showOriginal, setShowOriginal] = useState(false);
  const visiblePath = showOriginal && credit?.original_path ? credit.original_path : path;
  const visibleSrc = imgSrc(visiblePath);
  const muted = dark ? "#aeb4c0" : T.muted;
  const accent = dark ? "#8fd9b6" : T.teal;

  return (
    <div style={{ display: "inline-flex", maxWidth: "100%", flexDirection: "column", alignItems: "center" }}>
      <img
        src={visibleSrc}
        alt={alt}
        style={style}
        loading="lazy"
        onClick={() => onZoom(visibleSrc)}
        title="Click to enlarge"
      />
      {credit && (credit.original_path || showCredit) && (
        <div style={{ margin: "6px 0 10px", maxWidth: 760, textAlign: "center", color: muted, fontSize: 11, lineHeight: 1.45 }}>
          {credit.original_path && (
            <button
              type="button"
              onClick={() => setShowOriginal((value) => !value)}
              style={{ margin: "0 7px 3px 0", padding: 0, border: 0, background: "transparent", color: accent, cursor: "pointer", font: "inherit", textDecoration: "underline" }}
            >
              {showOriginal ? "View clearer replacement" : "View original PRITE image"}
            </button>
          )}
          {showOriginal ? (
            <span>Original image from the PRITE source deck.</span>
          ) : showCredit ? (
            <span>
              Clearer replacement: <a href={credit.url} target="_blank" rel="noreferrer" style={{ color: accent }}>{credit.label}</a>{" "}
              (<a href={credit.license_url} target="_blank" rel="noreferrer" style={{ color: accent }}>{credit.license}</a>
              {credit.modifications ? `; ${credit.modifications}` : ""})
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* Pair adjacent learning cards that belong together on one row. Both stay
   independently expandable; the pair collapses to a single column on narrow
   screens (see .learningPair). Keyed off the cards' own keys so the section
   list stays the single source of order. */
function pairNoteCards(cards: React.ReactElement[]): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < cards.length; i++) {
    const a = cards[i].key;
    const b = cards[i + 1]?.key;
    if ((a === "mine" && b === "group") || (a === "context" && b === "video")) {
      out.push(
        <div key={`${String(a)}-${String(b)}-pair`} className="learningPair">
          {cards[i]}
          {cards[i + 1]}
        </div>
      );
      i++;
    } else {
      out.push(cards[i]);
    }
  }
  return out;
}

/* Persist the active Today queue so "Another set" / mid-set progress survives
   refresh and re-login. Device-local (same model as timer prefs before sync). */
type TodayQueueSnap = {
  day: string;
  extra: boolean;
  bonusRound: number;
  reviewMode: boolean;
  qi?: number;
  ids: { year: string; q_index: number }[];
};
type CustomQueueSnap = {
  label: string;
  qi: number;
  ids: { year: string; q_index: number }[];
};
function customQueueKey(uid: string) {
  return `pd_custom_queue_${uid}`;
}
function readCustomQueueSnap(uid: string): CustomQueueSnap | null {
  try {
    const raw = localStorage.getItem(customQueueKey(uid));
    if (!raw) return null;
    const v = JSON.parse(raw) as CustomQueueSnap;
    if (!v || !Array.isArray(v.ids) || v.ids.length === 0) return null;
    return v;
  } catch {
    return null;
  }
}
function writeCustomQueueSnap(uid: string, snap: CustomQueueSnap | null) {
  try {
    if (!snap) localStorage.removeItem(customQueueKey(uid));
    else localStorage.setItem(customQueueKey(uid), JSON.stringify(snap));
  } catch { /* private mode */ }
}
function todayQueueKey(uid: string, bank: string) {
  return bank === "prite" ? `pd_today_queue_${uid}` : `pd_today_queue_${uid}_${bank}`;
}
function readTodayQueueSnap(uid: string, bank: string): TodayQueueSnap | null {
  try {
    const raw = localStorage.getItem(todayQueueKey(uid, bank));
    if (!raw) return null;
    const v = JSON.parse(raw) as TodayQueueSnap;
    if (!v || v.day !== ymd() || !Array.isArray(v.ids)) return null;
    return v;
  } catch {
    return null;
  }
}
function writeTodayQueueSnap(uid: string, bank: string, snap: TodayQueueSnap) {
  try {
    localStorage.setItem(todayQueueKey(uid, bank), JSON.stringify(snap));
  } catch { /* private mode */ }
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
type AiTarget = { key: string; label: string; url: (p: string) => string; copiesPrompt?: boolean };
const AI_TARGETS: AiTarget[] = [
  { key: "google", label: "Google AI", url: (p) => `https://www.google.com/search?udm=50&q=${encodeURIComponent(p)}` },
  // OpenEvidence does not support pre-filling its composer from a public URL.
  // Copy the prompt before opening it so the complete question is still one
  // paste away instead of being silently discarded by its /ask redirect.
  { key: "openevidence", label: "OpenEvidence", url: () => "https://www.openevidence.com/", copiesPrompt: true },
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
// Clipboard API first, with a fallback for browsers that expose the API but
// deny it. Keeping this global lets the main quiz and live-poll Ask AI menus
// give OpenEvidence the same complete prompt.
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the selection-based copy */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(ta);
    return copied;
  } catch {
    return false;
  }
}
// Start the clipboard write before opening the tab so the click still carries
// browser user-activation. Other providers continue to receive the prompt in
// their URL and resolve false because no copy was needed.
function launchAiTarget(target: AiTarget, prompt: string, open: (url: string) => void = (url) => {
  window.open(url, "_blank", "noopener,noreferrer");
}): Promise<boolean> {
  const copied = target.copiesPrompt ? copyToClipboard(prompt) : Promise.resolve(false);
  open(target.url(prompt));
  return copied;
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

// A stable key that groups a question with its cross-year repeats. The bank
// stores the SAME PRITE item that recurred in multiple years as separate
// records (see repeat_count/repeat_years), and the recurrences share a
// near-identical stem — so a normalized stem collapses them into one group.
// Used to keep a generated test from including a question twice (once as its
// 2019 copy, again as its 2023 copy) or reusing one already in a saved test.
function questionGroupKey(q: { stem: string }): string {
  return (q.stem ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 160);
}

/** Keep at most one cross-year copy of the same PRITE item in a queue. The
 * bank intentionally retains every exam-year occurrence for provenance, but a
 * study set should treat those occurrences as one concept rather than five
 * separate "unseen" questions. Input order decides which representative wins,
 * so callers sort first according to the resident's ordering preferences. */
function uniqueQuestionGroups(qs: RawQuestion[], alreadyUsed: Set<string> = new Set()): RawQuestion[] {
  const seen = new Set(alreadyUsed);
  return qs.filter((q) => {
    const key = questionGroupKey(q);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Small deterministic hash used to mix equally high-yield groups. A caller
 * supplies a per-build seed, so the queue is varied without using a random
 * comparator (which would violate Array.sort's ordering contract). */
function mixedOrderScore(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Daily sets lead with the most recently tested exams (2022 → 2025), since those
// best reflect what's likely on the upcoming PRITE. Older years follow,
// most-recent-first. Lower rank = served sooner.
const PRIORITY_YEARS = ["2022", "2023", "2024", "2025"];
function yearRank(year: string): number {
  const i = PRIORITY_YEARS.indexOf(year);
  return i !== -1 ? i : 4 + (2025 - (Number(year) || 0));
}

/* ---- What comes first: the daily-set mix ---------------------------------
   Today's set is a quota mix, not a hard wall. Rank 1 gets the largest slice,
   then smaller slices for ranks 2–4. Change DAILY_QUOTA_SHARES to retune
   every bank (PRITE, Neuro, Therapy) at once. Shares are parts-per-set and
   scale to whatever the daily goal is (5, 10, 20…).

   Within each slice, the old lexicographic comparator still breaks ties. */
type OrderRuleId = "missed" | "weak" | "highyield" | "unseen" | "year";

const ORDER_RULES: { id: OrderRuleId; label: string; hint: string }[] = [
  { id: "missed",    label: "Questions I got wrong",  hint: "Ones you've missed before come back around first" },
  { id: "weak",      label: "My weakest sections",    hint: "Sections you score below your own average in" },
  { id: "highyield", label: "High-yield repeats",     hint: "Questions the PRITE has asked in more than one year" },
  { id: "unseen",    label: "Questions I've never seen", hint: "Fresh material ahead of anything you've attempted" },
  { id: "year",      label: "Exam year",              hint: "Newest exams first, unless you pin years below" },
];

const THERAPY_ORDER_RULES: { id: OrderRuleId; label: string; hint: string }[] = [
  { id: "unseen", label: "Questions I've never seen", hint: "Fresh material ahead of anything you've attempted" },
  { id: "missed", label: "Questions I got wrong", hint: "Ones you've missed before come back around first" },
  { id: "weak", label: "My weakest modalities", hint: "Modalities you score below your own average in" },
];

const NEURO_ORDER_RULES: { id: OrderRuleId; label: string; hint: string }[] = [
  { id: "unseen", label: "Questions I've never seen", hint: "Fresh material ahead of anything you've attempted" },
  { id: "missed", label: "Questions I got wrong", hint: "Ones you've missed before come back around first" },
  { id: "weak", label: "My weakest chapters", hint: "Chapters you score below your own average in" },
];

const MEDS_ORDER_RULES: { id: OrderRuleId; label: string; hint: string }[] = [
  { id: "unseen", label: "Questions I've never seen", hint: "Fresh material ahead of anything you've attempted" },
  { id: "missed", label: "Questions I got wrong", hint: "Ones you've missed before come back around first" },
  { id: "weak", label: "My weakest medication classes", hint: "Classes you score below your own average in" },
];

/** Exam-year / PRITE-repeat ranking only belongs on the main PRITE bank. */
const PRACTICE_HIDDEN_ORDER = new Set<OrderRuleId>(["year", "highyield"]);
const PRACTICE_DEFAULT_VISIBLE: OrderRuleId[] = ["unseen", "missed", "weak"];

function isPracticeBank(kind: "prite" | "neuro" | "therapy" | "meds" | undefined): kind is "neuro" | "therapy" | "meds" {
  return kind === "neuro" || kind === "therapy" || kind === "meds";
}

function isStockDailyOrder(order: OrderRuleId[]): boolean {
  return order.join() === DEFAULT_DAILY_ORDER.join();
}

function visibleOrderRules(kind: "prite" | "neuro" | "therapy" | "meds", order: OrderRuleId[]): OrderRuleId[] {
  if (!isPracticeBank(kind)) return order;
  if (isStockDailyOrder(order)) return [...PRACTICE_DEFAULT_VISIBLE];
  return order.filter((id) => !PRACTICE_HIDDEN_ORDER.has(id));
}

function replaceVisibleOrder(full: OrderRuleId[], nextVisible: OrderRuleId[], kind: "prite" | "neuro" | "therapy" | "meds"): OrderRuleId[] {
  if (!isPracticeBank(kind)) return nextVisible;
  let i = 0;
  return full.map((id) => (PRACTICE_HIDDEN_ORDER.has(id) ? id : nextVisible[i++]));
}

function practiceSortOrder(kind: "prite" | "neuro" | "therapy" | "meds" | undefined, order: OrderRuleId[]): OrderRuleId[] {
  if (!isPracticeBank(kind)) return order;
  if (isStockDailyOrder(order)) return replaceVisibleOrder(order, PRACTICE_DEFAULT_VISIBLE, kind);
  return order;
}

/** Default parts of each daily set for ranks 1–4 (e.g. 40 / 5 / 3 / 2 of 50).
 *  Residents can retune this in What comes first; those edits scale to
 *  whatever the daily goal is. */
const DAILY_QUOTA_SHARES = [40, 5, 3, 2] as const;
const LEGACY_QUOTA_SHARES = [6, 3, 1];
const HIGHYIELD_MIN_REPEATS = 2;

function normalizeQuotaShares(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...DAILY_QUOTA_SHARES];
  const nums = raw.slice(0, DAILY_QUOTA_SHARES.length).map((n) => Math.max(0, Math.round(Number(n)) || 0));
  if (nums.join() === LEGACY_QUOTA_SHARES.join()) return [...DAILY_QUOTA_SHARES];
  while (nums.length < DAILY_QUOTA_SHARES.length) nums.push(0);
  return nums.every((n) => n === 0) ? [...DAILY_QUOTA_SHARES] : nums;
}

function allocateQuota(total: number, shares: readonly number[] = DAILY_QUOTA_SHARES): number[] {
  if (total <= 0) return shares.map(() => 0);
  const used = shares.slice(0, Math.min(shares.length, total));
  const sum = used.reduce((a, b) => a + b, 0) || 1;
  const raw = used.map((s) => (s / sum) * total);
  const floors = raw.map(Math.floor);
  let left = total - floors.reduce((a, b) => a + b, 0);
  const byFrac = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = floors.slice();
  for (let k = 0; k < left; k++) out[byFrac[k % byFrac.length].i] += 1;
  return out;
}

/** Move one question from another slice onto `index` (or the reverse). */
function nudgeQuotaShares(shares: readonly number[], index: number, delta: number, total: number): number[] {
  const next = allocateQuota(total, shares);
  if (delta === 0 || index < 0 || index >= next.length) return next;
  const step = delta > 0 ? 1 : -1;
  const steps = Math.abs(delta);
  for (let n = 0; n < steps; n++) {
    if (step > 0 && next[index] >= total) break;
    if (step < 0 && next[index] <= 0) break;
    const donors = next
      .map((count, i) => i)
      .filter((i) => i !== index)
      .reverse();
    const donor = step > 0
      ? donors.find((i) => next[i] > 0)
      : donors[0];
    if (donor == null) break;
    next[index] += step;
    next[donor] -= step;
  }
  return next;
}

function preferredYearSet(yearFocus: string[], candidates: RawQuestion[]): Set<string> {
  if (yearFocus.length) return new Set(yearFocus);
  let best: string | null = null;
  let bestRank = Infinity;
  for (const q of candidates) {
    const r = yearRank(q.year);
    if (r < bestRank) {
      bestRank = r;
      best = q.year;
    }
  }
  return best ? new Set([best]) : new Set();
}

function matchesQuotaRule(
  q: RawQuestion,
  rule: OrderRuleId,
  ctx: {
    answers: Record<string, AnswerRow>;
    missedIds: Set<string>;
    weakCats: Set<string>;
    preferredYears: Set<string>;
  },
): boolean {
  switch (rule) {
    case "unseen": return !ctx.answers[questionId(q.year, q.q_index)];
    case "missed": return ctx.missedIds.has(questionId(q.year, q.q_index));
    case "weak": return ctx.weakCats.has(q.prite_category ?? "");
    case "highyield": return (q.repeat_count ?? 1) >= HIGHYIELD_MIN_REPEATS;
    case "year": return ctx.preferredYears.has(q.year);
  }
}

/** Pull a mixed daily set from due + fresh candidates using the ranked quotas. */
function pickDailyQuotaSet(opts: {
  candidates: RawQuestion[];
  total: number;
  rules: OrderRuleId[];
  cmp: (a: RawQuestion, b: RawQuestion) => number;
  answers: Record<string, AnswerRow>;
  missedIds: Set<string>;
  weakCats: Set<string>;
  yearFocus: string[];
  shares?: readonly number[];
}): RawQuestion[] {
  const { candidates, total, rules, cmp, answers, missedIds, weakCats, yearFocus, shares } = opts;
  if (total <= 0 || !candidates.length) return [];
  const sorted = candidates.slice().sort(cmp);
  const preferredYears = preferredYearSet(yearFocus, sorted);
  const ctx = { answers, missedIds, weakCats, preferredYears };
  const quotas = allocateQuota(total, shares ?? DAILY_QUOTA_SHARES);
  const used = new Set<string>();
  const take = (n: number, pred: (q: RawQuestion) => boolean) => {
    const out: RawQuestion[] = [];
    for (const q of sorted) {
      if (out.length >= n) break;
      const id = questionId(q.year, q.q_index);
      if (used.has(id) || !pred(q)) continue;
      used.add(id);
      out.push(q);
    }
    return out;
  };
  const picked: RawQuestion[] = [];
  rules.slice(0, quotas.length).forEach((rule, i) => {
    picked.push(...take(quotas[i], (q) => matchesQuotaRule(q, rule, ctx)));
  });
  if (picked.length < total) picked.push(...take(total - picked.length, () => true));
  return picked;
}

// Newest exams first unless the resident has rearranged "What comes first".
const DEFAULT_ORDER: OrderRuleId[] = [...DEFAULT_DAILY_ORDER];

function normalizeOrder(raw: unknown): OrderRuleId[] {
  if (isUnspecifiedDailyOrder(raw)) return [...DEFAULT_ORDER];
  const ids = ORDER_RULES.map((r) => r.id);
  const seen = Array.isArray(raw)
    ? raw.filter((v): v is OrderRuleId => typeof v === "string" && (ids as string[]).includes(v))
    : [];
  const deduped = [...new Set(seen)];
  // Anything the stored list is missing (a rule added in a later release)
  // falls in at its default position rather than silently disappearing.
  return [...deduped, ...DEFAULT_ORDER.filter((id) => !deduped.includes(id))];
}

/** Categories this resident is weakest in, worst first. Accuracy only means
    something once there's history, so a category needs MIN_TRIED attempts to
    rank at all — otherwise one unlucky question brands a whole section a weak
    spot. Kept to those below the resident's own overall accuracy, capped at 5
    so "weakest" stays focused instead of becoming most of the bank. */
function weakCategories(all: RawQuestion[], answers: Record<string, AnswerRow>) {
  const MIN_TRIED = 4;
  const tally = new Map<string, { tried: number; right: number }>();
  for (const q of all) {
    const row = answers[questionId(q.year, q.q_index)];
    if (!row || !q.prite_category) continue;
    const t = tally.get(q.prite_category) ?? { tried: 0, right: 0 };
    t.tried += 1;
    if (row.correct) t.right += 1;
    tally.set(q.prite_category, t);
  }
  const totalTried = [...tally.values()].reduce((n, t) => n + t.tried, 0);
  const totalRight = [...tally.values()].reduce((n, t) => n + t.right, 0);
  if (!totalTried) return [] as { cat: string; acc: number; tried: number }[];
  const overall = totalRight / totalTried;
  return [...tally.entries()]
    .filter(([, t]) => t.tried >= MIN_TRIED)
    .map(([c, t]) => ({ cat: c, acc: t.right / t.tried, tried: t.tried }))
    .filter((r) => r.acc < overall)
    .sort((a, b) => a.acc - b.acc)
    .slice(0, 5);
}

/** Build the comparator for a given arrangement. `missedIds` is the set the
    caller already identified as due-for-another-attempt, so "wrong" means the
    same thing here as it does everywhere else in the app. */
function orderComparator(opts: {
  order: OrderRuleId[];
  yearFocus: string[];
  weakCats: Set<string>;
  missedIds: Set<string>;
  answers: Record<string, AnswerRow>;
  highYieldMixSeed?: string;
  recentlyAnsweredGroups?: Set<string>;
  kind?: "prite" | "neuro" | "therapy" | "meds";
}) {
  const {
    order, yearFocus, weakCats, missedIds, answers,
    highYieldMixSeed = ymd(), recentlyAnsweredGroups = new Set<string>(),
    kind = "prite",
  } = opts;
  const score = (q: RawQuestion, rule: OrderRuleId): number => {
    if (isPracticeBank(kind) && PRACTICE_HIDDEN_ORDER.has(rule)) return 0;
    switch (rule) {
      case "missed": return missedIds.has(questionId(q.year, q.q_index)) ? 0 : 1;
      case "weak": return weakCats.has(q.prite_category ?? "") ? 0 : 1;
      case "highyield": {
        // Keep repeat-count tiers strict, but mix concepts within each tier.
        // A concept seen this week goes behind equally repeated concepts so a
        // bonus set does not immediately open with another year's clone.
        const group = questionGroupKey(q);
        const repeatTier = -(q.repeat_count ?? 1) * 10_000_000;
        const recentPenalty = recentlyAnsweredGroups.has(group) ? 2_000_000 : 0;
        const mixed = mixedOrderScore(`${highYieldMixSeed}:${group}`) % 1_000_000;
        return repeatTier + recentPenalty + mixed;
      }
      case "unseen": return answers[questionId(q.year, q.q_index)] ? 1 : 0;
      case "year": {
        const pinned = yearFocus.indexOf(q.year);
        return pinned !== -1 ? pinned : yearFocus.length + yearRank(q.year);
      }
    }
  };
  return (a: RawQuestion, b: RawQuestion) => {
    for (const rule of order) {
      const d = score(a, rule) - score(b, rule);
      if (d) return d;
    }
    return 0;
  };
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

/** Parse Anki cloze tokens: {{c1::answer}} or {{c1::answer::hint}} */
function parseClozeToken(raw: string): { id: string; answer: string; hint?: string } | null {
  const m = raw.match(/^\{\{(c\d+)::([^}]*)\}\}$/);
  if (!m) return null;
  const parts = m[2].split("::");
  return { id: m[1], answer: parts[0] ?? "", hint: parts[1] };
}

function renderClozeRaw(text: string) {
  return text.split(/(\{\{c\d+::[^}]*\}\})/g).map((p, i) => {
    const m = parseClozeToken(p);
    if (!m) return <span key={i}>{p}</span>;
    return (
      <span key={i}>
        <span style={{ color: T.faint }}>{`{{${m.id}::`}</span>
        <span style={{ color: T.teal, fontWeight: 700 }}>{m.answer}</span>
        {m.hint != null && m.hint !== "" && (
          <span style={{ color: T.faint }}>{`::${m.hint}`}</span>
        )}
        <span style={{ color: T.faint }}>{`}}`}</span>
      </span>
    );
  });
}
function renderClozePreview(text: string) {
  return text.split(/(\{\{c\d+::[^}]*\}\})/g).map((p, i) => {
    const m = parseClozeToken(p);
    if (!m) return <span key={i}>{p}</span>;
    return <span key={i} style={s.blank}>[ {m.hint || "…"} ]</span>;
  });
}
/** The fully "solved" sentence — cloze markup resolved to plain text, with
    the previously-blanked words called out. Used once a card is revealed. */
function renderClozeResolved(text: string) {
  return text.split(/(\{\{c\d+::[^}]*\}\})/g).map((p, i) => {
    const m = parseClozeToken(p);
    if (!m) return <span key={i}>{p}</span>;
    return <b key={i} style={{ color: T.teal }}>{m.answer}</b>;
  });
}

/**
 * Anki-style practice view: blanks start hidden; click a blank to unveil that
 * deletion, or "Show answer" to unveil all. Clicking the card body also reveals.
 */
function AnkiClozePractice({
  clozeText,
  extra,
  revealed,
  openIds,
  onRevealAll,
  onToggleBlank,
  onReset,
}: {
  clozeText: string;
  extra?: string;
  revealed: boolean;
  openIds: Set<string>;
  onRevealAll: () => void;
  onToggleBlank: (id: string) => void;
  onReset: () => void;
}) {
  const parts = clozeText.split(/(\{\{c\d+::[^}]*\}\})/g);
  const allOpen = revealed || parts.every((p) => {
    const m = parseClozeToken(p);
    return !m || openIds.has(m.id);
  });

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => (allOpen ? onReset() : onRevealAll())}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (allOpen) onReset();
            else onRevealAll();
          }
        }}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          border: `1.5px solid ${allOpen ? T.teal + "66" : T.paperEdge}`,
          borderRadius: 14,
          padding: "18px 18px 16px",
          background: allOpen ? T.tealSoft : T.paper,
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
          transition: "border-color 160ms ease, background 160ms ease",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase", color: T.muted, marginBottom: 10 }}>
          {allOpen ? "Answer" : "Question"} · click blank or card
        </div>
        <p style={{ margin: 0, fontSize: 16.5, lineHeight: 1.65, color: T.text }}>
          {parts.map((p, i) => {
            const m = parseClozeToken(p);
            if (!m) return <span key={i}>{p}</span>;
            const isOpen = revealed || openIds.has(m.id);
            if (isOpen) {
              return (
                <span
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleBlank(m.id);
                  }}
                  style={{
                    display: "inline",
                    color: T.tealDeep,
                    fontWeight: 750,
                    background: "rgba(15, 118, 110, 0.12)",
                    borderRadius: 5,
                    padding: "1px 7px",
                    margin: "0 1px",
                    boxDecorationBreak: "clone",
                    WebkitBoxDecorationBreak: "clone",
                  }}
                  title="Click to hide again"
                >
                  {m.answer}
                </span>
              );
            }
            return (
              <span
                key={i}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleBlank(m.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleBlank(m.id);
                  }
                }}
                style={{
                  display: "inline-block",
                  minWidth: 48,
                  background: "linear-gradient(180deg, #f7f1e3 0%, #efe4cf 100%)",
                  color: "#8a6414",
                  borderRadius: 6,
                  padding: "2px 12px",
                  margin: "0 3px",
                  fontSize: 13.5,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  border: "1px dashed rgba(138, 100, 20, 0.35)",
                  verticalAlign: "baseline",
                  cursor: "pointer",
                  boxShadow: "inset 0 -1px 0 rgba(138,100,20,0.08)",
                }}
                title="Click to reveal"
              >
                {m.hint ? m.hint : "····"}
              </span>
            );
          })}
        </p>
        {!allOpen && (
          <div style={{ marginTop: 14, fontSize: 12.5, color: T.muted }}>
            Tip: click a blank to unveil just that deletion, or use Show answer for the whole card.
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, alignItems: "center" }}>
        {!allOpen ? (
          <button type="button" style={s.primarySm} onClick={onRevealAll}>
            <Eye size={14} strokeWidth={2.2} /> Show answer
          </button>
        ) : (
          <button type="button" style={s.ghost} onClick={onReset}>
            <EyeOff size={14} strokeWidth={2.2} /> Hide answer
          </button>
        )}
      </div>

      {allOpen && extra && (
        <div style={{ marginTop: 14 }}>
          <div style={s.fieldLbl}>Extra · under the answer</div>
          <div style={s.extra}>
            <p style={{ ...s.extraLine, marginBottom: 0 }}>{extra}</p>
          </div>
        </div>
      )}
    </div>
  );
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
const LEARNING_SECTION_IDS = new Set([
  "explanation", "textbook", "dsm", "kaufman", "bienenfeld", "carlat", "anking", "sketchy", "practice", "mnemonic", "context",
  "diagram", "video", "mine", "group", "flash", "research",
]);
function readLearningOpenPref(): Set<string> {
  return new Set(readPref<string[]>("pd_learning_open_sections", ["explanation"])
    .filter((id) => LEARNING_SECTION_IDS.has(id)));
}

function initialPsychMode(): "general" | "child" | "neuro" | "therapy" | "meds" {
  try {
    const bank = new URLSearchParams(location.search).get("bank");
    if (bank === "meds" || bank === "therapy" || bank === "neuro" || bank === "general") return bank;
  } catch { /* ignore */ }
  const ret = bienenfeldReturnFromSearch();
  if (ret?.bank === "therapy" || ret?.bank === "neuro" || ret?.bank === "general") return ret.bank;
  return "general";
}

function initialTherapyJump(): { qid: string; view: BienenfeldReturn["view"] } | null {
  const ret = bienenfeldReturnFromSearch();
  if (ret?.bank && ret.bank !== "therapy") return null;
  if (ret?.qid) return { qid: ret.qid, view: ret.view };
  if (ret?.bank === "therapy") {
    const saved = readTherapyReturn();
    if (saved?.qid) return { qid: saved.qid, view: saved.view };
  }
  return null;
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
  const [priteAll, setPriteAll] = useState<RawQuestion[] | null>(null);
  const [kaufmanAll, setKaufmanAll] = useState<RawQuestion[] | null>(null);
  const [kaufmanBankErr, setKaufmanBankErr] = useState<string | null>(null);
  const [therapyAll, setTherapyAll] = useState<RawQuestion[] | null>(null);
  const [therapyBankErr, setTherapyBankErr] = useState<string | null>(null);
  const [carlatAll, setCarlatAll] = useState<RawQuestion[] | null>(null);
  const [carlatBankErr, setCarlatBankErr] = useState<string | null>(null);
  const [psychMode, setPsychMode] = useState<"general" | "child" | "neuro" | "therapy" | "meds">(initialPsychMode);
  const all = psychMode === "neuro" ? kaufmanAll : psychMode === "therapy" ? therapyAll : psychMode === "meds" ? carlatAll : priteAll;
  const [loadErr, setLoadErr] = useState<string | null>(null);
  // question id -> supporting Kaplan & Sadock passage(s); empty until loaded
  const [kaplanRefs, setKaplanRefs] = useState<Record<string, KaplanRef>>({});
  // Why citations didn't load, if they didn't. Surfaced in the study-set filter:
  // this used to fail silently, which made a broken fetch indistinguishable from
  // "this question just has no citation".
  const [kaplanErr, setKaplanErr] = useState<string | null>(null);
  // question id -> MEDLINE further-reading articles (public PubMed/PMC links)
  const [researchRefs, setResearchRefs] = useState<Record<string, ResearchRef>>({});
  const [researchErr, setResearchErr] = useState<string | null>(null);
  // question id -> DSM-5-TR section link (static offline match)
  const [dsmRefs, setDsmRefs] = useState<Record<string, DsmRef>>({});
  const [dsmErr, setDsmErr] = useState<string | null>(null);
  const [kaufmanRefs, setKaufmanRefs] = useState<Record<string, KaufmanRef>>({});
  const [kaufmanErr, setKaufmanErr] = useState<string | null>(null);
  const [owlStats, setOwlStats] = useState<Record<string, OwlStat>>({});
  const [dynPearls, setDynPearls] = useState<Record<string, DynPearl>>({});

  const [year, setYear] = useState<string>("all");
  const [modalityFilter, setModalityFilter] = useState<string>("all");
  const [qi, setQi] = useState(0);
  const therapyJumpRef = useRef(initialTherapyJump());

  const [picked, setPicked] = useState<string[]>([]);
  const [crossed, setCrossed] = useState<string[]>([]); // options crossed out (right-click), per question
  const [revealed, setRevealed] = useState(false);
  const [preferredOpenSections, setPreferredOpenSections] = useState<Set<string>>(readLearningOpenPref);
  const preferredOpenSectionsRef = useRef(preferredOpenSections);
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set(preferredOpenSections));
  // Last learning card visited with H. Track the id (rather than a numeric
  // index) because optional cards such as Textbook can appear asynchronously.
  const helpSectionCursorRef = useRef<{ qid: string | null; lastId: string | null }>({ qid: null, lastId: null });
  useEffect(() => { preferredOpenSectionsRef.current = preferredOpenSections; }, [preferredOpenSections]);
  // "Ask AI" panel: open/closed, chosen explanation style, and free-text question
  const [askOpen, setAskOpen] = useState(false);
  const [askStyle, setAskStyle] = useState<AiStyle>("explain");
  const [askText, setAskText] = useState("");
  // Animated backdrop on/off. Deliberately localStorage rather than the
  // account-scoped settings table: this is a per-device call (the shader is
  // real GPU work, and the laptop you read on at 2am isn't the workstation),
  // and reading it synchronously here means no flash of plasma before a
  // fetched preference could turn it off.
  const [plasmaBg, setPlasmaBg] = useState<boolean>(() => {
    try { return localStorage.getItem(BG_PREF_KEY) !== "plain"; } catch { return true; }
  });
  const togglePlasmaBg = () => setPlasmaBg((on) => {
    const next = !on;
    try { localStorage.setItem(BG_PREF_KEY, next ? "plasma" : "plain"); } catch { /* private mode — session-only is fine */ }
    return next;
  });
  // Brief "launch" state for the inline Next button — the arrow flies off before
  // we actually advance, so the click gets a beat of feedback instead of the
  // question swapping out from under the cursor.
  const [nextLaunching, setNextLaunching] = useState(false);
  // Drag-to-peel: true while a finger/cursor is driving the fold by hand.
  const [peeling, setPeeling] = useState(false);
  const peelRef = useRef<{ id: number; startX: number; w: number; p: number; anims: Animation[] } | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const [myNote, setMyNote] = useState("");
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [jump, setJump] = useState("");

  const confettiRef = useRef<HTMLCanvasElement | null>(null);

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
  const [owlOn, setOwlOn] = useState<boolean>(() => readPref<boolean>("pd_stat_on", false));
  const [foxOn, setFoxOn] = useState<boolean>(() => readPref<boolean>("pd_dyn_on", false));
  const toggleOwl = () => setOwlOn((on) => {
    const next = !on;
    writePref("pd_stat_on", next);
    schedulePrefsPush();
    return next;
  });
  const toggleFox = () => setFoxOn((on) => {
    const next = !on;
    writePref("pd_dyn_on", next);
    schedulePrefsPush();
    return next;
  });
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
  const [showTeamEditor, setShowTeamEditor] = useState<"stable" | "weekly" | null>(null); // admin hand-editing of a saved roster
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
    // Same display name with two emails would otherwise land on two teams.
    // Keep one account per name; the leftover still appears in the editor so
    // an admin can drop the extra without touching access.
    const unique = pickOneProfilePerPerson(all.filter((p) =>
      p.status === "approved" && !p.is_education_chief && p.role !== "alumni" && p.role !== "test"));
    const entries = unique
      .map((p) => ({ voter: p.id, level: stableTeamLevel(p.training_level) }))
      .filter((e): e is { voter: string; level: string } => e.level !== null);
    if (!entries.length) return all.length ? "No approved residents with a PGY year set" : "Couldn't load the resident list";
    const err = await regenerateWeeklyTeams(assignBalancedTeams(entries));
    if (!err) {
      await refreshWeeklyTeams();
      setRosterEpoch((n) => n + 1);
    }
    return err;
  };

  // Build the plain-text team list for the didactics email:
  //   Team 1: Alice Smith (R1), Bob Jones (R2), …
  const teamListText = async (teams: Record<string, string>, header: string): Promise<string | null> => {
    if (!Object.keys(teams).length) return null;
    const all = await listProfiles();
    const byId = new Map(all.map((p) => [p.id, p]));
    const nameCounts = new Map<string, number>();
    for (const pid of Object.keys(teams)) {
      const key = byId.get(pid)?.full_name?.trim().toLocaleLowerCase();
      if (key) nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
    }
    const grouped = new Map<string, { name: string; level: string | null }[]>();
    for (const [pid, teamName] of Object.entries(teams)) {
      const p = byId.get(pid);
      const key = p?.full_name?.trim().toLocaleLowerCase();
      const name = p?.full_name && key && (nameCounts.get(key) ?? 0) > 1
        ? `${p.full_name} (${p.email})`
        : (p?.full_name || p?.email || "Unknown");
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
  const [editingTest, setEditingTest] = useState<SavedTest | null>(null); // saved test open in the add/remove/reorder editor
  const [sharingTest, setSharingTest] = useState<SavedTest | null>(null);
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
  const selectChildPsych = () => { setPsychMode("child"); setShowCapite(true); };
  const selectNeuro = () => { setShowCapite(false); setPsychMode("neuro"); setYear("all"); setModalityFilter("all"); setQi(0); };
  const selectTherapy = () => { setShowCapite(false); setPsychMode("therapy"); setYear("all"); setModalityFilter("all"); setQi(0); };
  const selectMeds = () => { setShowCapite(false); setPsychMode("meds"); setYear("all"); setModalityFilter("all"); setQi(0); };
  const closeCapite = () => { setShowCapite(false); setPsychMode("general"); }; // bounces back — nothing to switch to yet
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState<"today" | "browse" | "custom">("today");
  // What comes first in the daily set. Local-first like the other UI prefs, so
  // it works signed-out; mirrored to the account by prefsSync.
  const [showOrder, setShowOrder] = useState(false);
  const [dailyOrder, setDailyOrder] = useState<OrderRuleId[]>(() => {
    try { return normalizeOrder(JSON.parse(localStorage.getItem("pd_daily_order") || "null")); }
    catch { return DEFAULT_ORDER; }
  });
  const [yearFocus, setYearFocus] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("pd_year_focus") || "[]");
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch { return []; }
  });
  const [quotaShares, setQuotaShares] = useState<number[]>(() => {
    try { return normalizeQuotaShares(JSON.parse(localStorage.getItem("pd_daily_quota") || "null")); }
    catch { return [...DAILY_QUOTA_SHARES]; }
  });
  const [todayQueue, setTodayQueue] = useState<RawQuestion[]>([]);
  // Incremented for every newly built queue. This gives equally high-yield
  // concepts a fresh, stable mix while keeping each individual sort valid.
  const highYieldMixRef = useRef(0);
  /** 0 = primary daily set; 1+ = explicit "Another set" bonus rounds after the goal. */
  const [bonusRound, setBonusRound] = useState(0);
  const [customQueue, setCustomQueue] = useState<RawQuestion[]>([]);
  const [customLabel, setCustomLabel] = useState<string>("");
  const [answersLoaded, setAnswersLoaded] = useState(false);
  const [prefsSynced, setPrefsSynced] = useState(false); // account-synced localStorage prefs merged (see lib/prefsSync)
  const [zoomImg, setZoomImg] = useState<string | null>(null); // figure/explanation image enlarged in a lightbox
  const [zoomGallery, setZoomGallery] = useState<string[]>([]);
  const openZoom = useCallback((src: string, gallery?: string[]) => {
    setZoomImg(src);
    setZoomGallery(gallery && gallery.length > 1 ? gallery : []);
  }, []);
  const [reviewMode, setReviewMode] = useState(false);
  const [showMissed, setShowMissed] = useState(false);
  const [allMyNotes, setAllMyNotes] = useState<Record<string, string>>({});
  const [showInsights, setShowInsights] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showDeck, setShowDeck] = useState(false);
  const [showAudioDrills, setShowAudioDrills] = useState(false);
  const [card, setCard] = useState<Flashcard | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [editCard, setEditCard] = useState<{ cloze: string; extra: string } | null>(null);
  /** Anki-style practice on the question Flashcard tab: all blanks revealed? */
  const [clozeRevealed, setClozeRevealed] = useState(false);
  /** Individually unveiled cloze ids (c1, c2, …). */
  const [clozeOpenIds, setClozeOpenIds] = useState<Set<string>>(() => new Set());
  const [showClozeSource, setShowClozeSource] = useState(false);
  const [highlights, setHighlights] = useState<HlRange[]>([]);
  const [context, setContext] = useState<string | null>(null); // null = not yet loaded
  const [showReport, setShowReport] = useState(false);     // per-question "report a problem"
  const [showSiteReport, setShowSiteReport] = useState(false); // general "report a site problem" (footer)
  const [showBugs, setShowBugs] = useState(false);        // admin bug-report triage
  const [bugs, setBugs] = useState<BugReport[]>([]);

  // --- reply notifications: nudge a reporter when an admin has answered one of
  //     their bug reports since they last opened "My reports". "Seen" is tracked
  //     per-account in localStorage as { reportId: responded_at } so a fresh
  //     reply (or an edited one with a newer responded_at) re-notifies, and
  //     reading it clears both the toast and the nav badge. Kept above the early
  //     returns below so the hook order stays stable. ---
  const replyAckKey = `pd_bugreply_ack_${profile?.id ?? session?.user?.id ?? "anon"}`;
  const [replyAck, setReplyAck] = useState<Record<string, string>>({});
  useEffect(() => { setReplyAck(readPref(replyAckKey, {})); }, [replyAckKey]);
  const unreadReplies = useMemo(
    () => (profile?.is_admin ? [] : bugs.filter((b) => b.admin_response && b.responded_at && (!replyAck[b.id] || replyAck[b.id] < b.responded_at!))),
    [profile?.is_admin, bugs, replyAck],
  );
  const markRepliesRead = () => {
    const next = { ...replyAck };
    for (const b of bugs) if (b.admin_response && b.responded_at) next[b.id] = b.responded_at;
    setReplyAck(next); writePref(replyAckKey, next);
  };
  const openMyReports = () => { setShowBugs(true); markRepliesRead(); };
  const [showOfficialResults, setShowOfficialResults] = useState(false); // admin "official" poll-results archive
  const [showUsageDash, setShowUsageDash] = useState(false); // admin residency usage graphs
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
      const uid = profile?.id ?? session?.user?.id ?? "local";
      getMyAnswers().then((server) => {
        const { merged, pending } = hydrateAnswers(uid, server);
        setAnswers(merged);
        setAnswersLoaded(true);
        if (pending.length) void retryPendingAnswers(uid, pending);
      });
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
          // normalizeOrder fills in any rule the stored copy predates.
          setDailyOrder(normalizeOrder(merged.daily_order));
          if (merged.daily_quota) setQuotaShares(normalizeQuotaShares(merged.daily_quota));
          setYearFocus(merged.year_focus ?? []);
          setOwlOn(merged.owl_on === true);
          setFoxOn(merged.fox_on === true);
          const learningDefaults = new Set(merged.learning_open_sections ?? ["explanation"]);
          preferredOpenSectionsRef.current = learningDefaults;
          setPreferredOpenSections(learningDefaults);
          setOpenSections(new Set(learningDefaults));
        }
        setPrefsSynced(true);
      });
      getDueReviewCards().then(setSrsDue);
      loadTests().then(setSavedTests);
      getPollAnsweredQuestionIds().then(setPollAnsweredIds);
    } else { setAnswers({}); setAnswersLoaded(false); setSettings(null); setSrsDue([]); setSavedTests([]); setPrefsSynced(false); setPollAnsweredIds([]); }
  }, [persist]); // eslint-disable-line

  const bankKind: "prite" | "neuro" | "therapy" | "meds" =
    psychMode === "neuro" ? "neuro" : psychMode === "therapy" ? "therapy" : psychMode === "meds" ? "meds" : "prite";
  const quotaCustomized = allocateQuota(10, quotaShares).join() !== allocateQuota(10, DAILY_QUOTA_SHARES).join();
  const orderCustomized = (isPracticeBank(bankKind)
    ? visibleOrderRules(bankKind, dailyOrder).join() !== PRACTICE_DEFAULT_VISIBLE.join()
    : dailyOrder.join() !== DEFAULT_ORDER.join() || yearFocus.length > 0) || quotaCustomized;
  const weakAreasForOrder = useMemo(() => weakCategories(all ?? [], answers), [all, answers]);
  /* The panel's live preview. Runs the same comparator over the same candidate
     pool buildToday draws from — everything unanswered, plus anything missed —
     so the list updates the instant a rule is dragged, including before a set
     has been built. It shows ordering only; the daily cap and the review quota
     are applied later by buildToday. */
  const orderPreview = useMemo(() => {
    if (!all) return [];
    const recycle = settings?.recycle_missed ?? true;
    const afterMs = (settings?.recycle_after_days ?? 14) * 86400000;
    const now = Date.now();
    const due: RawQuestion[] = [];
    const fresh: RawQuestion[] = [];
    for (const qq of all) {
      const row = answers[questionId(qq.year, qq.q_index)];
      if (!row) fresh.push(qq);
      else if (recycle && !row.correct && !row.cleared && now - Date.parse(row.updated_at) >= afterMs) due.push(qq);
    }
    const missedIds = new Set(due.map((qq) => questionId(qq.year, qq.q_index)));
    const sortOrder = practiceSortOrder(bankKind, dailyOrder);
    const weakCats = new Set(weakAreasForOrder.map((w) => w.cat));
    const cmp = orderComparator({
      order: sortOrder,
      yearFocus,
      weakCats,
      missedIds,
      answers,
      kind: bankKind,
    });
    const uniqueDue = uniqueQuestionGroups(due);
    const uniqueFresh = uniqueQuestionGroups(fresh, new Set(uniqueDue.map(questionGroupKey)));
    const previewN = Math.min(8, settings?.regimen ?? 10);
    return expandTherapySequences(
      pickDailyQuotaSet({
        candidates: [...uniqueDue, ...uniqueFresh],
        total: previewN,
        rules: visibleOrderRules(bankKind, sortOrder),
        cmp,
        answers,
        missedIds,
        weakCats,
        yearFocus,
        shares: quotaShares,
      }),
      all,
    );
  }, [all, answers, dailyOrder, yearFocus, weakAreasForOrder, bankKind, settings, quotaShares]);
  /* Every year in the bank, built from the data so a newly published exam
     appears without a code change. Sorted plain newest-first, NOT by yearRank:
     that ranking is the app's internal serving preference, and showing a picker
     as 2023, 2024, 2025, 2021 just looks broken to the person reading it. */
  const bankYears = useMemo(
    () => [...new Set((all ?? []).map((q) => q.year))].sort((a, b) => (Number(b) || 0) - (Number(a) || 0)),
    [all],
  );
  const applyOrder = (patch: { order?: OrderRuleId[]; yearFocus?: string[]; quota?: number[] }) => {
    if (patch.order) {
      setDailyOrder(patch.order);
      try { localStorage.setItem("pd_daily_order", JSON.stringify(patch.order)); } catch { /* private mode */ }
    }
    if (patch.yearFocus) {
      setYearFocus(patch.yearFocus);
      try { localStorage.setItem("pd_year_focus", JSON.stringify(patch.yearFocus)); } catch { /* private mode */ }
    }
    if (patch.quota) {
      const next = normalizeQuotaShares(patch.quota);
      setQuotaShares(next);
      try { localStorage.setItem("pd_daily_quota", JSON.stringify(next)); } catch { /* private mode */ }
    }
    schedulePrefsPush();
  };
  const resetOrder = () => {
    if (isPracticeBank(bankKind)) {
      applyOrder({ order: replaceVisibleOrder(dailyOrder, PRACTICE_DEFAULT_VISIBLE, bankKind), quota: [...DAILY_QUOTA_SHARES] });
      return;
    }
    applyOrder({ order: DEFAULT_ORDER, yearFocus: [], quota: [...DAILY_QUOTA_SHARES] });
  };

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
    const afterMs = (settings?.recycle_after_days ?? 14) * 86400000;
    const now = Date.now();
    const a = answersRef.current;
    const answeredToday = Object.values(a).filter((r) => isSameDay(r.updated_at)).length;
    const remaining = count != null ? count : extra ? regimen : Math.max(0, regimen - answeredToday);
    const recentCutoff = now - 7 * 86400000;
    const recentlyAnsweredGroups = new Set(
      all
        .filter((qq) => {
          const row = a[questionId(qq.year, qq.q_index)];
          return !!row && Date.parse(row.updated_at) >= recentCutoff;
        })
        .map(questionGroupKey),
    );
    const highYieldMixSeed = `${ymd()}:${++highYieldMixRef.current}`;
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
    const missedIds = new Set(due.map((qq) => questionId(qq.year, qq.q_index)));
    const sortOrder = practiceSortOrder(bankKind, dailyOrder);
    const weakCats = new Set(weakCategories(all, a).map((w) => w.cat));
    const cmp = orderComparator({
      order: sortOrder,
      yearFocus,
      weakCats,
      missedIds,
      answers: a,
      highYieldMixSeed,
      recentlyAnsweredGroups,
      kind: bankKind,
    });
    const uniqueDue = uniqueQuestionGroups(due);
    const uniqueFresh = uniqueQuestionGroups(
      fresh,
      new Set(uniqueDue.map(questionGroupKey)),
    );
    setReviewMode(false);
    const picked = expandTherapySequences(
      pickDailyQuotaSet({
        candidates: [...uniqueDue, ...uniqueFresh],
        total: remaining,
        rules: visibleOrderRules(bankKind, sortOrder),
        cmp,
        answers: a,
        missedIds,
        weakCats,
        yearFocus,
        shares: quotaShares,
      }),
      all,
    );
    const uid = profile?.id ?? session?.user?.id ?? "local";
    setTodayQueue(picked);
    setBonusRound((prev) => {
      const nextBonus = extra ? Math.max(1, prev + 1) : 0;
      writeTodayQueueSnap(uid, bankKind, {
        day: ymd(),
        extra,
        bonusRound: nextBonus,
        reviewMode: false,
        qi: 0,
        ids: picked.map((qq) => ({ year: String(qq.year), q_index: qq.q_index })),
      });
      return nextBonus;
    });
  }, [all, settings, dailyOrder, yearFocus, quotaShares, profile?.id, session?.user?.id, bankKind]);

  // build a review-only set from every currently-missed question, presented
  // fresh (answer hidden) for a second attempt
  const startReview = useCallback(() => {
    if (!all) return;
    const a = answersRef.current;
    const missed = all.filter((qq) => {
      const row = a[questionId(qq.year, qq.q_index)];
      return row && !row.correct && !row.cleared;
    });
    const picked = missed.slice(0, 30);
    const uid = profile?.id ?? session?.user?.id ?? "local";
    setReviewMode(true);
    setBonusRound(0);
    setTodayQueue(picked);
    setMode("today"); setQi(0);
    try { localStorage.setItem(`pd_practice_mode_${uid}`, "today"); } catch { /* private mode */ }
    writeTodayQueueSnap(uid, bankKind, {
      day: ymd(),
      extra: false,
      bonusRound: 0,
      reviewMode: true,
      qi: 0,
      ids: picked.map((qq) => ({ year: String(qq.year), q_index: qq.q_index })),
    });
  }, [all, profile?.id, session?.user?.id, bankKind]);

  // Restore today's queue (including mid-bonus-set progress) before rebuilding.
  useEffect(() => {
    if (!persist || !answersLoaded || !all) return;
    const uid = profile?.id ?? session?.user?.id ?? "local";
    const byId = new Map(all.map((qq) => [questionId(qq.year, qq.q_index), qq]));
    const snap = readTodayQueueSnap(uid, bankKind);
    if (snap && snap.ids.length > 0) {
      const restored = snap.ids
        .map((id) => byId.get(questionId(id.year, id.q_index)))
        .filter((qq): qq is RawQuestion => !!qq);
      if (restored.length > 0) {
        const repaired = uniqueQuestionGroups(restored);
        // Older snapshots may contain every year-copy of a high-yield item.
        // Rebuild those sets at their original requested size so a resident
        // stuck in a two-concept loop gets a real set after refreshing.
        if (repaired.length < restored.length) {
          buildToday(snap.extra, snap.extra ? snap.ids.length : undefined);
        } else {
          setTodayQueue(expandTherapySequences(restored, all));
          setBonusRound(snap.bonusRound || 0);
          setReviewMode(!!snap.reviewMode);
          if (typeof snap.qi === "number" && !therapyJumpRef.current) setQi(Math.max(0, Math.min(snap.qi, restored.length - 1)));
        }
      } else {
        buildToday(false);
      }
    } else {
      buildToday(false);
    }
    const custom = readCustomQueueSnap(uid);
    if (custom) {
      const restoredCustom = custom.ids
        .map((id) => byId.get(questionId(id.year, id.q_index)))
        .filter((qq): qq is RawQuestion => !!qq);
      if (restoredCustom.length > 0) {
        setCustomQueue(restoredCustom);
        setCustomLabel(custom.label || "");
        let lastMode = "today";
        try { lastMode = localStorage.getItem(`pd_practice_mode_${uid}`) || "today"; } catch { /* ignore */ }
        if (lastMode === "custom" && !therapyJumpRef.current) {
          setMode("custom");
          setQi(Math.max(0, Math.min(custom.qi ?? 0, restoredCustom.length - 1)));
        }
      }
    }
  }, [persist, answersLoaded, all, buildToday, profile?.id, session?.user?.id, bankKind]);

  // Coming back from the Bienenfeld reader: land on Therapy and the question
  // that was on screen when they opened the book.
  useEffect(() => {
    const pending = therapyJumpRef.current;
    if (!pending?.qid || psychMode !== "therapy" || !all) return;
    if (persist && !answersLoaded) return;

    const idOf = (qq: RawQuestion) => questionId(qq.year, qq.q_index);
    const todayIdx = todayQueue.findIndex((qq) => idOf(qq) === pending.qid);
    const customIdx = customQueue.findIndex((qq) => idOf(qq) === pending.qid);
    const allIdx = all.findIndex((qq) => idOf(qq) === pending.qid);

    if ((pending.view === "today" || !pending.view) && todayIdx >= 0) {
      if (mode !== "today") setMode("today");
      setYear("all");
      setModalityFilter("all");
      setQi(todayIdx);
      therapyJumpRef.current = null;
      clearBienenfeldReturnParams();
      return;
    }
    if ((pending.view === "custom" || !pending.view) && customIdx >= 0) {
      setMode("custom");
      setQi(customIdx);
      therapyJumpRef.current = null;
      clearBienenfeldReturnParams();
      return;
    }
    if (pending.view === "today" && persist && todayQueue.length === 0) return;
    if (allIdx < 0) {
      therapyJumpRef.current = null;
      clearBienenfeldReturnParams();
      return;
    }
    setMode("browse");
    setYear("all");
    setModalityFilter("all");
    setQi(allIdx);
    therapyJumpRef.current = null;
    clearBienenfeldReturnParams();
  }, [psychMode, all, persist, answersLoaded, todayQueue, customQueue, mode]);

  // Keep the current index (and custom set) on disk so a tab close mid-set
  // comes back on the same question, not question 1 of an empty-looking set.
  useEffect(() => {
    if (!persist) return;
    const uid = profile?.id ?? session?.user?.id ?? "local";
    if (mode === "today" && todayQueue.length > 0) {
      const prev = readTodayQueueSnap(uid, bankKind);
      if (prev) writeTodayQueueSnap(uid, bankKind, { ...prev, qi });
    }
    if (customQueue.length > 0) {
      writeCustomQueueSnap(uid, {
        label: customLabel,
        qi: mode === "custom" ? qi : (readCustomQueueSnap(uid)?.qi ?? 0),
        ids: customQueue.map((qq) => ({ year: String(qq.year), q_index: qq.q_index })),
      });
    }
  }, [persist, mode, qi, todayQueue, customQueue, customLabel, profile?.id, session?.user?.id, bankKind]);

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
  // Re-fetch when hosting, joining, or opening Polls & Teams so an edit on
  // another device isn't overwritten by a stale in-memory roster.
  const refreshWeeklyTeams = async () => {
    const { teams, generatedAt, generatedBy } = await getWeeklyTeams();
    setWeeklyTeams(teams); setWeeklyGeneratedAt(generatedAt); setWeeklyGeneratedBy(generatedBy);
    return teams;
  };
  const [rosterEpoch, setRosterEpoch] = useState(0);
  useEffect(() => {
    if (!(isConfigured && signedIn && approved)) return;
    void refreshWeeklyTeams();
  }, [isConfigured, signedIn, approved, teamModePrompt !== false, !!joinCode, showOfficialResults]); // eslint-disable-line

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
      .then((data) => { if (alive) setPriteAll(data as RawQuestion[]); })
      .catch((e) => { if (alive) setLoadErr(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, [signedIn, approved]);

  // Kaplan & Sadock citations live behind the same sign-in gate as the bank
  // (they're verbatim excerpts of a copyrighted textbook). Only ~1,600 of the
  // ~3,600 questions have one, so a miss here is normal, not an error — the
  // Textbook tab simply doesn't appear. A failure to load is non-fatal too:
  // every other tab keeps working.
  useEffect(() => {
    if (isConfigured && !(signedIn && approved)) return;
    let alive = true;
    loadKaplanRefs()
      .then((m) => { if (alive) { setKaplanRefs(m); setKaplanErr(null); } })
      .catch((e) => {
        // Citations are a bonus and must never block the app — but record why,
        // so a failure is diagnosable instead of looking like "no citations".
        if (alive) setKaplanErr(String(e?.message ?? e));
        console.warn("[kaplan] citations failed to load:", e);
      });
    return () => { alive = false; };
  }, [signedIn, approved]);

  // Further-reading: MEDLINE papers + APA PsychiatryOnline chapters (~static JSON).
  // Same sign-in gate as the bank so we don't spend bandwidth on the landing page.
  // Section hidden when a question has neither papers nor APA chapters.
  useEffect(() => {
    if (isConfigured && !(signedIn && approved)) return;
    let alive = true;
    loadResearchRefs()
      .then((m) => { if (alive) { setResearchRefs(m); setResearchErr(null); } })
      .catch((e) => {
        if (alive) setResearchErr(String(e?.message ?? e));
        console.warn("[research] further-reading index failed to load:", e);
      });
    return () => { alive = false; };
  }, [signedIn, approved]);

  // DSM-5-TR section links (static offline match to disorder/chapter titles).
  useEffect(() => {
    if (isConfigured && !(signedIn && approved)) return;
    let alive = true;
    loadDsmRefs()
      .then((m) => { if (alive) { setDsmRefs(m); setDsmErr(null); } })
      .catch((e) => {
        if (alive) setDsmErr(String(e?.message ?? e));
        console.warn("[dsm] section index failed to load:", e);
      });
    return () => { alive = false; };
  }, [signedIn, approved]);

  // Kaufman 9e chapter windows for neurology PRITE items.
  useEffect(() => {
    if (isConfigured && !(signedIn && approved)) return;
    let alive = true;
    loadKaufmanRefs()
      .then((m) => { if (alive) { setKaufmanRefs(m); setKaufmanErr(null); } })
      .catch((e) => {
        if (alive) setKaufmanErr(String(e?.message ?? e));
        console.warn("[kaufman] section index failed to load:", e);
      });
    return () => { alive = false; };
  }, [signedIn, approved]);

  // Kaufman practice bank — only fetched when the Neuro toggle is on.
  useEffect(() => {
    if (psychMode !== "neuro") return;
    if (isConfigured && !(signedIn && approved)) return;
    if (kaufmanAll) return;
    let alive = true;
    loadKaufmanQuestions()
      .then((data) => { if (alive) { setKaufmanAll((data as RawQuestion[]).map(enrichBankQuestion)); setKaufmanBankErr(null); } })
      .catch((e) => {
        if (alive) setKaufmanBankErr(String(e?.message ?? e));
        console.warn("[kaufman] practice bank failed to load:", e);
      });
    return () => { alive = false; };
  }, [psychMode, signedIn, approved, kaufmanAll]);

  // Quizapine psychotherapy bank + Bienenfeld psychodynamic items — fetched
  // when the Therapy toggle is on. Kept as two files so other people can edit
  // therapy_questions.json without colliding with this book bank.
  useEffect(() => {
    if (psychMode !== "therapy") return;
    if (isConfigured && !(signedIn && approved)) return;
    if (therapyAll) return;
    let alive = true;
    Promise.all([
      loadTherapyQuestions(),
      loadBienenfeldQuestions().catch((e) => {
        console.warn("[bienenfeld] practice bank failed to load:", e);
        return [] as unknown[];
      }),
    ])
      .then(([quizapine, bienenfeld]) => {
        if (!alive) return;
        const merged = annotateTherapySequences(
          [...quizapine, ...bienenfeld].map((row) => enrichBankQuestion(row as RawQuestion)),
        );
        setTherapyAll(merged);
        setTherapyBankErr(null);
      })
      .catch((e) => {
        if (alive) setTherapyBankErr(String(e?.message ?? e));
        console.warn("[therapy] practice bank failed to load:", e);
      });
    return () => { alive = false; };
  }, [psychMode, signedIn, approved, therapyAll]);

  // Carlat 2026 medication vignettes — fetched only when the Meds toggle is on.
  useEffect(() => {
    if (psychMode !== "meds") return;
    if (isConfigured && !(signedIn && approved)) return;
    if (carlatAll) return;
    let alive = true;
    loadCarlatQuestions()
      .then((data) => {
        if (alive) {
          setCarlatAll((data as RawQuestion[]).map(enrichBankQuestion));
          setCarlatBankErr(null);
        }
      })
      .catch((e) => {
        if (alive) setCarlatBankErr(String(e?.message ?? e));
        console.warn("[carlat] practice bank failed to load:", e);
      });
    return () => { alive = false; };
  }, [psychMode, signedIn, approved, carlatAll]);

  // Historical / gee-whiz context for Neuro + Therapy items.
  const [bankContext, setBankContext] = useState<Record<string, string>>({});
  useEffect(() => {
    if (isConfigured && !(signedIn && approved)) return;
    let alive = true;
    loadBankContext()
      .then((m) => { if (alive) setBankContext(m); })
      .catch((e) => { console.warn("[context] bank factoids failed to load:", e); });
    return () => { alive = false; };
  }, [signedIn, approved]);

  // Stat Cat pearls: one verified statistic + source URL per question.
  useEffect(() => {
    if (isConfigured && !(signedIn && approved)) return;
    let alive = true;
    loadOwlStats()
      .then((m) => { if (alive) setOwlStats(m); })
      .catch((e) => { console.warn("[owl] stats failed to load:", e); });
    return () => { alive = false; };
  }, [signedIn, approved]);

  // Dynamic Dawg pearls: one sourced psychodynamic take per question.
  useEffect(() => {
    if (isConfigured && !(signedIn && approved)) return;
    let alive = true;
    loadDynPerspectives()
      .then((m) => { if (alive) setDynPearls(m); })
      .catch((e) => { console.warn("[dyn] perspectives failed to load:", e); });
    return () => { alive = false; };
  }, [signedIn, approved]);

  const years = useMemo(() => {
    if (!all) return [];
    const ys = Array.from(new Set(all.map((q) => q.year)));
    if (psychMode === "neuro") {
      return ys.sort((a, b) => neuroYearRank(a) - neuroYearRank(b));
    }
    if (psychMode === "therapy") {
      const modality = (y: string) => all.find((q) => q.year === y)?.quizapine?.modality || "";
      const filtered = modalityFilter === "all" ? ys : ys.filter((y) => modality(y) === modalityFilter);
      return filtered.sort((a, b) => {
        const ma = modality(a);
        const mb = modality(b);
        const mr = therapyModalityRank(ma) - therapyModalityRank(mb);
        if (mr) return mr;
        if (ma === "Bienenfeld") return bienenfeldYearRank(a) - bienenfeldYearRank(b);
        return a.localeCompare(b);
      });
    }
    if (psychMode === "meds") {
      const catOf = (y: string) => {
        const q = all.find((row) => row.year === y);
        return q ? carlatCategory(q) : "";
      };
      const filtered = modalityFilter === "all" ? ys : ys.filter((y) => catOf(y) === modalityFilter);
      return filtered.sort((a, b) => {
        const cr = carlatCategoryRank(catOf(a)) - carlatCategoryRank(catOf(b));
        if (cr) return cr;
        return a.localeCompare(b);
      });
    }
    return ys.sort();
  }, [all, psychMode, modalityFilter]);
  const browseSet = useMemo(() => {
    if (!all) return [];
    return all.filter((q) => {
      if (psychMode === "therapy" && modalityFilter !== "all" && q.quizapine?.modality !== modalityFilter) return false;
      if (psychMode === "meds" && modalityFilter !== "all" && carlatCategory(q) !== modalityFilter) return false;
      if (year !== "all" && q.year !== year) return false;
      return true;
    });
  }, [all, year, psychMode, modalityFilter]);
  const byId = useMemo(() => {
    const m = new Map<string, RawQuestion>();
    for (const bank of [priteAll, kaufmanAll, therapyAll, carlatAll]) {
      if (bank) for (const qq of bank) m.set(questionId(qq.year, qq.q_index), qq);
    }
    return m;
  }, [priteAll, kaufmanAll, therapyAll, carlatAll]);
  // Repeat-groups already used across ALL of this user's saved tests, so the
  // random test generator can skip questions (and their cross-year twins)
  // already handed out in a prior week's set.
  const usedGroupKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const t of savedTests) {
      if (!t.mine) continue;
      for (const id of t.qids) {
        const q = byId.get(id);
        if (q) keys.add(questionGroupKey(q));
      }
    }
    return keys;
  }, [savedTests, byId]);
  // Which saved tests ("polls") each repeat-group appears in — powers the
  // "also used in another poll" marker in the test editor. A test is listed
  // once per group even if it holds several members of that group.
  const testsByGroupKey = useMemo(() => {
    const m = new Map<string, { id: string; name: string }[]>();
    for (const t of savedTests) {
      if (!t.mine) continue;
      const seen = new Set<string>();
      for (const id of t.qids) {
        const q = byId.get(id);
        if (!q) continue;
        const g = questionGroupKey(q);
        if (seen.has(g)) continue;
        seen.add(g);
        if (!m.has(g)) m.set(g, []);
        m.get(g)!.push({ id: t.id, name: t.name });
      }
    }
    return m;
  }, [savedTests, byId]);
  const inToday = persist && mode === "today";
  // custom sets work signed-out too (e.g. studying a saved test in local mode)
  const inCustom = mode === "custom" && customQueue.length > 0;
  const inPractice = inToday || inCustom; // exam mode + timer apply only here
  const set = inToday ? todayQueue : inCustom ? customQueue : browseSet;
  const q = set[qi];
  // Switching banks/filters or restoring a saved set can briefly leave the old
  // numeric index outside the new queue. Repair it before paint so the whole
  // app cannot get trapped behind the generic empty-filter screen.
  useLayoutEffect(() => {
    if (set.length > 0 && (qi < 0 || qi >= set.length)) {
      setQi(0);
      return;
    }
    if (set.length === 0 && mode !== "today" && (year !== "all" || modalityFilter !== "all")) {
      setYear("all");
      setModalityFilter("all");
      setQi(0);
    }
  }, [set.length, qi, mode, year, modalityFilter]);
  // stable id of the on-screen question — effects key on THIS (not qi/mode) so
  // per-question state always resets, even when the set changes under an index
  const navQid = q ? questionId(q.year, q.q_index) : null;
  const bookReturn: BienenfeldReturn = {
    bank: "therapy",
    qid: psychMode === "therapy" ? navQid : null,
    view: psychMode === "therapy" ? mode : null,
  };
  useEffect(() => {
    if (psychMode !== "therapy" || !navQid) return;
    writeTherapyReturn({ bank: "therapy", qid: navQid, view: mode });
  }, [psychMode, navQid, mode]);
  // explanations stay hidden while answering an exam-mode set (until review)
  const examActive = examMode && inPractice && !examReview;
  const showAnswer = revealed && !examActive;

  // Start each answer with the resident's account-synced defaults. Cards they
  // open or close normally stay temporary; only the explicit "Keep open"
  // control changes this set for future questions and future sign-ins.
  useEffect(() => {
    const next = new Set(preferredOpenSectionsRef.current);
    if (q?.bienenfeld) next.add("bienenfeld");
    if (q?.carlat) next.add("carlat");
    setOpenSections(next); setDraft(""); setStats(null); setCard(null); setEditCard(null); setContext(null); setCrossed([]);
    helpSectionCursorRef.current = { qid: navQid, lastId: null };
    setAskOpen(false); setAskText("");
    if (navQid && persist) {
      getMyNote(navQid).then(setMyNote);
      getGroupNotes(navQid).then(setGroupNotes);
      getMyHighlights(navQid).then(setHighlights);
    } else { setMyNote(""); setGroupNotes([]); setHighlights([]); }
  }, [navQid, persist]); // eslint-disable-line

  // lazy-load the shared historical-context blurb when its card is opened
  useEffect(() => {
    if (!openSections.has("context") || context !== null) return;
    const cur = set[qi];
    if (!cur) return;
    const qid = questionId(cur.year, cur.q_index);
    const local = bankContext[qid] || cur.context || "";
    if (!persist) { setContext(local); return; }
    getQuestionContext(qid).then((c) => setContext(c || local));
  }, [openSections, qi, persist, mode, bankContext]); // eslint-disable-line

  // lazy-load the cached flashcard when the Flashcard card is opened
  useEffect(() => {
    if (!openSections.has("flash") || !persist || card) return;
    const cur = set[qi];
    if (cur) getFlashcard(questionId(cur.year, cur.q_index)).then((c) => { if (c) setCard(c); });
  }, [openSections, qi, persist, mode]); // eslint-disable-line

  // Reset Anki-style cloze practice when the question (or card text) changes
  useEffect(() => {
    setClozeRevealed(false);
    setClozeOpenIds(new Set());
    setShowClozeSource(false);
  }, [navQid, card?.cloze_text]);

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
  // A reward should mark a completion that happens while this session is
  // running, never a completed set discovered while answers are loading at
  // sign-in. The key also re-baselines cleanly when the day or user changes.
  const rewardBaselineRef = useRef<string | null>(null);
  const rewardTarget = settings?.regimen ?? 10;
  const rewardDoneToday = Object.values(answers).filter((a) => isSameDay(a.updated_at)).length;
  const rewardSetAnswered = inPractice ? set.filter((qq) => answers[questionId(qq.year, qq.q_index)]).length : 0;
  const rewardDailyDone = rewardDoneToday >= rewardTarget;
  const rewardExamDone = examMode && inPractice && set.length > 0 && rewardSetAnswered >= set.length;
  const rewardSetDone = rewardDailyDone || rewardExamDone;
  useEffect(() => {
    // The saved answer history and account-synced "already shown" preference
    // arrive after the first render. Prime the state from the settled data so
    // an old completed set cannot look like a new completion just by logging in.
    if (persist && (!answersLoaded || !prefsSynced)) return;
    const uid = profile?.id ?? session?.user?.id ?? "local";
    const baselineKey = `${uid}:${ymd()}`;
    if (rewardBaselineRef.current !== baselineKey) {
      rewardBaselineRef.current = baselineKey;
      rewardArmed.current = !rewardSetDone;
      return;
    }
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
  }, [persist, answersLoaded, prefsSynced, profile?.id, session?.user?.id, rewardSetDone, rewardDailyDone, rewardExamDone]);

  // Scroll edge effect: the translucent top bar only casts a shadow once
  // content is actually scrolled underneath it (no hard divider at rest).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => {
      setScrolled(window.scrollY > 6);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  // ---- Keyboard shortcuts -------------------------------------------------
  // The listener is registered once; the handler itself is rebuilt on every
  // render into a ref (same pattern as finalizeRef), because everything it
  // needs — picked, canSubmit, the section list — is computed below the early
  // returns, where a hook can't go.
  const hotkeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const on = (e: KeyboardEvent) => hotkeyRef.current(e);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
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
  // Unlisted demo of the standings board + scoring rules (see DemoStandings).
  if (new URLSearchParams(location.search).get("demoStandings") === "1") return <DemoStandings />;
  if (isConfigured && !session) return <SignIn onJoinPoll={setGuestPollCode} />;
  if (isConfigured && session && (!profile || profile.status !== "approved"))
    return <Pending email={session.user.email ?? ""} status={profile?.status ?? "pending"} />;
  if (isConfigured && session && profile && profile.status === "approved" && !profile.training_level)
    return <TrainingLevelGate onSaved={reloadProfile} />;

  if (loadErr) return <Center>Couldn’t load the question bank: {loadErr}</Center>;
  if (!all) return <Center>{
    psychMode === "neuro"
      ? (kaufmanBankErr ? `Kaufman questions: ${kaufmanBankErr}` : "Loading Kaufman questions…")
      : psychMode === "therapy"
        ? (therapyBankErr ? `Therapy questions: ${therapyBankErr}` : "Loading therapy questions…")
        : psychMode === "meds"
          ? (carlatBankErr ? `Medication questions: ${carlatBankErr}` : "Loading medication questions…")
        : "Loading the PRITE bank…"
  }</Center>;
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
  const requiredSelections = correctSet.length;
  const canSubmit = !!q && picked.length > 0 &&
    (!q.multi_select || picked.length === requiredSelections);

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
    // Multi-select items are exact-count questions. Do not let a hurried tap
    // submit an incomplete (or over-complete) set as a wrong answer.
    if (!timedOut && !canSubmit) return;
    setRevealed(true);
    const right =
      picked.length > 0 &&
      picked.length === correctSet.length && picked.every((l) => correctSet.includes(l));
    // Hold the celebration until review when explanations are deferred.
    if (right && !examActive) setTimeout(fireConfetti, 140);
    if (persist && q) {
      const qid = questionId(q.year, q.q_index);
      const uid = profile?.id ?? session?.user?.id ?? "local";
      const optimistic = rememberAnswer(uid, qid, picked, right, answersRef.current[qid]);
      setAnswers((m) => ({ ...m, [qid]: optimistic }));
      const saved = await saveAnswer(qid, picked, right, answersRef.current[qid]);
      if (saved) {
        confirmAnswer(uid, saved);
        setAnswers((m) => ({ ...m, [qid]: saved }));
      }
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
  // Inline "Next question" button: let the arrow fly, then advance. The guard
  // keeps an impatient double-click from skipping two questions, and the timer
  // only fires if we're still on the question that was clicked — otherwise
  // reaching for the header arrows mid-animation would skip an extra one.
  // Liquid-glass reactivity: the specular highlight and the parallax tilt both
  // read --gx/--gy, written straight to the node so a mousemove never costs a
  // React render. Percentages, so they survive any resize.
  const trackGlass = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--gx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  };
  const resetGlass = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.setProperty("--gx", "50%");
    e.currentTarget.style.setProperty("--gy", "50%");
  };

  // The sheet folds away over the next one (nextLaunching); by the time the
  // fold clears the spine the plate underneath is already showing, so the new
  // question just needs its content to land — .qIn handles that.
  const launchNext = () => {
    if (nextLaunching) return;
    const from = qi;
    setNextLaunching(true);
    window.setTimeout(() => {
      setNextLaunching(false);
      setQi((i) => (i === from ? (i + 1) % set.length : i));
    }, 300);
  };

  // ---- Drag-to-peel ----------------------------------------------------
  // StPageFlip's one feature worth chasing: the fold follows your hand. The
  // grip is a narrow strip pinned to the card's right edge, sized to sit
  // inside the card's own padding so it never covers an option row — a wider
  // hit area would swallow clicks on the right end of the answers.
  const FOLD_MS = 300;
  const foldAnims = () =>
    stackRef.current
      ? stackRef.current
          .getAnimations({ subtree: true })
          .filter((a) => String((a as unknown as { animationName?: string }).animationName ?? "").startsWith("fold"))
      : [];

  const peelDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (nextLaunching || set.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = stackRef.current?.getBoundingClientRect();
    if (!box) return;
    // Capture keeps the fold tracking once the pointer leaves the strip, which
    // it does immediately. Not fatal if the browser refuses the id.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* keep peeling */ }
    peelRef.current = { id: e.pointerId, startX: e.clientX, w: box.width, p: 0, anims: [] };
    // Both flags in one render: the layers mount, and .peeling swaps the
    // easing to linear so the fold line tracks the pointer 1:1 instead of
    // arriving somewhere else through the ease curve.
    setPeeling(true);
    setNextLaunching(true);
  };

  const peelMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const d = peelRef.current;
    if (!d || e.pointerId !== d.id) return;
    // Collected on first move, not on pointerdown — React hasn't mounted the
    // fold layers yet at press time, so there'd be nothing to find.
    if (!d.anims.length) {
      d.anims = foldAnims();
      d.anims.forEach((a) => a.pause());
    }
    d.p = Math.max(0, Math.min(1, (d.startX - e.clientX) / d.w));
    d.anims.forEach((a) => { a.currentTime = d.p * FOLD_MS; });
  };

  const peelUp = () => {
    const d = peelRef.current;
    if (!d) return;
    peelRef.current = null;
    // A press with no movement is a stray tap on the strip, not a peel.
    if (!d.anims.length) { setPeeling(false); setNextLaunching(false); return; }
    // Past the midpoint of the visible fold it wants to fall open; short of
    // that it springs back and the question is unchanged.
    const commit = d.p > 0.38;
    d.anims.forEach((a) => { a.playbackRate = commit ? 1 : -1; a.play(); });
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      setPeeling(false);
      setNextLaunching(false);
      if (commit) setQi((i) => (i + 1) % set.length);
    };
    // Reversing finishes at time 0; either direction resolves the same way.
    d.anims[0].finished.then(settle, settle);
    // Backstop: a tab switched to the background mid-peel throttles its
    // animations, so `finished` may never fire and the card would sit frozen
    // half-folded. Whichever lands first wins; settle() only runs once.
    window.setTimeout(settle, FOLD_MS + 150);
  };

  const doJump = () => {
    const n = parseInt(jump, 10);
    if (!isNaN(n) && n >= 1 && n <= set.length) setQi(n - 1);
    setJump("");
  };

  const hasExpl = q ? (q.explanation_text || q.explanation_images.length > 0) : false;
  const hasDiagram = q ? !!(q.diagram?.code || (q.comparison_table && q.comparison_table.rows?.length)) : false;
  const mnemonics = q ? mnemonicsForQuestion(q) : [];
  const ankingImgs = q?.anking_images?.filter(Boolean) ?? [];
  const sketchyImgs = q?.sketchy_images?.filter(Boolean) ?? [];
  // Roughly 45% of questions have a verified textbook passage; the card is hidden
  // entirely for the rest rather than showing an empty state on every other question.
  const kaplan = q ? kaplanRefs[questionId(q.year, q.q_index)] : undefined;
  const research = q
    ? (researchRefs[questionId(q.year, q.q_index)]?.articles?.length
        ? researchRefs[questionId(q.year, q.q_index)]
        : furtherReadingFor(q))
    : undefined;
  const dsm = q ? dsmRefs[questionId(q.year, q.q_index)] : undefined;
  const kaufman: KaufmanRef | undefined = q
    ? (q.kaufman?.teach_page
        ? {
            section: String(q.kaufman.teach_section ?? q.kaufman.chapter_num ?? "R"),
            title: q.kaufman.teach_title || q.kaufman.chapter || q.prite_label || "Kaufman",
            why: "Main-text discussion of this topic — not the book’s review-question pages.",
            book: "Kaufman's Clinical Neurology for Psychiatrists, 9th ed.",
            page: q.kaufman.teach_page,
            lo: q.kaufman.teach_lo ?? q.kaufman.teach_page,
            hi: q.kaufman.teach_hi ?? q.kaufman.teach_page,
            atStart: true,
            atEnd: true,
          }
        : q.kaufman?.pdf_page
        ? {
            section: String(q.kaufman.chapter_num ?? "R"),
            title: q.kaufman.chapter || q.prite_label || "Kaufman",
            why: "Main-text discussion of this topic — not the book’s review-question pages.",
            book: "Kaufman's Clinical Neurology for Psychiatrists, 9th ed.",
            page: q.kaufman.pdf_page,
            lo: Math.max(1, q.kaufman.pdf_page - 1),
            hi: q.kaufman.pdf_page + 2,
          }
        : kaufmanRefs[questionId(q.year, q.q_index)])
    : undefined;
  const owl = q ? owlStats[questionId(q.year, q.q_index)] : undefined;
  const dyn = q ? dynPearls[questionId(q.year, q.q_index)] : undefined;
  // Mascot tabs are post-answer study aids. Keeping them out of the answering
  // state prevents even a small visual hint/distraction before the learner commits.
  const showOwlAid = showAnswer && !!owl;
  const showDynAid = showAnswer && !!dyn;
  const sections: [string, string, string, React.ReactNode][] = [
    ["explanation", "Explanation", "Why this answer is correct", <Layers size={17} strokeWidth={2.1} />],
    ...(kaplan
      ? ([["textbook", "Textbook", "Verified Kaplan & Sadock support", <BookOpen size={17} strokeWidth={2.1} />]] as [string, string, string, React.ReactNode][])
      : []),
    ...(dsm
      ? ([["dsm", "DSM-5-TR", "Diagnostic criteria section", <BookMarked size={17} strokeWidth={2.1} />]] as [string, string, string, React.ReactNode][])
      : []),
    ...(kaufman
      ? ([["kaufman", "Kaufman", "Clinical neurology for psychiatrists", <Brain size={17} strokeWidth={2.1} />]] as [string, string, string, React.ReactNode][])
      : []),
    ...(q?.bienenfeld
      ? ([["bienenfeld", "Bienenfeld", showAnswer ? "Psychodynamic theory for clinicians" : "Review the vignette and cited pages", <BookOpen size={17} strokeWidth={2.1} />]] as [string, string, string, React.ReactNode][])
      : []),
    ...(q?.carlat
      ? ([["carlat", "Carlat", showAnswer ? "Medication fact sheet from the 2026 book" : "Read the fact sheet while you work the vignette", <Pill size={17} strokeWidth={2.1} />]] as [string, string, string, React.ReactNode][])
      : []),
    ...(ankingImgs.length
      ? ([["anking", "AnKing", "AnKing / AnkiHub diagrams", <ImageIcon size={17} strokeWidth={2.1} />]] as [string, string, string, React.ReactNode][])
      : []),
    ...(sketchyImgs.length
      ? ([["sketchy", "Sketchy", "Matched Sketchy panels", <ImageIcon size={17} strokeWidth={2.1} />]] as [string, string, string, React.ReactNode][])
      : []),
    ["practice", "In practice", "See it in a clinical scenario", <Stethoscope size={17} strokeWidth={2.1} />],
    ...(mnemonics.length
      ? ([["mnemonic", "Mnemonic", "Quick ways to remember it", <Brain size={17} strokeWidth={2.1} />]] as [string, string, string, React.ReactNode][])
      : []),
    // Adjacent so pairNoteCards can put Context | Video on one row
    ["context", "Context", "The story behind the concept", <Lightbulb size={17} strokeWidth={2.1} />],
    ["video", "Video and podcasts", "Curated episodes and a focused YouTube search", <Youtube size={17} strokeWidth={2.1} />],
    ...(hasDiagram
      ? ([["diagram", "Diagram", "Visual map and comparison", <Network size={17} strokeWidth={2.1} />]] as [string, string, string, React.ReactNode][])
      : []),
    ["mine", "My notes", "Your private study space", <NotebookPen size={17} strokeWidth={2.1} />],
    ["group", "Group notes", "Learn with your class", <Users size={17} strokeWidth={2.1} />],
    ["flash", "Flashcard", "Turn this into an Anki card", <Sparkles size={17} strokeWidth={2.1} />],
    // Further reading sits last so the clinical stack comes first
    ...(research?.articles?.length
      ? ([["research", "Further reading", "Papers & APA Publishing chapters", <Library size={17} strokeWidth={2.1} />]] as [string, string, string, React.ReactNode][])
      : []),
  ];
  const toggleSection = (id: string) => setOpenSections((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const togglePreferredSection = (id: string) => {
    const next = new Set(preferredOpenSectionsRef.current);
    const willKeepOpen = !next.has(id);
    if (willKeepOpen) next.add(id); else next.delete(id);
    preferredOpenSectionsRef.current = next;
    setPreferredOpenSections(next);
    writePref("pd_learning_open_sections", [...next]);
    schedulePrefsPush();
    // Choosing "Keep open" should be immediately visible; removing the saved
    // default intentionally leaves this one card's current state untouched.
    if (willKeepOpen) setOpenSections((current) => new Set(current).add(id));
  };

  /** Scroll a learning card under the sticky header rather than behind it. */
  const scrollToSection = (id: string) => {
    const card = document.getElementById(`learning-${q?.year}-${q?.q_index}-${id}`)?.closest("article");
    if (!card) return;
    const headerH = (document.querySelector("[data-topbar]") as HTMLElement | null)?.offsetHeight ?? 0;
    window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - headerH - 12, behavior: "smooth" });
  };

  // "h" walks the learning stack in its rendered order, independent of which
  // cards were already open (including cards kept open by preference). The
  // first press visits Explanation, each later press visits the next card, and
  // the sequence wraps after the last card. Closed targets open as we reach
  // them; open targets are left open but are never skipped.
  const advanceHelpSection = () => {
    if (!sections.length) return;
    const cursor = helpSectionCursorRef.current;
    const previousIndex = cursor.qid === navQid && cursor.lastId
      ? sections.findIndex(([id]) => id === cursor.lastId)
      : -1;
    const nextIndex = previousIndex >= 0 ? (previousIndex + 1) % sections.length : 0;
    const id = sections[nextIndex][0];
    helpSectionCursorRef.current = { qid: navQid, lastId: id };
    if (!openSections.has(id)) setOpenSections((current) => new Set(current).add(id));
    // Wait a frame for a closed card to start expanding before measuring it.
    requestAnimationFrame(() => scrollToSection(id));
  };

  // A–E (or 1–5) picks an option, Enter submits it and then advances, arrows
  // move between questions, h walks the learning stack. Assigned every render
  // so the handler always closes over the current question and selection.
  hotkeyRef.current = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || !q) return;
    const el = e.target as HTMLElement | null;
    // Never steal a keystroke that's being typed into something.
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    // A modal is its own keyboard context; don't drive the question underneath.
    if (document.querySelector("[data-scrim]")) return;

    // Letter/number keys select, right up until the answer is in.
    if (!revealed && e.key.length === 1) {
      const letter = /[a-z]/i.test(e.key)
        ? q.options.find((o) => o.letter.toLowerCase() === e.key.toLowerCase())?.letter
        : /[1-9]/.test(e.key)
          ? q.options[Number(e.key) - 1]?.letter
          : undefined;
      if (letter) { e.preventDefault(); togglePick(letter); return; }
    }

    if (e.key === "h" || e.key === "H") {
      if (!showAnswer) {
        if (q.carlat) {
          e.preventDefault();
          if (!openSections.has("carlat")) setOpenSections((current) => new Set(current).add("carlat"));
          requestAnimationFrame(() => scrollToSection("carlat"));
          return;
        }
        if (!q.bienenfeld) return;
        e.preventDefault();
        if (!openSections.has("bienenfeld")) setOpenSections((current) => new Set(current).add("bienenfeld"));
        requestAnimationFrame(() => scrollToSection("bienenfeld"));
        return;
      }
      e.preventDefault();
      advanceHelpSection();
      return;
    }

    // Held keys would race the peel animation and skip questions.
    if (e.repeat) return;
    if (e.key === "Enter") {
      if (!revealed && canSubmit) { e.preventDefault(); submit(); }
      // Exam mode advances itself once an answer is in — don't double-step it.
      else if (revealed && !examActive) { e.preventDefault(); launchNext(); }
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (revealed && !examActive) launchNext(); else go(1);
      return;
    }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
  };

  const qid = q ? questionId(q.year, q.q_index) : "";
  const recentRepeatCutoff = Date.now() - 7 * 86400000;
  const recentHighYieldRepeat = q && (q.repeat_count ?? 1) > 1
    ? all
        .map((other) => ({
          question: other,
          id: questionId(other.year, other.q_index),
          row: answers[questionId(other.year, other.q_index)],
        }))
        .filter(({ question, id, row }) =>
          id !== qid &&
          !!row &&
          questionGroupKey(question) === questionGroupKey(q) &&
          Date.parse(row.updated_at) >= recentRepeatCutoff &&
          Date.parse(row.updated_at) <= Date.now()
        )
        .sort((a, b) => Date.parse(b.row!.updated_at) - Date.parse(a.row!.updated_at))[0]
      ?? null
    : null;
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
  // exam-mode progress across the current set
  const setRows = inPractice ? set.map((qq) => answers[questionId(qq.year, qq.q_index)]) : [];
  const setAnswered = setRows.filter(Boolean).length;
  // Daily goal met AND the *current* Today queue is finished — so mid "Another
  // set" work does not keep the completion banner pinned forever. Empty queue
  // after the goal still counts complete (no more questions left to pull).
  const currentSetComplete = set.length === 0 || setAnswered >= set.length;
  const dayComplete =
    inToday && !reviewMode && doneToday >= target && currentSetComplete;
  const missedOutstanding = Object.values(answers).filter((a) => !a.correct && !a.cleared).length;
  const examSetComplete = examMode && inPractice && set.length > 0 && setAnswered >= set.length;
  const examScore = setRows.filter((r) => r && r.correct).length;
  // Falls back to the residency's assumed PRITE date (Oct 6, see
  // reminderWindow.ts) when the user hasn't set their own — same default the
  // Settings date box now displays.
  const examDays = settings ? daysUntil(settings.exam_date || guessedExamDate()) : null;
  const switchMode = (m: "today" | "browse" | "custom") => {
    setMode(m); setQi(0); setReviewMode(false);
    const uid = profile?.id ?? session?.user?.id ?? "local";
    try { localStorage.setItem(`pd_practice_mode_${uid}`, m); } catch { /* private mode */ }
  };

  // Clicking the PRITE Daily wordmark: back to the home screen — today's set,
  // every overlay panel closed, scrolled to the top. Deliberately doesn't
  // touch live poll / exam state, so a stray click can't blow up a session.
  const goHome = () => {
    setShowTests(false); setShowBoard(false); setShowStats(false); setShowInsights(false);
    setShowApprovals(false); setShowBugs(false); setShowOfficialResults(false); setShowUsageDash(false); setShowSettings(false);
    setShowGuideLibrary(false); setShowDeck(false); setShowMissed(false); setShowSrs(false);
    setShowCapite(false); setOpenStudyGuideId(null); setHostFromTests(false);
    switchMode("today");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // start a custom study session from a hand-picked set (from the Search modal)
  const startCustom = (qs: RawQuestion[], label: string) => {
    if (!qs.length) return;
    const ordered = expandTherapySequences(qs, all ?? qs);
    setCustomQueue(ordered);
    setCustomLabel(label);
    setMode("custom"); setQi(0); setReviewMode(false);
    setShowDeck(false);
    const uid = profile?.id ?? session?.user?.id ?? "local";
    try { localStorage.setItem(`pd_practice_mode_${uid}`, "custom"); } catch { /* private mode */ }
    writeCustomQueueSnap(uid, {
      label,
      qi: 0,
      ids: ordered.map((qq) => ({ year: String(qq.year), q_index: qq.q_index })),
    });
    fire(`Studying ${ordered.length} question${ordered.length === 1 ? "" : "s"}${label ? ` · ${label}` : ""}`);
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
      {/* Ambient plasma backdrop, shared with Quizapine but run slower here —
          0.12 is roughly half Quizapine's 0.25 and an eighth of Componentry's
          default, slow enough that it never pulls your eye off a stem.
          Unmounted (not hidden) when switched off, so the shader stops. */}
      {plasmaBg && <ClosingPlasmaBackground speed={0.12} />}

      {/* Top bar */}
      <header data-topbar style={{ ...s.top, ...(scrolled ? s.topScrolled : {}) }}>
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
                <span style={s.navSegRow} className="topActBtn" title="PRITE, child psych, Kaufman neurology, or psychotherapy">
                  <button
                    style={{ ...s.navSegBtn, ...(psychMode === "general" ? s.navSegOn : {}) }}
                    onClick={() => { setShowCapite(false); setPsychMode("general"); setYear("all"); setModalityFilter("all"); setQi(0); }}
                  >
                    <Stethoscope size={12} strokeWidth={2.3} /> <span className="btnTxt">General</span>
                  </button>
                  <button
                    style={{ ...s.navSegBtn, ...(psychMode === "child" ? s.navSegOn : {}) }}
                    onClick={selectChildPsych}
                  >
                    <Baby size={12} strokeWidth={2.3} /> <span className="btnTxt">Child</span>
                  </button>
                  <button
                    style={{ ...s.navSegBtn, ...(psychMode === "neuro" ? s.navSegOn : {}) }}
                    onClick={selectNeuro}
                  >
                    <Brain size={12} strokeWidth={2.3} /> <span className="btnTxt">Neuro</span>
                  </button>
                  <button
                    style={{ ...s.navSegBtn, ...(psychMode === "therapy" ? s.navSegOn : {}) }}
                    onClick={selectTherapy}
                  >
                    <Sofa size={12} strokeWidth={2.3} /> <span className="btnTxt">Therapy</span>
                  </button>
                  <button
                    style={{ ...s.navSegBtn, ...(psychMode === "meds" ? s.navSegOn : {}) }}
                    onClick={selectMeds}
                  >
                    <Pill size={12} strokeWidth={2.3} /> <span className="btnTxt">Meds</span>
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
                  <button style={s.approveBtn} className="topActBtn" onClick={() => setShowUsageDash(true)} title="Residency usage dashboard">
                    <LayoutDashboard size={13} strokeWidth={2.3} /> <span className="btnTxt">Usage</span>
                  </button>
                )}
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
                  <button style={s.approveBtn} className="topActBtn" onClick={openMyReports} title="Your bug reports & feature requests — and any replies from the admins">
                    <Bug size={13} strokeWidth={2.3} /> <span className="btnTxt">My reports</span>
                    {unreadReplies.length > 0 && <span style={s.pendingBadge}>{unreadReplies.length}</span>}
                  </button>
                )}
                {isAdmin && (
                  <button style={s.approveBtn} className="topActBtn" onClick={() => setShowOfficialResults(true)} title="Official poll results, this week's pairings, and season team rosters">
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

      {/* Explanations run long, so "Next question" floats instead of living in
          the Ask AI row: once an answer is showing it stays pinned bottom-right
          at every scroll position, rather than appearing only past the fold. */}
      {set.length > 0 && q && showAnswer && (
        <button
          className={`nextUp nextUpFab${nextLaunching ? " nextUpGo" : ""}`}
          style={s.nextUpFab}
          onClick={launchNext}
          onMouseMove={trackGlass}
          onMouseLeave={resetGlass}
          title="Go to the next question (Enter or →)"
          aria-label="Next question"
        >
          {/* Two glass layers under the label: a specular blob that chases the
              cursor, and a fixed top-edge highlight for the "thick pane" read.
              Both are aria-hidden decoration. */}
          <span className="nextUpLens" aria-hidden />
          <span className="nextUpRim" aria-hidden />
          <span style={{ position: "relative" }}>Next question</span>
          <span className="nextUpArrow" aria-hidden>
            <ArrowRight size={20} strokeWidth={2.6} />
          </span>
        </button>
      )}

      <main style={
        examActive ? { ...s.well, maxWidth: 880 }
          // Textbook pages are large screenshots — give them most of the screen width.
          : (openSections.has("textbook") || openSections.has("dsm") || openSections.has("kaufman") || openSections.has("bienenfeld") || openSections.has("carlat")) && (showAnswer || !!q?.bienenfeld || !!q?.carlat) ? { ...s.well, maxWidth: 1100 }
          : s.well
      }>
        {psychMode === "neuro" && !examActive && (
          <div style={s.bankBanner}>
            <span style={s.bankBannerIcon} aria-hidden>
              <Brain size={16} strokeWidth={2.2} />
            </span>
            <div>
              <div style={s.bankBannerTitle}>Kaufman · Clinical Neurology for Psychiatrists, 9th ed.</div>
              <div style={s.bankBannerHint}>
                Practice questions from the book; explanations are the book’s own. After you answer, open the Kaufman tab to read the surrounding pages.
              </div>
            </div>
          </div>
        )}
        {psychMode === "therapy" && !examActive && (
          <div style={s.bankBanner}>
            <span style={s.bankBannerIcon} aria-hidden>
              <Sofa size={16} strokeWidth={2.2} />
            </span>
            <div>
              <div style={s.bankBannerTitle}>Psychotherapy · Quizapine and Bienenfeld</div>
              <div style={s.bankBannerHint}>
                On Bienenfeld items the cited pages open below the question so you can review the vignette before you answer.
                {" "}
                <a href={bienenfeldReaderHref({ returnTo: bookReturn })} target="_blank" rel="noreferrer" style={s.bankBannerLink}>
                  Read the book
                </a>
                {" "}in the full-page reader.
              </div>
            </div>
          </div>
        )}
        {psychMode === "meds" && !examActive && (
          <div style={s.bankBanner}>
            <span style={s.bankBannerIcon} aria-hidden>
              <Pill size={16} strokeWidth={2.2} />
            </span>
            <div>
              <div style={s.bankBannerTitle}>Meds · Carlat Medication Fact Book, 8th ed. (2026)</div>
              <div style={s.bankBannerHint}>
                Clinical vignettes for each fact sheet. The book page opens under the question so you can read dosing and pearls while you work.
                {" "}
                <a href={carlatReaderHref(q?.carlat?.medication_id)} target="_blank" rel="noreferrer" style={s.bankBannerLink}>
                  Open the fact sheet
                </a>
                {" · "}
                <a href={CARLAT_BOOK_BUY_URL} target="_blank" rel="noreferrer" style={s.bankBannerLink}>
                  Buy the book
                </a>
              </div>
            </div>
          </div>
        )}
        {/* Navigation / filter row */}
        <div style={s.nav} className={examActive ? "examDim" : undefined}>
          {persist && (
            <div style={s.modeToggle}>
              <button style={{ ...s.modeBtn, ...(mode === "today" ? s.modeOn : {}) }} onClick={() => switchMode("today")}>
                <Sparkles size={13} strokeWidth={2.2} /> Today
              </button>
              <button style={{ ...s.modeBtn, ...(mode === "custom" ? s.modeOn : {}) }} onClick={goCustom} title={psychMode === "therapy" ? "Build a study set by modality, chapter, or what you've already tried" : psychMode === "neuro" ? "Build a study set by chapter or what you've already tried" : "Build a study set by topic, year, drug or diagnosis"}>
                <Target size={13} strokeWidth={2.2} /> Custom
              </button>
              <button style={{ ...s.modeBtn, ...(mode === "browse" ? s.modeOn : {}) }} onClick={() => switchMode("browse")}>
                <Layers size={13} strokeWidth={2.2} /> Browse
              </button>
            </div>
          )}
          {/* Sits right beside the Today tab, because that is the set it
              reorders — buried in Settings nobody would find it. */}
          {persist && mode === "today" && (
            <button
              style={{ ...s.deckBtn, ...(orderCustomized ? s.deckBtnOn : {}) }}
              onClick={() => setShowOrder(true)}
              title={psychMode === "therapy" ? "Choose what shows up first in your daily therapy set" : psychMode === "neuro" ? "Choose what shows up first in your daily Kaufman set" : psychMode === "meds" ? "Choose what shows up first in your daily meds set" : "Choose what shows up first in your daily questions"}
            >
              <GripVertical size={13} strokeWidth={2.3} /> What comes first
              {orderCustomized && <span style={s.deckDot} />}
            </button>
          )}
          {/* Not behind the mobile Menu: this is the one control that answers
              "give me my wrong ones" / "give me ones I haven't done", and a
              resident asked for it because they couldn't find it on a phone. */}
          <button style={s.deckBtn} onClick={() => setShowDeck(true)} title={psychMode === "therapy" ? "Filter by modality, chapter, or your history — missed, unseen, or already right" : psychMode === "neuro" ? "Filter by Kaufman chapter or your history — missed, unseen, or already right" : psychMode === "meds" ? "Filter by medication class or your history — missed, unseen, or already right" : "Filter questions by topic, year, or your own history — the ones you missed, or the ones you've never tried"}>
            <Search size={13} strokeWidth={2.4} /> Filter
          </button>
          {psychMode === "therapy" && (
            <a
              href={bienenfeldReaderHref({ returnTo: bookReturn })}
              target="_blank"
              rel="noreferrer"
              style={{ ...s.deckBtn, textDecoration: "none", color: "inherit" }}
              title="Read Bienenfeld chapter by chapter"
            >
              <BookOpen size={13} strokeWidth={2.4} /> Read Bienenfeld
            </a>
          )}
          {psychMode === "meds" && (
            <a
              href={carlatReaderHref(q?.carlat?.medication_id)}
              target="_blank"
              rel="noreferrer"
              style={{
                ...s.deckBtn,
                textDecoration: "none",
                color: "#f4efe4",
                background: "rgba(255,255,255,.10)",
                border: "1px solid rgba(244,239,228,.38)",
              }}
              title="Read the Carlat fact sheet for this medication"
            >
              <BookOpen size={13} strokeWidth={2.4} /> Read fact sheet
            </a>
          )}
          <button style={s.deckBtn} className="mobExtra" onClick={() => setShowAudioDrills(true)} title="Listen to active-recall questions by topic">
            <Volume2 size={13} strokeWidth={2.4} /> Listen
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
            title="Saved tests — yours, plus any sets shared with you"
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
              <option value="all">{psychMode === "neuro" ? "All chapters" : psychMode === "therapy" ? "All topics" : psychMode === "meds" ? "All medications" : "All years"} ({all.length})</option>
              {years.map((y) => {
                const n = all.filter((x) => x.year === y).length;
                const sample = all.find((x) => x.year === y);
                const mod = psychMode === "therapy" ? sample?.quizapine?.modality : null;
                const ch = psychMode === "neuro" && sample ? neuroChapter(sample) : null;
                const label = psychMode === "neuro" && sample
                  ? neuroChapterOptionLabel(y, ch || "")
                  : mod ? `${mod} · ${y}` : y;
                return <option key={y} value={y}>{label} ({n})</option>;
              })}
            </select>
          )}
          {/* Redo-my-misses lives outside the mode branch (and outside the
              mobile Menu) — it used to only appear in Today on a wide screen,
              which is why residents thought the feature didn't exist. */}
          {persist && missedOutstanding > 0 && (
            <button style={s.missChip} onClick={openMissed} title="The questions you got wrong — read them over or take another crack at them">
              <span className="flameFlicker"><Flame size={12} strokeWidth={2.2} color={T.gold} /></span>
              <span>Redo {missedOutstanding} missed</span>
            </button>
          )}
          {set.length > 0 && (
            <div style={s.navMid}>
              <button style={s.navBtn} onClick={() => go(-1)} title="Previous"><ArrowLeft size={16} strokeWidth={2.4} /></button>
              <span style={s.navInfo}>{qi + 1} <span style={{ color: T.faint }}>/ {set.length}</span></span>
              <button style={s.navBtn} onClick={launchNext} title="Next"><ArrowRight size={16} strokeWidth={2.4} /></button>
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
            <span>
              {bonusRound > 0 ? (
                <><b>Bonus set complete.</b> Great extra work — grab another set, or call it a day.</>
              ) : (
                <><b>That's your {target} for today.</b> Nice work — come back tomorrow for a fresh set.</>
              )}
            </span>
            <button style={s.doneBtn} onClick={() => { buildToday(true); setQi(0); fire(bonusRound > 0 ? "Starting another bonus set" : "Starting a bonus set"); }}><RotateCcw size={13} strokeWidth={2.3} /> Another set</button>
            {missedOutstanding > 0 && (
              <button style={{ ...s.doneBtn, marginLeft: 0, background: "transparent" }} onClick={() => { startReview(); fire("Retrying the ones you missed"); }} title="Take another crack at the questions you got wrong">
                <Flame size={13} strokeWidth={2.3} /> Redo {missedOutstanding} missed
              </button>
            )}
            <button style={{ ...s.doneBtn, marginLeft: 0, background: "transparent" }} onClick={() => switchMode("browse")}>Browse all</button>
            <button style={{ ...s.doneBtn, marginLeft: 0, background: "transparent" }} onClick={() => setReward(true)} title="Pick a little reward"><Flame size={13} strokeWidth={2.3} /> Reward</button>
          </div>
        )}

        {q ? (
        <>
        {/* Provenance line */}
        <div style={s.progressRow} className={examActive ? "examDim" : undefined}>
          <span style={s.qeyebrow}>
            {q.kaufman
              ? <>Kaufman · {q.year} · Q{q.kaufman.book_number ?? q.q_index}{q.prite_label ? <span style={{ color: T.faint }}> · {q.prite_label.replace(/^Chapter \d+:\s*/, "")}</span> : null}</>
              : q.bienenfeld
                ? <>Bienenfeld · {q.year} · Q{q.q_index}{q.bienenfeld.page != null ? <span style={{ color: T.faint }}> · p. {q.bienenfeld.page}</span> : null}</>
              : q.carlat
                ? showAnswer
                  ? <>Meds · {q.carlat.medication_title} · Q{q.q_index}{q.carlat.printed_pages?.[0] != null ? <span style={{ color: T.faint }}> · p. {q.carlat.printed_pages[0]}</span> : null}</>
                  : <>Meds · {q.carlat.category.replace(/ Medications$/i, "")} · Q{q.q_index}</>
              : q.quizapine
                ? <>Therapy · {q.quizapine.modality || "Psychotherapy"} · Q{q.q_index}{q.year ? <span style={{ color: T.faint }}> · {q.year}</span> : null}</>
                : <>{q.year} · Q{q.q_index} <span style={{ color: T.faint }}>(slide {q.slide_number})</span></>}
          </span>
          {reviewMode && <span style={{ ...s.multiTag, color: T.teal, background: T.tealSoft }}><RotateCcw size={12} strokeWidth={2.2} /> Reviewing missed — try again</span>}
          {q.multi_select && <span style={s.multiTag}><ListChecks size={12} strokeWidth={2.2} /> Select {requiredSelections} answers</span>}
          {recentHighYieldRepeat && (
            <span
              style={{ ...s.multiTag, color: T.gold, background: T.goldSoft }}
              title={`You answered the ${recentHighYieldRepeat.question.year} version within the last 7 days. This is the ${q.year} version of the same high-yield PRITE item.`}
            >
              <Repeat size={12} strokeWidth={2.4} /> High-yield repeat · answered in {recentHighYieldRepeat.question.year} this week · this is {q.year}
            </span>
          )}
          {persist && (
            <button style={s.reportBtn} onClick={() => setShowReport(true)} title="Report a problem with this question">
              <Bug size={12} strokeWidth={2.2} /> Report a problem
            </button>
          )}
        </div>

        {/* Question card. During a turn it sits in a three-deck stack: the next
            sheet underneath, the card itself being clipped away by the fold,
            and the fold's paper + lighting layers on top. The layers have to be
            siblings, not children — the card is what gets clipped, so anything
            inside it would be clipped along with the text. */}
        <div className={peeling ? "pageStack peeling" : "pageStack"} ref={stackRef}>
          {nextLaunching && (
            <span aria-hidden style={{ ...s.qcard, position: "absolute", inset: 0, padding: 0 }} />
          )}
        <section data-qcard className={nextLaunching ? "pageFold" : undefined} style={examActive ? { ...s.qcard, marginTop: 30, padding: "36px 38px 30px" } : s.qcard}>
          {showDynAid && (
            <MascotTab
              side="left"
              tone="brown"
              label="Dynamic"
              on={foxOn}
              onToggle={toggleFox}
              showTitle="Show Dynamic Dawg"
              hideTitle="Hide Dynamic Dawg"
            />
          )}
          {showOwlAid && (
            <MascotTab
              side="right"
              tone="orange"
              label="Stat"
              on={owlOn}
              onToggle={toggleOwl}
              showTitle="Show Stat Cat"
              hideTitle="Hide Stat Cat"
            />
          )}
          {showDynAid && foxOn && <AnalystFox qid={qid} pearl={dyn} theme={T} />}
          {showOwlAid && owlOn && <WiseOwl qid={qid} stat={owl} theme={T} />}
          {(q.kaufman?.stem_figures ?? []).map((fig) => (
            <KaufmanFigure
              key={fig.file}
              file={fig.file}
              caption={fig.caption}
              theme={T}
              onZoom={openZoom}
            />
          ))}
          {q.figure_images.filter((p) => imgSrc(p)).length > 0 && (
            <>
              <div style={{ ...s.figRow, ...((showOwlAid && owlOn) || (showDynAid && foxOn) ? { paddingRight: showOwlAid && owlOn ? 78 : 0, paddingLeft: showDynAid && foxOn ? 84 : 0 } : {}) }}>
                {q.figure_images.filter((p) => imgSrc(p)).map((p, i) => (
                  <AuditedQuestionImage
                    key={i}
                    q={q}
                    path={p}
                    kind="figure"
                    index={i}
                    alt="question figure (click to enlarge)"
                    style={{ ...s.figImg, cursor: "zoom-in" }}
                    onZoom={openZoom}
                    showCredit={showAnswer}
                  />
                ))}
              </div>
            </>
          )}
          {/* keyed by question id so the stem + options replay their entrance
              cascade on every navigation (figures stay outside — remounting
              them would re-trigger image loads) */}
          <div key={qid} className="qIn">
          <QuestionCardAnchor revealed={showAnswer} />
          <HighlightableText
            text={q.stem}
            ranges={highlights.filter((h) => h.field === "stem")}
            editable={persist}
            onChange={updateHighlights}
            style={{ ...s.stem, marginBottom: 18, ...(examActive ? { fontSize: 23, lineHeight: 1.58 } : {}), ...((showOwlAid && owlOn) || (showDynAid && foxOn) ? { paddingRight: showOwlAid && owlOn ? 78 : undefined, paddingLeft: showDynAid && foxOn ? 84 : undefined } : {}) }}
          />

          {q.multi_select && !revealed && (
            <div style={s.multiBanner} role="note" aria-label={`Select exactly ${requiredSelections} answers`}>
              <ListChecks size={15} strokeWidth={2.4} />
              <span><strong>Select exactly {requiredSelections} answers.</strong> This question has more than one correct answer.</span>
            </div>
          )}

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
              <span style={{ ...s.actionHint, ...(q.multi_select && picked.length > requiredSelections ? { color: T.wrongText } : {}) }} aria-live="polite">
                {q.multi_select
                  ? (picked.length
                    ? `${picked.length} of ${requiredSelections} selected (${picked.slice().sort().join(", ")})${picked.length > requiredSelections ? " — remove a choice" : ""}`
                    : `Choose ${requiredSelections} answers`)
                  : (picked.length ? `Selected ${picked.slice().sort().join(", ")}` : "Choose an answer")}
              </span>
              <button
                style={{ ...s.primary, opacity: canSubmit ? 1 : 0.45, cursor: canSubmit ? "pointer" : "not-allowed" }}
                onClick={submit}
                disabled={!canSubmit}
                title="Submit (Enter) · pick with A–E"
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
                <button style={s.doneBtn} onClick={launchNext}>Next <ArrowRight size={13} strokeWidth={2.3} /></button>
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
          {nextLaunching && (
            <>
              <span className="foldEdge" aria-hidden />
              <span className="foldFlap" aria-hidden />
              <span className="foldCrease" aria-hidden />
              <span className="foldSheen" aria-hidden />
            </>
          )}
          {/* Not in exam mode: there the Next button is deliberately withheld on
              the last question so the set can't wrap, and a stray drag during a
              timed test shouldn't be able to skip an item. */}
          {set.length > 1 && !examActive && (
            <span
              className="peelGrip"
              aria-hidden
              title="Drag left to turn the page"
              onPointerDown={peelDown}
              onPointerMove={peelMove}
              onPointerUp={peelUp}
              onPointerCancel={peelUp}
            />
          )}
        </div>

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
            {/* Static Next on the opposite side of this row from Ask AI; the
                larger floating FAB still pins bottom-right for long scrolls. */}
            {set.length > 1 && showAnswer && (
              <button
                className={`nextUp${nextLaunching ? " nextUpGo" : ""}`}
                style={s.nextUpInline}
                onClick={launchNext}
                onMouseMove={trackGlass}
                onMouseLeave={resetGlass}
                title="Go to the next question (Enter or →)"
                aria-label="Next question"
              >
                <span className="nextUpLens" aria-hidden />
                <span className="nextUpRim" aria-hidden />
                <span style={{ position: "relative" }}>Next question</span>
                <span className="nextUpArrow" aria-hidden>
                  <ArrowRight size={18} strokeWidth={2.6} />
                </span>
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
                      onClick={() => {
                        const prompt = askText.trim() ? askAiCustom(q, askText, showAnswer) : askAiPrompt(q, askStyle, showAnswer);
                        void launchAiTarget(t, prompt).then((copied) => {
                          if (t.copiesPrompt) fire(copied
                            ? "Full question copied — paste it into OpenEvidence."
                            : "OpenEvidence opened — copy and paste the question to ask it.");
                        });
                      }}>
                      {t.label} <ExternalLink size={12} strokeWidth={2.2} />
                    </button>
                  ))}
                </div>
                <p style={s.askNote}>
                  {askText.trim() ? "Opens the AI with your question and this question attached as reference." : "Opens the AI in a new tab with this question pre-filled"}
                  {!askText.trim() && (showAnswer ? "." : " (answer hidden until you reveal it).")}
                  {" "}OpenEvidence copies that complete prompt to your clipboard for pasting because its site does not accept pre-filled links.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Scrollable learning stack — all of the answer's supporting material
            stays visible as a table of contents instead of disappearing behind tabs.
            Bienenfeld pages also appear before the answer so the vignette can be
            reread while the question is still open. */}
        {(showAnswer || (!examActive && (q.bienenfeld || q.carlat))) && (
          <section style={s.below}>
            {/* No "Learning guide / Build out the answer" heading: the cards
                below say what they are, and the title + hint pushed the
                explanation an extra ~70px down the page. Just the controls. */}
            <div style={s.learningHead} className="learningHead">
              <div style={s.learningActions} className="learningActions">
                {showAnswer ? (
                  <>
                    <button
                      style={s.learningAction}
                      onClick={() => setOpenSections(new Set(sections.map(([id]) => id)))}
                    >
                      Expand all
                    </button>
                    <button style={s.learningAction} onClick={() => setOpenSections(new Set())}>Collapse all</button>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: T.muted, lineHeight: 1.45 }}>
                    Cited pages are here so you can review the vignette before you answer.
                  </span>
                )}
              </div>
            </div>

            <div style={s.learningStack}>
              {pairNoteCards((showAnswer ? sections : sections.filter(([id]) => id === "bienenfeld" || id === "carlat")).map(([id, label, summary, icon], sectionIndex) => {
                const isOpen = openSections.has(id);
                const isKeptOpen = preferredOpenSections.has(id);
                const bodyId = `learning-${q.year}-${q.q_index}-${id}`;
                // The two notes cards show no number (see .learningIndexCell),
                // so they don't consume one either — otherwise the visible
                // sequence would read 04 then 07.
                const stepNumber = sections.slice(0, sectionIndex).filter(([sid]) => sid !== "mine" && sid !== "group").length + 1;
                return (
                  <article
                    key={id}
                    className={`learningCard learningCardIn${isOpen ? " learningCardOpen" : ""}`}
                    style={{ ...s.learningCard, animationDelay: `${Math.min(sectionIndex * 35, 245)}ms` }}
                  >
                    <div className="learningCardHeader" style={s.learningCardHeader}>
                      <button
                        type="button"
                        className="learningCardButton"
                        style={s.learningCardButton}
                        onClick={() => toggleSection(id)}
                        aria-expanded={isOpen}
                        aria-controls={bodyId}
                      >
                        <span className="learningIndexCell" style={{ ...s.learningIndex, ...(isOpen ? s.learningIndexOpen : {}) }}>
                          {String(stepNumber).padStart(2, "0")}
                        </span>
                        <span style={{ ...s.learningIcon, ...(isOpen ? s.learningIconOpen : {}) }}>{icon}</span>
                        <span style={s.learningCardText}>
                          <span style={s.learningCardTitle}>{label}</span>
                          <span style={s.learningCardSummary}>{summary}</span>
                        </span>
                        {id === "group" && groupNotes.length > 0 && <span style={s.learningCount}>{groupNotes.length}</span>}
                        <ChevronDown
                          className="learningChevron"
                          style={{ ...s.learningChevron, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                          size={18}
                          strokeWidth={2.2}
                        />
                      </button>
                      <button
                        type="button"
                        className={`learningKeep${isKeptOpen ? " learningKeepOn" : ""}`}
                        style={{ ...s.learningKeep, ...(isKeptOpen ? s.learningKeepOn : {}) }}
                        onClick={() => togglePreferredSection(id)}
                        aria-pressed={isKeptOpen}
                        aria-label={`${isKeptOpen ? "Stop keeping" : "Keep"} ${label} open by default`}
                        title={`${isKeptOpen ? "Remove" : "Save"} this section as an open-by-default preference`}
                      >
                        <Pin size={13} strokeWidth={2.2} fill={isKeptOpen ? "currentColor" : "none"} />
                        <span className="learningKeepLabel">{isKeptOpen ? "Kept open" : "Keep open"}</span>
                      </button>
                    </div>
                    <div
                      id={bodyId}
                      role="region"
                      aria-label={label}
                      className={`learningBody${isOpen ? " learningBodyOpen" : ""}`}
                    >
                      <div style={s.learningBodyInner} className="learningBodyInner">
              {id === "explanation" && (
                <div className="fade">
                  {q.explanation_text && <ExplanationText text={q.explanation_text} style={s.expl} />}
                  {(q.kaufman?.expl_figures ?? []).map((fig) => (
                    <KaufmanFigure
                      key={fig.file}
                      file={fig.file}
                      caption={fig.caption}
                      theme={T}
                      onZoom={openZoom}
                    />
                  ))}
                  {q.explanation_images.filter((p) => imgSrc(p)).map((p, i) => (
                    <AuditedQuestionImage
                      key={i}
                      q={q}
                      path={p}
                      kind="explanation"
                      index={i}
                      alt="explanation (click to enlarge)"
                      style={{ ...s.explImg, cursor: "zoom-in" }}
                      onZoom={openZoom}
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

              {id === "textbook" && kaplan && (
                <div className="fade">
                  <KaplanPanel data={kaplan} theme={T} onZoom={openZoom} />
                </div>
              )}

              {id === "dsm" && dsm && (
                <div className="fade">
                  <DsmPanel data={dsm} theme={T} onZoom={openZoom} />
                </div>
              )}

              {id === "kaufman" && kaufman && (
                <div className="fade">
                  <KaufmanPanel data={kaufman} theme={T} onZoom={openZoom} />
                </div>
              )}

              {id === "bienenfeld" && q.bienenfeld && (
                <div className="fade">
                  <BienenfeldPanel loc={q.bienenfeld} theme={T} onZoom={openZoom} returnTo={bookReturn} showQuote={showAnswer} />
                </div>
              )}

              {id === "carlat" && q.carlat && (
                <div className="fade">
                  <CarlatPanel loc={q.carlat} theme={T} onZoom={openZoom} />
                </div>
              )}

              {id === "research" && research?.articles?.length ? (
                <div className="fade">
                  <ResearchPanel data={research} theme={T} />
                </div>
              ) : null}

              {id === "anking" && ankingImgs.length > 0 && (
                <div className="fade">
                  <label style={s.lbl}><ImageIcon size={13} strokeWidth={2.2} /> AnKing / AnkiHub diagrams</label>
                  <ResourceImagePanel
                    kind="anking"
                    images={ankingImgs}
                    match={q.anking_match}
                    theme={T}
                    onZoom={openZoom}
                  />
                </div>
              )}

              {id === "sketchy" && sketchyImgs.length > 0 && (
                <div className="fade">
                  <label style={s.lbl}><ImageIcon size={13} strokeWidth={2.2} /> Sketchy panels</label>
                  <ResourceImagePanel
                    kind="sketchy"
                    images={sketchyImgs}
                    match={q.anking_match}
                    theme={T}
                    onZoom={openZoom}
                  />
                </div>
              )}

              {id === "practice" && (
                <div className="fade">
                  {q.clinical_application ? (
                    <>
                      <label style={s.lbl}>How a resident would use this — an example scenario</label>
                      <ScenarioIllustration year={q.year} qIndex={q.q_index} onZoom={openZoom} />
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

              {id === "mnemonic" && mnemonics.length > 0 && (
                <div className="fade">
                  <label style={s.lbl}><Brain size={13} strokeWidth={2.2} /> Memory aids for this topic</label>
                  <div style={{ display: "grid", gap: 14 }}>
                    {mnemonics.map((mnemonic) => <MnemonicCard key={mnemonic.id} mnemonic={mnemonic} />)}
                  </div>
                  <p style={{ ...s.videoNote, marginTop: 14 }}>
                    Mnemonics are recall aids, not diagnostic criteria. Verify the complete criteria and clinical context.
                  </p>
                </div>
              )}

              {id === "context" && (
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

              {id === "video" && (
                <div className="fade">
                  <PodcastPicks q={q} extraKeys={podcastKeysFor(q)} />
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

              {id === "diagram" && (
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

              {id === "mine" && (
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

              {id === "group" && (
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

              {id === "flash" && (
                <div className="fade">
                  {!card && !editCard && (q.kaufman || q.quizapine) && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={s.lbl}>Ready-made cloze from this item’s teaching point</label>
                      <AnkiClozePractice
                        clozeText={autoFlashcard(q).cloze_text}
                        extra={autoFlashcard(q).extra}
                        revealed={clozeRevealed}
                        openIds={clozeOpenIds}
                        onReset={() => { setClozeRevealed(false); setClozeOpenIds(new Set()); }}
                        onRevealAll={() => { setClozeRevealed(true); setClozeOpenIds(new Set()); }}
                        onToggleBlank={(cid) => {
                          if (clozeRevealed) {
                            setClozeRevealed(false);
                            const allIds = new Set([...autoFlashcard(q).cloze_text.matchAll(/\{\{(c\d+)::/g)].map((x) => x[1]));
                            allIds.delete(cid);
                            setClozeOpenIds(allIds);
                            return;
                          }
                          setClozeOpenIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(cid)) next.delete(cid); else next.add(cid);
                            return next;
                          });
                        }}
                      />
                      <p style={{ ...s.videoNote, marginTop: 10 }}>
                        This card is built from the item itself. Generate a class-cached AI card below if you want a tighter cloze.
                      </p>
                    </div>
                  )}
                  {!card && !editCard && (
                    <div style={s.flashEmpty}>
                      <Sparkles size={20} strokeWidth={1.9} color={T.teal} />
                      <p style={{ margin: "8px 0 14px", color: T.muted, fontSize: 14, lineHeight: 1.5 }}>
                        Turn this question into an Anki-style cloze card. Practice here (click blanks to unveil), then download for Anki. Generated once by AI and cached for the class.
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
                          <span style={s.cardType}>Cloze · practice</span>
                          <span style={s.cardCached}><Sparkles size={12} strokeWidth={2.2} /> cached for the class</span>
                          {isAdmin && (
                            <button style={s.tinyBtn} onClick={() => setEditCard({ cloze: card.cloze_text, extra: card.extra })}>
                              <Pencil size={12} strokeWidth={2.2} /> Refine
                            </button>
                          )}
                        </div>

                        <AnkiClozePractice
                          clozeText={card.cloze_text}
                          extra={card.extra}
                          revealed={clozeRevealed}
                          openIds={clozeOpenIds}
                          onRevealAll={() => {
                            setClozeRevealed(true);
                            setClozeOpenIds(new Set());
                          }}
                          onToggleBlank={(cid) => {
                            if (clozeRevealed) {
                              // After full reveal, toggling a blank starts selective mode
                              setClozeRevealed(false);
                              const all = new Set(
                                [...card.cloze_text.matchAll(/\{\{(c\d+)::/g)].map((x) => x[1]),
                              );
                              all.delete(cid);
                              setClozeOpenIds(all);
                              return;
                            }
                            setClozeOpenIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(cid)) next.delete(cid);
                              else next.add(cid);
                              return next;
                            });
                          }}
                          onReset={() => {
                            setClozeRevealed(false);
                            setClozeOpenIds(new Set());
                          }}
                        />

                        <div style={{ marginTop: 16 }}>
                          <button
                            type="button"
                            style={{ ...s.tinyBtn, marginLeft: 0 }}
                            onClick={() => setShowClozeSource((v) => !v)}
                          >
                            {showClozeSource ? "Hide Anki markup" : "View Anki markup"}
                          </button>
                          {showClozeSource && (
                            <div style={{ marginTop: 8 }}>
                              <span style={s.fieldLbl}>Source (for Anki import)</span>
                              <code style={s.clozeRaw}>{renderClozeRaw(card.cloze_text)}</code>
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={s.flashActions}>
                        <button style={s.primarySm} onClick={doDownloadCard}><Download size={14} strokeWidth={2.2} /> Download for Anki</button>
                        {isAdmin && <button style={s.ghost} onClick={() => doGenerateCard(true)} disabled={cardBusy}><RotateCcw size={13} strokeWidth={2.2} /> Regenerate</button>}
                        <span style={s.flashNote}>Practice like Anki · imports as a Cloze note</span>
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
                    </div>
                  </article>
                );
              }))}
            </div>

            {/* The end-of-stack Next button is gone: the floating one sits in
                the same corner and always shows, so the two overlapped. */}
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
          <div style={s.shortcutHint}>
            Shortcuts: A–E / 1–5 answer · Enter submit / next · ← → questions · H next explanation
          </div>
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
          {/* Backdrop switch — down here on purpose. It's a preference you set
              once, so it shouldn't take up room next to the question. Not gated
              on sign-in: the backdrop renders for everyone, so the way out of it
              has to as well. */}
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              role="switch"
              aria-checked={plasmaBg}
              style={s.bgToggle}
              onClick={togglePlasmaBg}
              title={plasmaBg ? "Switch to the plain background" : "Switch to the animated background"}
            >
              <span style={{ ...s.bgTrack, ...(plasmaBg ? s.bgTrackOn : {}) }}>
                <span style={{ ...s.bgKnob, ...(plasmaBg ? s.bgKnobOn : {}) }} />
              </span>
              Animated background
            </button>
          </div>

          <div style={{ marginTop: 14 }}>
            <a href="https://quizapine.com" target="_blank" rel="noopener noreferrer" style={s.quizapineAd} title="More practice questions at Quizapine">
              <span style={s.quizapineBadge}><Share2 size={10} strokeWidth={2.6} color="#fff" /></span>
              Need more questions? Try <span style={s.quizapineWordmark}>Quiz</span>apine
            </a>
          </div>
        </footer>
      </main>

      {reminderPromptStage && (
        <div data-scrim style={s.scrim} onClick={dismissReminderPrompt}>
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
        <div data-scrim style={s.scrim} onClick={dismissAiDisclaimer}>
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

      {showUsageDash && isAdmin && (
        <AdminUsageDashboard onClose={() => setShowUsageDash(false)} />
      )}
      {showOfficialResults && isAdmin && (
        <OfficialResultsPanel
          results={officialResults}
          onClose={() => setShowOfficialResults(false)}
          onCleared={() => listOfficialPollResults().then(setOfficialResults)}
          onEditTeams={() => setShowTeamEditor("stable")}
          onEditWeekly={() => setShowTeamEditor("weekly")}
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
          kind={psychMode === "neuro" ? "neuro" : psychMode === "therapy" ? "therapy" : psychMode === "meds" ? "meds" : "prite"}
          usedGroupKeys={usedGroupKeys}
          answers={answers}
          kaplanRefs={kaplanRefs}
          kaplanErr={kaplanErr}
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
      {showAudioDrills && all && <AudioDrillsPanel all={all} onClose={() => setShowAudioDrills(false)} fire={fire} />}

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
          onEdit={(t) => setEditingTest(t)}
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
          onShare={(t) => setSharingTest(t)}
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

      {sharingTest && (
        <ShareTestModal
          test={sharingTest}
          onClose={() => setSharingTest(null)}
          onSaved={async () => {
            setSavedTests(await loadTests());
            fire(`Updated sharing for “${sharingTest.name}”`);
          }}
        />
      )}

      {editingTest && all && (
        <TestEditor
          test={editingTest}
          all={all}
          byId={byId}
          testsByGroupKey={testsByGroupKey}
          onClose={() => setEditingTest(null)}
          onSave={async (qids) => {
            const ok = await updateTestQids(editingTest.id, qids);
            if (!ok) { fire("Couldn't save — try signing in again"); return; }
            setSavedTests(await loadTests());
            setEditingTest(null);
            fire(`Updated "${editingTest.name}" — ${qids.length} question${qids.length === 1 ? "" : "s"}`);
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

      {showOrder && (
        <DailyOrderPanel
          kind={bankKind}
          order={dailyOrder}
          yearFocus={yearFocus}
          years={bankYears}
          preview={orderPreview}
          weakAreas={weakAreasForOrder}
          setSize={settings?.regimen ?? 10}
          quotaShares={quotaShares}
          onChange={applyOrder}
          onReset={resetOrder}
          onClose={() => setShowOrder(false)}
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
        <ZoomLightbox
          src={zoomImg}
          gallery={zoomGallery}
          onChangeSrc={setZoomImg}
          alt="Enlarged"
          onClose={() => { setZoomImg(null); setZoomGallery([]); }}
        />
      )}

      {teamModePrompt !== false && (
        <TeamModeModal
          onChoose={startHosting}
          onClose={() => { setTeamModePrompt(false); if (hostFromTests) { setShowTests(true); setHostFromTests(false); } }}
          isAdmin={isAdmin}
          stableCount={Object.keys(stableTeams).length}
          onGenerate={runGenerateStableTeams}
          onEditRosters={() => setShowTeamEditor("stable")}
          weeklyCount={Object.keys(weeklyTeams).length}
          weeklyGeneratedAt={weeklyGeneratedAt}
          weeklyGeneratedBy={weeklyGeneratedBy}
          onGenerateWeekly={runGenerateWeeklyTeams}
          onEditWeekly={() => setShowTeamEditor("weekly")}
          onCopyWeekly={weeklyPairingsText}
          onCopyStable={stableRosterText}
          rosterEpoch={rosterEpoch}
        />
      )}
      {showTeamEditor && (
        <TeamRosterEditor
          kind={showTeamEditor}
          onClose={async () => {
            const edited = showTeamEditor;
            setShowTeamEditor(null);
            if (edited === "stable") setStableTeams(await getStableTeams());
            else {
              await refreshWeeklyTeams();
              setRosterEpoch((n) => n + 1);
            }
          }}
        />
      )}
      {hostCode && (
        <ImmersiveScene
          sceneKey="arena"
          showBackdrop={false}
          closing={hostClosing}
          onExited={() => { setHostCode(null); setHostSet(null); setHostClosing(false); if (hostFromTests) { setShowTests(true); setHostFromTests(false); } }}
        >
          <PollPresenter
            code={hostCode}
            set={hostSet ?? set}
            startIndex={hostSet ? 0 : qi}
            timerSecs={timerSecs}
            onTimerSecsChange={setTimerSecs}
            teamMode={teamMode}
            // Only stable/weekly have a roster to read; "self"/"auto"/"individual"
            // build their team list from whoever actually shows up.
            rosterTeams={
              teamMode === "stable" ? [...new Set(Object.values(stableTeams))]
              : teamMode === "weekly" ? [...new Set(Object.values(weeklyTeams))]
              : []
            }
            onClose={() => setHostClosing(true)}
          />
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

      {/* actionable reply notification — persists until read or dismissed */}
      {!isAdmin && unreadReplies.length > 0 && !showBugs && (
        <div style={s.replyToast} className="toast" role="status" aria-live="polite">
          <button style={s.replyToastMain} onClick={openMyReports}>
            <span style={s.replyToastIcon}><Mail size={15} strokeWidth={2.4} /></span>
            <span>
              {unreadReplies.length === 1
                ? "An admin replied to your report"
                : `The admins replied to ${unreadReplies.length} of your reports`}
              <span style={s.replyToastCta}> — tap to read</span>
            </span>
          </button>
          <button style={s.replyToastX} onClick={markRepliesRead} aria-label="Dismiss" title="Dismiss">
            <X size={15} strokeWidth={2.6} />
          </button>
        </div>
      )}
    </div>
  );
}

// Asked the instant "Host poll" is clicked, before the room code is even
// generated — how should teams be formed for this session?
function TeamModeModal({ onChoose, onClose, isAdmin, stableCount, onGenerate, onEditRosters, weeklyCount, weeklyGeneratedAt, weeklyGeneratedBy, onGenerateWeekly, onEditWeekly, onCopyWeekly, onCopyStable, rosterEpoch }: {
  onChoose: (mode: TeamMode) => void; onClose: () => void;
  isAdmin: boolean; stableCount: number; onGenerate: () => Promise<boolean>;
  onEditRosters: () => void;
  weeklyCount: number; weeklyGeneratedAt: string | null; weeklyGeneratedBy: string | null;
  onGenerateWeekly: () => Promise<string | null>; onEditWeekly: () => void; onCopyWeekly: () => Promise<string | null>;
  onCopyStable: () => Promise<string | null>;
  rosterEpoch: number;
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
  useEffect(() => {
    if (!pairingsText) return;
    let alive = true;
    onCopyWeekly().then((text) => { if (alive && text) { setPairingsText(text); setPairingsCopied(false); } });
    return () => { alive = false; };
  }, [rosterEpoch]); // eslint-disable-line
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
    <div data-scrim style={s.scrim} onClick={onClose}>
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
                  <button style={s.teamModeRegen} onClick={onEditWeekly} disabled={weeklyBusy}>
                    <Pencil size={11} strokeWidth={2.4} /> Edit pairings (move / add / remove people)
                  </button>
                )}
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

/** Admin: hand-edit either saved poll roster — move members between teams,
    pull them off entirely, or add any approved member who isn't placed yet.
    Each action writes one row immediately (RLS restricts writes to admins),
    so there's no save step and a dropped connection can't half-apply a batch. */
const LEVEL_ORDER: Record<string, number> = { R1: 1, R2: 2, R3: 3, R4: 4, F1: 5, F2: 6 };
function TeamRosterEditor({ kind, onClose }: { kind: "stable" | "weekly"; onClose: () => void }) {
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
      const [ps, saved] = await Promise.all([
        listProfiles(),
        kind === "stable" ? getStableTeams() : getWeeklyTeams().then((r) => r.teams),
      ]);
      // test accounts (duplicate sign-ins, demo Googles) never belong on
      // review-poll teams — keep them out of the editor entirely
      setProfiles(ps.filter((p) => p.status === "approved" && p.role !== "test"));
      setTeams(saved);
      setLoading(false);
    })();
  }, [kind]);

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
    const ok = kind === "stable" ? await setStableTeam(pid, team) : await setWeeklyTeam(pid, team);
    if (ok) setTeams((t) => ({ ...t, [pid]: team }));
    else setFailedId(pid);
    setBusyId(null);
  };
  const remove = async (pid: string) => {
    setBusyId(pid); setFailedId(null);
    const ok = kind === "stable" ? await removeStableTeam(pid) : await removeWeeklyTeam(pid);
    if (ok) setTeams((t) => { const next = { ...t }; delete next[pid]; return next; });
    else setFailedId(pid);
    setBusyId(null);
  };
  const addTeam = () => {
    const nums = teamNames.map((n) => parseInt(n.replace(/\D+/g, ""), 10)).filter((n) => !isNaN(n));
    setExtraTeams((x) => [...x, `Team ${(nums.length ? Math.max(...nums) : 0) + 1}`]);
  };

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of profiles) {
      const name = p.full_name?.trim().toLocaleLowerCase();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
  }, [profiles]);
  const label = (p: Profile) => {
    if (!p.full_name) return p.email;
    return duplicateNames.has(p.full_name.trim().toLocaleLowerCase()) ? `${p.full_name} · ${p.email}` : p.full_name;
  };
  const tag = (p: Profile) => p.training_level ?? p.role;

  return (
    <div data-scrim style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 560 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>{kind === "stable" ? "Season poll teams" : "This week's mixer teams"}</div>
            <div style={s.apTitle}>{kind === "stable" ? "Edit rosters" : "Edit pairings"}</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.apBody}>
          <p style={{ ...s.apEmpty, marginBottom: 14 }}>
            Changes save instantly. Drag someone onto a team (or pick one from their dropdown) to move them; ✕ — or dragging them onto the "not on a team" list — takes them off {kind === "stable" ? "the season roster" : "this week's pairing"} without changing their account access. Duplicate names show their email so you can remove the right profile.
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
                      <button style={s.teamEdRemove} onClick={() => remove(p.id)} disabled={busyId === p.id} title={kind === "stable" ? "Remove from the season roster" : "Remove from this week's pairing (keeps account access)"}>
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

/* Fabricated final standings for a 30-question session with UNEVEN teams —
   4s, 3s and 2s mixed, which is what a real didactics room looks like once
   people no-show. Reached at ?demoStandings=1. Unlisted but shipped, so the
   scoring rules can be shown to a room without hosting a live session; all
   data here is invented, nothing touches the bank or the database.

   Numbers follow the real scoring rule: a question counts once per team
   however many members answer it, so a split team earns the fraction that were
   right — hence the .25/.5/.75s. Every question after a team joins counts,
   including questions where nobody answers; the few lower `answered` totals
   represent teams that joined the session late, not skipped answers. This data
   is chosen so the two ranking metrics genuinely disagree: the late-arriving
   2-player Team 4 tops the accuracy board but sits 3rd on raw points. */
const DEMO_STANDINGS: TeamStanding[] = [
  { team: "Team 1", members: 4, answerers: 4, answered: 30, correct: 21.5, score: 21.5 },
  { team: "Team 2", members: 4, answerers: 4, answered: 30, correct: 20, score: 20 },
  { team: "Team 3", members: 3, answerers: 3, answered: 30, correct: 22.5, score: 22.5 },
  { team: "Team 4", members: 2, answerers: 2, answered: 27, correct: 22, score: 22 },
  { team: "Team 5", members: 4, answerers: 3, answered: 30, correct: 17.25, score: 17.25 },
  { team: "Team 6", members: 3, answerers: 2, answered: 29, correct: 19.75, score: 19.75 },
  { team: "Team 7", members: 2, answerers: 2, answered: 26, correct: 15.5, score: 15.5 },
  { team: "Team 8", members: 4, answerers: 4, answered: 30, correct: 23.75, score: 23.75 },
];

function DemoStandings() {
  const [rankByTotal, setRankByTotal] = useState(false);
  const pct = (t: TeamStanding) => (t.answered > 0 ? t.correct / t.answered : 0);
  const players = DEMO_STANDINGS.reduce((n, t) => n + t.members, 0);
  const standings = [...DEMO_STANDINGS].sort((a, b) =>
    rankByTotal
      ? b.correct - a.correct || pct(b) - pct(a) || a.team.localeCompare(b.team)
      : pct(b) - pct(a) || b.correct - a.correct || a.team.localeCompare(b.team));
  return (
    <div style={{ ...s.pollRoot, position: "static", minHeight: "100vh" }}>
      <style>{CSS}</style>
      <div style={s.pollBody}>
        <div style={s.pollMeta}>Session complete · 30 questions · {players} participants</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <p style={s.pollStem}>Final standings</p>
          <button style={s.pollBtn} onClick={() => setRankByTotal((v) => !v)}>
            <Trophy size={14} strokeWidth={2.3} /> {rankByTotal ? "Ranked by points → switch to % correct" : "Ranked by % correct → switch to points"}
          </button>
        </div>
        <div style={s.pollStats}>
          {standings.map((t, i) => (
            <div key={t.team} style={{ ...s.teamRow, ...(i === 0 ? s.teamRowLead : {}) }}>
              <span style={s.teamRank}>{i === 0 ? <Crown size={20} strokeWidth={2.4} color="#f2c14e" /> : i + 1}</span>
              <span style={s.teamName}>{t.team}</span>
              <span style={s.teamMembers}>{teamDetail(t)}</span>
              <span style={s.teamScore}>{rankByTotal ? `${fmtScore(t.score)} pts` : `${Math.round((t.correct / t.answered) * 100)}%`}</span>
            </div>
          ))}
        </div>
        <p style={s.scoringNote}>{SCORING_NOTE}</p>
      </div>
    </div>
  );
}

/** Sort team names naturally, so "Team 10" follows "Team 9" rather than "Team 1". */
function compareTeamNames(a: string, b: string): number {
  const na = /^team\s*(\d+)$/i.exec(a), nb = /^team\s*(\d+)$/i.exec(b);
  if (na && nb) return Number(na[1]) - Number(nb[1]);
  if (na) return -1;
  if (nb) return 1;
  return a.localeCompare(b);
}

function PollPresenter({ code, set, startIndex, timerSecs, onTimerSecsChange, teamMode, rosterTeams = [], onClose }: {
  code: string; set: RawQuestion[]; startIndex: number; timerSecs: number; onTimerSecsChange: (n: number) => void; teamMode: TeamMode;
  /** Team names this session's roster defines (stable/weekly modes), so guests
      can pick from the real list instead of typing a name from the screen. */
  rosterTeams?: string[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(Math.max(0, Math.min(startIndex, set.length - 1)));
  const [revealed, setRevealed] = useState(false);
  // Epoch ms when a pending reveal actually locks in — set by startReveal(),
  // cleared once it fires (see the effect below) or when the question changes.
  // Phones show a countdown for this window; voting stays open the whole
  // time since `revealed` itself doesn't flip until it elapses.
  const [revealAt, setRevealAt] = useState<number | null>(null);
  const startReveal = () => { if (revealed || revealAt) return; setRevealAt(Date.now() + REVEAL_DELAY_MS); };
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
  // Timer starts only after the gif has loaded so a slow/heavy file doesn't
  // flash a frozen first frame and then cut to standings mid-download.
  const [drumrollGif, setDrumrollGif] = useState<string | null>(null);
  const [drumrollReady, setDrumrollReady] = useState(false);
  // Bumps on each Finish so React remounts the <img> and the gif restarts from
  // frame 0. Keeps the URL stable so the prefetched browser cache still hits.
  const [drumrollKey, setDrumrollKey] = useState(0);
  const closeQuestionRef = useRef<() => void>(() => {});
  const finishPoll = () => {
    // Finish is also a hard close for the live question. Lock it before the
    // drumroll so delayed/replayed Realtime messages cannot change the result.
    closeQuestionRef.current();
    setRevealAt(null);
    setRevealed(true);
    setDrumrollReady(false);
    setDrumrollKey((k) => k + 1);
    setDrumrollGif(nextPollDrumrollGif());
  };
  // Prefetch the celebration pool while the host is running the poll so Finish
  // is almost always instant and animated.
  useEffect(() => { prefetchPollDrumrollGifs(); }, []);
  useEffect(() => {
    if (!drumrollGif || !drumrollReady) return;
    const t = setTimeout(() => { setDrumrollGif(null); setDrumrollReady(false); setFinished(true); }, 2800);
    return () => clearTimeout(t);
  }, [drumrollGif, drumrollReady]);
  // Safety: if the gif never loads (blocked CDN, offline), don't trap the host.
  useEffect(() => {
    if (!drumrollGif || drumrollReady) return;
    const t = setTimeout(() => { setDrumrollGif(null); setDrumrollReady(false); setFinished(true); }, 6000);
    return () => clearTimeout(t);
  }, [drumrollGif, drumrollReady]);
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
  // The team attached to each accepted vote is snapshotted with that vote. A
  // later roster/team change must not move an already-closed answer between
  // teams or rewrite prior standings.
  const voteTeamsRef = useRef<Map<string, Map<string, string>>>(new Map()); // qid -> voter -> team at vote time
  const teamRef = useRef<Map<string, string>>(new Map());   // voter -> team name
  const levelRef = useRef<Map<string, string>>(new Map());  // voter -> PGY year (R1–R4), if known
  const nameRef = useRef<Map<string, string>>(new Map());   // voter -> display name, for the individual leaderboard
  const joinedRef = useRef<Set<string>>(new Set());  // every voter who has said hello or voted
  const correctRef = useRef<Map<string, string[]>>(new Map()); // CLOSED qid -> correct letters
  // Historical context per qid — prefetched so guests get the Context chip
  // after reveal without needing approved DB access of their own.
  const contextRef = useRef<Map<string, string>>(new Map());
  const closedTeamsRef = useRef<Map<string, Set<string>>>(new Map()); // qid -> teams active when it closed
  const closedRef = useRef<Set<string>>(new Set()); // authoritative immutable-question boundary
  const sessionMembersRef = useRef<Map<string, Set<string>>>(new Map()); // team -> people ever assigned during session
  const currentQidRef = useRef("");
  const currentCorrectRef = useRef<string[]>([]);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);
  const chanRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);

  // Cumulative team leaderboard. The whole team scores as one entity —
  // everyone's votes pool together — but the default RANKING is team
  // accuracy (pooled correct ÷ pooled answers), so a bigger team can't win
  // just by casting more votes: 40/60 (67%) loses to 18/24 (75%). Ties break
  // on total correct, so among equal accuracies the bigger body of work
  // wins. The host can toggle to the raw total-correct ranking (rankByTotal).
  // Derived fresh from the raw vote log each call, so it's idempotent
  // (re-reveals and re-renders never double-count).
  const computeStandings = (): TeamStanding[] =>
    computeTeamStandings({
      sessionMembers: sessionMembersRef.current,
      closedTeams: closedTeamsRef.current,
      correctByQ: correctRef.current,
      votesByQ: votesRef.current,
      voteTeamsByQ: voteTeamsRef.current,
      rankByTotal,
    });

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
  currentQidRef.current = qid;
  currentCorrectRef.current = correctSet;
  startedRef.current = started;
  finishedRef.current = finished;

  const rememberTeam = (voter: string, team?: string) => {
    if (!team) return;
    teamRef.current.set(voter, team);
    const members = sessionMembersRef.current.get(team) ?? new Set<string>();
    members.add(voter);
    sessionMembersRef.current.set(team, members);
  };

  // This is the authoritative close, not merely a disabled button on phones.
  // It snapshots the active teams for the no-answer denominator and makes the
  // qid immutable before React state/broadcasts have time to settle.
  closeQuestionRef.current = () => {
    const closingQid = currentQidRef.current;
    if (!closingQid || closedRef.current.has(closingQid)) return;
    const voteTeams = voteTeamsRef.current.get(closingQid);
    const activeTeams = new Set<string>([...teamRef.current.values()].filter(Boolean));
    for (const team of voteTeams?.values() ?? []) if (team) activeTeams.add(team);
    closedTeamsRef.current.set(closingQid, activeTeams);
    correctRef.current.set(closingQid, [...currentCorrectRef.current]);
    closedRef.current.add(closingQid);
  };

  const broadcastRef = useRef<() => void>(() => {});
  broadcastRef.current = () => {
    const payload: PollState = {
      qid, year: q?.year ?? "", qIndex: q?.q_index ?? 0,
      nOptions: q?.options.length ?? 0,
      options: q?.options.map((o) => ({ letter: o.letter, text: o.text })) ?? [],
      stem: q?.stem ?? "",
      index, total, multiSelect: q?.multi_select ?? false,
      requiredSelections: q?.multi_select ? correctSet.length : 1,
      revealed,
      revealAt: revealed ? undefined : revealAt ?? undefined,
      correct: revealed ? correctSet : [],
      // Only after reveal — guests have no local bank, so this is how they get
      // the explanation section + study extras on their phone once the answer
      // is shown.
      explanation_text: revealed ? (q?.explanation_text ?? "") : undefined,
      explanation_images: revealed ? (q?.explanation_images ?? []) : undefined,
      clinical_application: revealed ? (q?.clinical_application ?? "") : undefined,
      video_query: revealed ? (q?.video_query ?? "") : undefined,
      answer_text: revealed ? (q?.answer_text ?? "") : undefined,
      context: revealed ? (contextRef.current.get(qid) ?? "") : undefined,
      standings: computeStandings(),
      // Union of the roster's teams and any team a participant has actually
      // announced — covers self-named teams and auto-assign, where there is no
      // roster to read from.
      teams: [...new Set([...rosterTeams, ...teamRef.current.values()].filter(Boolean))].sort(compareTeamNames),
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
      // Realtime Broadcast is intentionally permissive; the host owns the
      // result. Only the current, started, still-open question may mutate.
      if (!shouldAcceptPollVote({
        started: startedRef.current, finished: finishedRef.current,
        voteQid: v.qid, currentQid: currentQidRef.current, closed: closedRef.current,
      })) return;
      let m = votesRef.current.get(v.qid);
      if (!m) { m = new Map(); votesRef.current.set(v.qid, m); }
      m.set(v.voter, v.choice);
      let voteTeams = voteTeamsRef.current.get(v.qid);
      if (!voteTeams) { voteTeams = new Map(); voteTeamsRef.current.set(v.qid, voteTeams); }
      const voteTeam = v.team || teamRef.current.get(v.voter);
      if (voteTeam) voteTeams.set(v.voter, voteTeam);
      joinedRef.current.add(v.voter);
      rememberTeam(v.voter, voteTeam);
      if (v.level) levelRef.current.set(v.voter, v.level);
      if (v.name) nameRef.current.set(v.voter, v.name);
      force((n) => n + 1);
      broadcastRef.current(); // keep participants' voted/joined counters live
    });
    ch.on("broadcast", { event: POLL_EVENTS.hello }, ({ payload }: { payload: PollHello }) => {
      if (payload?.voter) {
        joinedRef.current.add(payload.voter);
        rememberTeam(payload.voter, payload.team);
        // A team change while the current question is still open moves that
        // person's current answer too. Once closed, neither can rewrite it.
        if (payload.team && !closedRef.current.has(currentQidRef.current) && votesRef.current.get(currentQidRef.current)?.has(payload.voter)) {
          let voteTeams = voteTeamsRef.current.get(currentQidRef.current);
          if (!voteTeams) { voteTeams = new Map(); voteTeamsRef.current.set(currentQidRef.current, voteTeams); }
          voteTeams.set(payload.voter, payload.team);
        }
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
  useEffect(() => { broadcastRef.current(); }, [index, revealed, revealAt, finished, started, rankByTotal]); // eslint-disable-line

  // Prefetch historical context for the live question so the post-reveal
  // broadcast can include it for guests (they can't read question_context).
  useEffect(() => {
    if (!qid || contextRef.current.has(qid)) return;
    let alive = true;
    getQuestionContext(qid).then((c) => {
      if (!alive) return;
      contextRef.current.set(qid, c ?? "");
      // Re-send once revealed so phones that already got an empty context
      // pick up the blurb when it lands.
      if (revealed) broadcastRef.current();
    });
    return () => { alive = false; };
  }, [qid, revealed]); // eslint-disable-line

  // per-question countdown; starts the reveal countdown when it hits zero (never runs in the lobby)
  useEffect(() => {
    if (revealed || finished || !q || !started) { setTimeLeft(null); return; }
    setTimeLeft(timerSecs);
    const id = setInterval(() => setTimeLeft((t) => (t == null ? t : t <= 1 ? 0 : t - 1)), 1000);
    return () => clearInterval(id);
  }, [index, revealed, finished, started, timerSecs, q?.year, q?.q_index]); // eslint-disable-line
  useEffect(() => { if (timeLeft === 0 && !revealed) startReveal(); }, [timeLeft, revealed]); // eslint-disable-line

  // Fires the actual reveal REVEAL_DELAY_MS after startReveal() sets revealAt —
  // gives everyone's phone a countdown instead of an instant lock.
  useEffect(() => {
    if (!revealAt) return;
    const ms = Math.max(0, revealAt - Date.now());
    const t = setTimeout(() => {
      closeQuestionRef.current();
      setRevealed(true);
      setRevealAt(null);
    }, ms);
    return () => clearTimeout(t);
  }, [revealAt]);
  // Ticks the host's "Revealing in N…" button text while the countdown runs.
  useEffect(() => {
    if (!revealAt) return;
    const id = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [revealAt]);

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
  const goTo = (i: number) => {
    closeQuestionRef.current();
    const nextIndex = Math.max(0, Math.min(i, total - 1));
    const next = set[nextIndex];
    const nextQid = next ? questionId(next.year, next.q_index) : "";
    setRevealed(closedRef.current.has(nextQid));
    setRevealAt(null); setShowExpl(false); setPeekStandings(false); setIndex(nextIndex);
  };
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
    for (const [voter, team] of Object.entries(assignments)) rememberTeam(voter, team);
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
                <button style={s.pollBtn} onClick={() => setRankByTotal((v) => !v)} title={rankByTotal ? "Switch to accuracy — % of the team's answers that were correct (fair to smaller teams)" : "Switch to points — raw total correct, which favors bigger teams"}>
                  <Trophy size={14} strokeWidth={2.3} /> {rankByTotal ? "Ranked by points → switch to % correct" : "Ranked by % correct → switch to points"}
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
              <>
                <div style={s.pollStats}>
                  {standings.map((t, i) => (
                    <div key={t.team} style={{ ...s.teamRow, ...(i === 0 ? s.teamRowLead : {}) }}>
                      <span style={s.teamRank}>{i === 0 ? <Crown size={20} strokeWidth={2.4} color="#f2c14e" /> : i + 1}</span>
                      <span style={s.teamName}>{t.team}</span>
                      <span style={s.teamMembers}>{teamDetail(t)}</span>
                      <span style={s.teamScore}>{rankByTotal ? `${fmtScore(t.score)} pts` : `${t.answered > 0 ? Math.round((t.correct / t.answered) * 100) : 0}%`}</span>
                    </div>
                  ))}
                </div>
                <p style={s.scoringNote}>{SCORING_NOTE}</p>
              </>
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
                                <ExplanationText text={qq.explanation_text} accent="#8fd9b6" style={{ margin: "0 0 10px", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: standingsFontSize, lineHeight: 1.6, color: "#aeb4c0" }} />
                              )}
                              {qq.explanation_images.filter((p) => imgSrc(p)).map((p, i) => (
                                <AuditedQuestionImage
                                  key={i} q={qq} path={p} kind="explanation" index={i} alt="explanation"
                                  onZoom={setZoomImg} dark
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
                    <button style={s.pollStatsExport} onClick={() => setRankByTotal((v) => !v)} title={rankByTotal ? "Switch to accuracy — % of the team's answers that were correct (fair to smaller teams)" : "Switch to points — raw total correct, which favors bigger teams"}>
                      <Trophy size={14} strokeWidth={2.3} /> {rankByTotal ? "Switch to % correct" : "Switch to points"}
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
                      <span style={s.teamMembers}>{teamDetail(t)}</span>
                      <span style={s.teamScore}>{rankByTotal ? `${fmtScore(t.score)} pts` : `${t.answered > 0 ? Math.round((t.correct / t.answered) * 100) : 0}%`}</span>
                    </div>
                  ))}
              {!isIndividualMode && standings.length > 0 && <p style={s.scoringNote}>{SCORING_NOTE}</p>}
            </div>
          ) : (
            <button style={{ ...s.pollBtn, marginBottom: 14 }} onClick={() => setPeekStandings(true)} title="Peek at the leaderboard — hides again on the next question">
              <Trophy size={15} strokeWidth={2.3} /> Show current standings
            </button>
          )
        )}
        <div style={s.pollMeta}>
          {q.year} · Q{q.q_index} · Question {index + 1} of {total}
          {q.multi_select && <span style={{ ...s.multiTag, marginLeft: 10 }}><ListChecks size={12} strokeWidth={2.2} /> Select {correctSet.length} answers</span>}
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
              <ExplanationText text={q.explanation_text} style={{ margin: 0, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: `calc(clamp(16px, 1.7vw, 22px) * ${pollStemScale})`, lineHeight: 1.6, color: "#dfe3ea" }} />
            )}
            {q.explanation_images.filter((p) => imgSrc(p)).map((p, i) => (
              <AuditedQuestionImage
                key={i} q={q} path={p} kind="explanation" index={i} alt="explanation"
                onZoom={setZoomImg} dark
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
          <button style={{ ...s.pollBtn, ...s.pollBtnPrimary }} disabled={!!revealAt} onClick={startReveal}>
            <Check size={16} strokeWidth={2.6} /> {revealAt ? `Revealing in ${Math.max(1, Math.ceil((revealAt - Date.now()) / 1000))}…` : "Reveal answer"}
          </button>
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
        <ZoomLightbox src={zoomImg} alt="Explanation, enlarged" onClose={() => setZoomImg(null)} />
      )}

      {drumrollGif && (
        <div
          style={{
            ...s.qrOverlay,
            zIndex: 96,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
            cursor: "pointer",
            padding: "min(4vh, 32px) min(3vw, 24px)",
          }}
          onClick={() => { setDrumrollGif(null); setDrumrollReady(false); setFinished(true); }}
          title="Tap to skip"
        >
          {/* Giphy originals are often only 200–500px wide. Force a large display
              box and let object-fit scale the gif UP so it fills a classroom
              projector / desktop, instead of sitting as a tiny native-size image. */}
          <img
            key={drumrollKey}
            src={drumrollGif}
            alt=""
            onLoad={() => setDrumrollReady(true)}
            onError={() => { setDrumrollGif(null); setDrumrollReady(false); setFinished(true); }}
            style={{
              width: "min(92vw, 1100px)",
              height: "min(78vh, 720px)",
              maxWidth: "92vw",
              maxHeight: "78vh",
              objectFit: "contain",
              borderRadius: 18,
              boxShadow: "0 40px 100px -20px rgba(0,0,0,.75)",
              background: "rgba(0,0,0,.25)",
              opacity: drumrollReady ? 1 : 0.35,
              transition: "opacity .2s ease",
            }}
          />
          <span style={{ color: "#fff", fontSize: "clamp(22px, 3.2vw, 40px)", fontWeight: 800, letterSpacing: 0.3 }}>
            {drumrollReady ? "🥁 And the standings are…" : "🥁 Drumroll…"}
          </span>
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

// Curated podcast episodes for this question's concept, matched offline (see
// scripts/podcasts/). Renders nothing when nothing matched confidently, which
// is the common case — most of the bank has no episode worth sending someone
// to, and a near-miss recommendation costs more time than none at all.
// Tier "related" is looser background teaching on the same topic (not a direct
// concept hit) and is labeled accordingly in the UI.
function PodcastPicks({ q, extraKeys = [], dark = false }: { q: RawQuestion; extraKeys?: string[]; dark?: boolean }) {
  const [refs, setRefs] = useState<PodcastRef[] | null>(null);
  useEffect(() => {
    let live = true;
    getPodcastRefs(q.year, q.q_index, extraKeys).then((r) => { if (live) setRefs(r); });
    return () => { live = false; };
  }, [q.year, q.q_index, extraKeys.join("|")]); // eslint-disable-line

  if (!refs?.length) return null;
  const allRelated = refs.every((r) => r.tier === "related");
  const hasLecture = refs.some((r) => r.kind === "lecture");
  const allLecture = refs.every((r) => r.kind === "lecture");
  const heading = allRelated
    ? (allLecture ? "Related lecture on this topic" : hasLecture ? "Related teaching on this topic" : "Related podcast on this topic")
    : allLecture ? "Lectures on this topic"
      : hasLecture ? "Podcasts & lectures on this topic"
        : "Podcast episodes on this topic";
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={dark ? s.podcastLblDark : s.lbl}>
        <Headphones size={12} strokeWidth={2.2} style={{ verticalAlign: -2, marginRight: 5 }} />
        {heading}
      </label>
      {refs.map((r) => (
        <a
          key={r.videoId}
          style={dark ? s.podcastItemDark : s.podcastItem}
          href={podcastUrl(r)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={dark ? s.podcastMetaDark : s.podcastMeta}>
              {r.tier === "related" ? "Related · " : ""}
              {r.channel} · {Math.round(r.durationSec / 60)} min
            </div>
            <div style={dark ? s.podcastTitleDark : s.podcastTitle}>{r.title}</div>
            {r.why && <div style={dark ? s.podcastWhyDark : s.podcastWhy}>{r.why}</div>}
            {r.startSec != null && (
              <div style={s.podcastChapter}>
                <Play size={10} strokeWidth={2.6} style={{ verticalAlign: -1, marginRight: 4 }} />
                Starts at {formatTimestamp(r.startSec)}
                {r.chapterTitle ? ` · ${r.chapterTitle}` : ""}
              </div>
            )}
          </div>
          <ExternalLink size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
        </a>
      ))}
    </div>
  );
}

const TEAM_KEY = "prite_poll_team";
const STEM_OPEN_KEY = "prite.poll.stemOpen"; // participant's "show question text" preference, kept for the whole poll

// Thin RawQuestion rebuilt from a poll broadcast / history snapshot so guests
// (no private bank) can still open PollExtras, export missed PDFs, etc.
function syntheticPollQuestion(p: {
  year?: string;
  qIndex?: number;
  stem?: string;
  options?: { letter: string; text: string }[];
  correct?: string[];
  multiSelect?: boolean;
  explanation_text?: string;
  explanation_images?: string[];
  clinical_application?: string;
  video_query?: string;
  answer_text?: string;
}): RawQuestion {
  const correct = p.correct ?? [];
  return {
    deck: "",
    year: p.year ?? "",
    q_index: p.qIndex ?? 0,
    slide_number: 0,
    stem: p.stem ?? "",
    options: p.options ?? [],
    answer_letter: correct[0] ?? null,
    answer_letters: correct,
    multi_select: p.multiSelect ?? correct.length > 1,
    answer_text: p.answer_text ?? "",
    answer_source: "",
    answer_raw: "",
    explanation_text: p.explanation_text ?? "",
    figure_images: [],
    explanation_images: p.explanation_images ?? [],
    clinical_application: p.clinical_application || undefined,
    video_query: p.video_query || undefined,
    flags: [],
  };
}

// Extra study material for a revealed poll question, as tap-to-open chips
// inside the answer box: the "in practice" scenario, historical context
// (fetched on demand, or supplied by the host broadcast for guests), a
// YouTube search, and an "Ask AI" launcher that opens an external chatbot
// in a NEW tab — so a participant can dig deeper without leaving the poll.
// Works for guests when `q` is a syntheticPollQuestion + optional contextText.
function PollExtras({ q, contextText }: { q: RawQuestion; contextText?: string }) {
  const [open, setOpen] = useState<null | "practice" | "context" | "video" | "ai">(null);
  const [ctx, setCtx] = useState<string | null>(null);
  const [ctxLoaded, setCtxLoaded] = useState(false);
  const [aiNote, setAiNote] = useState("");
  const toggle = (k: NonNullable<typeof open>) => setOpen((cur) => (cur === k ? null : k));
  // Reset cached context when the question (or host-supplied blurb) changes.
  useEffect(() => { setCtx(null); setCtxLoaded(false); }, [q.year, q.q_index, contextText]);
  useEffect(() => {
    if (open === "context" && !ctxLoaded) {
      setCtxLoaded(true);
      // Guests get the blurb from the host broadcast (no approved DB access).
      if (contextText !== undefined) {
        setCtx(contextText);
        return;
      }
      getQuestionContext(questionId(q.year, q.q_index)).then((c) => setCtx(c ?? ""));
    }
  }, [open, ctxLoaded, q, contextText]);
  const chip = (k: NonNullable<typeof open>, label: string, icon: React.ReactNode, show = true) => show ? (
    <button style={{ ...s.pollExtraChip, ...(open === k ? s.pollExtraChipOn : {}) }} onClick={() => toggle(k)}>{icon} {label}</button>
  ) : null;
  const videoQuery = q.video_query || `${q.answer_text || ""} psychiatry`.trim();
  return (
    <div style={{ marginTop: 12 }}>
      <div style={s.pollExtraChips}>
        {chip("practice", "In practice", <Stethoscope size={12} strokeWidth={2.3} />, !!q.clinical_application)}
        {chip("context", "Context", <Lightbulb size={12} strokeWidth={2.3} />)}
        {chip("video", "Video and podcasts", <Youtube size={12} strokeWidth={2.3} />)}
        {chip("ai", "Ask AI", <Sparkles size={12} strokeWidth={2.3} />)}
      </div>
      {open === "practice" && (
        <>
          <ScenarioIllustration year={q.year} qIndex={q.q_index} maxWidth={300} />
          <p style={s.pollExtraBody}>{q.clinical_application}</p>
        </>
      )}
      {open === "context" && (
        <p style={s.pollExtraBody}>{!ctxLoaded || ctx === null ? "Loading…" : ctx || "No extra context has been written for this question yet."}</p>
      )}
      {open === "video" && (
        <>
        <PodcastPicks q={q} dark />
        <a style={s.pollExtraVideo} href={`https://www.youtube.com/results?search_query=${encodeURIComponent(videoQuery)}`} target="_blank" rel="noopener noreferrer">
          <Youtube size={16} strokeWidth={2} /> <span style={{ flex: 1 }}>Search YouTube for <b style={{ color: "#fff" }}>{videoQuery}</b></span> <ExternalLink size={13} strokeWidth={2} />
        </a>
        </>
      )}
      {open === "ai" && (
        <div style={s.pollExtraBody}>
          <div style={{ fontSize: 12, color: "#9aa0ab", marginBottom: 8 }}>Opens in a new tab — the poll stays right here.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {AI_TARGETS.map((t) => (
              <button key={t.key} style={s.pollAiTarget} onClick={() => {
                void launchAiTarget(t, askAiPrompt(q, "explain", true), openBgTab).then((copied) => {
                  if (t.copiesPrompt) setAiNote(copied
                    ? "Full question copied — paste it into OpenEvidence."
                    : "OpenEvidence opened — copy and paste the question to ask it.");
                });
              }}>
                {t.label} <ExternalLink size={11} strokeWidth={2.2} />
              </button>
            ))}
          </div>
          {aiNote && <div style={{ marginTop: 8, fontSize: 12, color: "#b9c4cf" }}>{aiNote}</div>}
        </div>
      )}
    </div>
  );
}

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
  // whoever can't see the screen well. It used to collapse on every new
  // question, which meant re-opening it 20+ times in one session; someone who
  // can't see the big screen wants it open for the whole poll, so the choice
  // now sticks (and survives a page reload / rejoin).
  const [stemOpen, setStemOpen] = useState(() => {
    try { return localStorage.getItem(STEM_OPEN_KEY) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(STEM_OPEN_KEY, stemOpen ? "1" : "0"); } catch { /* private mode */ }
  }, [stemOpen]);
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
  // their full explanation) while the live question is still on the clock.
  // Stem/options/explanation/extras are cached from the broadcast so guests
  // (no local bank) can still review, export, and use PollExtras after reveal.
  type PollHistory = {
    correct: string[];
    myChoice: string[] | null;
    index: number;
    year?: string;
    qIndex?: number;
    stem?: string;
    options?: { letter: string; text: string }[];
    multiSelect?: boolean;
    explanation_text?: string;
    explanation_images?: string[];
    clinical_application?: string;
    video_query?: string;
    answer_text?: string;
    context?: string;
  };
  const historyRef = useRef<Map<string, PollHistory>>(new Map());
  const [reviewQid, setReviewQid] = useState<string | null>(null); // set while browsing a past question instead of the live one
  const recordedRef = useRef<Set<string>>(new Set()); // qids already persisted to poll_answers, so a re-broadcast doesn't double-insert
  // Bump when history changes so finish-screen personal stats / buttons re-render
  // (historyRef itself is a ref and wouldn't otherwise trigger a paint).
  const [, bumpHistory] = useState(0);
  // Seconds left in the "revealing the answer" countdown (see remote.revealAt),
  // ticked locally off the wall clock so the phone doesn't need a broadcast
  // every second. Null when no countdown is running.
  const [revealCountdown, setRevealCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (!remote?.revealAt || remote.revealed) { setRevealCountdown(null); return; }
    const tick = () => setRevealCountdown(Math.max(0, Math.ceil((remote.revealAt! - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [remote?.revealAt, remote?.revealed]);

  // Treat the host-announced cutoff as closed locally even if the follow-up
  // `revealed` broadcast is still in flight. The host enforces this too; this
  // guard keeps the phone from optimistically displaying a rejected change.
  const votingClosed = !!remote && (
    remote.revealed || (!!remote.revealAt && Date.now() >= remote.revealAt)
  );

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
      // Reset synchronously before processing a newly-arrived qid. This matters
      // when the host revisits an already-closed question: the vote from the
      // question we just left must never be recorded against the old one.
      if (payload.qid !== lastQid.current) {
        lastQid.current = payload.qid;
        setMyVote(null); myVoteRef.current = null; setPendingPicks([]); setReviewQid(null);
      }
      if (payload.revealed && payload.qid) {
        const prev = historyRef.current.get(payload.qid);
        // Keep the first myChoice we snapshotted for this qid (re-broadcasts
        // after vote-count updates arrive with myVote already cleared on the
        // next question, but while still on this one myVoteRef is stable).
        historyRef.current.set(payload.qid, {
          correct: payload.correct,
          myChoice: prev?.myChoice ?? myVoteRef.current,
          index: payload.index,
          year: payload.year,
          qIndex: payload.qIndex,
          stem: payload.stem,
          options: payload.options,
          multiSelect: payload.multiSelect,
          explanation_text: payload.explanation_text,
          explanation_images: payload.explanation_images,
          clinical_application: payload.clinical_application,
          video_query: payload.video_query,
          answer_text: payload.answer_text,
          context: payload.context,
        });
        bumpHistory((n) => n + 1);
        const choice = prev?.myChoice ?? myVoteRef.current;
        const gotIt = !!choice && pickIsCorrect(choice, payload.correct);
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
        // Guests have no account: write a device-local session ledger instead
        // so they still get personal answer stats for this poll.
        if (!recordedRef.current.has(payload.qid) && choice?.length) {
          recordedRef.current.add(payload.qid);
          if (!guest && voter !== "anon") {
            recordPollAnswer({
              question_id: payload.qid,
              poll_code: code,
              team: teamRef.current || null,
              choice: choice.slice().sort().join(","),
              correct: gotIt,
            });
          } else if (guest) {
            recordGuestPollAnswer({
              poll_code: code,
              question_id: payload.qid,
              team: teamRef.current || null,
              correct: gotIt,
            });
          }
        }
      }
      setRemote(payload);
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
  // whatever I last typed in for a self/auto session. Fetch live so an
  // admin edit (or being taken off this week's list) wins over a stale
  // prop / leftover localStorage team.
  const [liveWeekly, setLiveWeekly] = useState<string | null | undefined>(undefined);
  const [liveStable, setLiveStable] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (guest) return;
    let alive = true;
    getWeeklyTeams().then((r) => { if (alive) setLiveWeekly(r.teams[voter] ?? null); });
    getStableTeams().then((r) => { if (alive) setLiveStable(r[voter] ?? null); });
    return () => { alive = false; };
  }, [guest, voter]);
  useEffect(() => {
    if (guest) return;
    const mode = remote?.teamMode;
    if (mode !== "stable" && mode !== "weekly") return;
    const live = mode === "weekly" ? liveWeekly : liveStable;
    const fallback = mode === "weekly" ? weeklyTeam : stableTeam;
    const rostered = live !== undefined ? live : fallback;
    if (rostered && team !== rostered) saveTeam(rostered);
    else if (live === null && team) saveTeam("");
  }, [remote?.teamMode, liveWeekly, liveStable, stableTeam, weeklyTeam]); // eslint-disable-line

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
    if (!remote || remote.revealed || (!!remote.revealAt && Date.now() >= remote.revealAt) || !letters.length) return;
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
    if (!remote || votingClosed || myVote) return;
    setPendingPicks((cur) => (cur.includes(letter) ? cur.filter((l) => l !== letter) : [...cur, letter]));
  };
  const submitPending = () => {
    if (!pendingPicks.length) return;
    if (remote?.requiredSelections && pendingPicks.length !== remote.requiredSelections) return;
    castVote(pendingPicks);
  };

  // Rebuild a question for export / extras: bank first, else the host snapshot.
  const questionFromHistory = (qid: string, h: PollHistory): RawQuestion | null => {
    const bank = byId.get(qid);
    if (bank) return bank;
    if (!h.stem && !(h.options?.length)) return null;
    return syntheticPollQuestion({
      year: h.year,
      qIndex: h.qIndex,
      stem: h.stem,
      options: h.options,
      correct: h.correct,
      multiSelect: h.multiSelect,
      explanation_text: h.explanation_text,
      explanation_images: h.explanation_images,
      clinical_application: h.clinical_application,
      video_query: h.video_query,
      answer_text: h.answer_text,
    });
  };

  // Every question I saw revealed, that I either missed or never voted on —
  // bank when available, otherwise the host-broadcast snapshot (guests).
  const missedRows = () => {
    const rows: { q: RawQuestion; myChoice: string[] | null }[] = [];
    for (const [qid, h] of historyRef.current) {
      if (pickIsCorrect(h.myChoice ?? [], h.correct)) continue;
      const q = questionFromHistory(qid, h);
      if (q) rows.push({ q, myChoice: h.myChoice });
    }
    return rows;
  };

  // Session personal score from revealed history (works for guests + signed-in).
  const sessionPersonal = (() => {
    let answered = 0, correct = 0;
    for (const h of historyRef.current.values()) {
      if (!h.myChoice?.length) continue;
      answered++;
      if (pickIsCorrect(h.myChoice, h.correct)) correct++;
    }
    return { answered, correct, pct: answered ? Math.round((100 * correct) / answered) : 0 };
  })();

  // Persist this session's missed questions into the personal SM-2 review queue
  // (signed-in) or a device-local guest review pack (no account).
  const addMissedToReview = async () => {
    const rows = missedRows();
    if (!rows.length) return;
    setReviewAddState("saving");
    if (guest) {
      saveGuestReviewPack(rows.map((r) => ({
        q: r.q,
        myChoice: r.myChoice,
        poll_code: code,
        saved_at: new Date().toISOString(),
      })));
      setReviewAddState("done");
      return;
    }
    await Promise.all(rows.map(({ q }) => ensureTrackedForReview(questionId(q.year, q.q_index))));
    setReviewAddState("done");
  };

  const letters = remote ? Array.from({ length: remote.nOptions }, (_, i) => String.fromCharCode(65 + i)) : [];
  const isIndividualMode = remote?.teamMode === "individual";
  const isStableMode = remote?.teamMode === "stable" || remote?.teamMode === "weekly"; // both use a fixed saved roster
  const awaitingAutoAssign = remote?.teamMode === "auto" && !team;
  const awaitingStableTeam = isStableMode && !team && !guest;
  // Guests can always set a team — even in stable/weekly mode, where members
  // are locked to their saved roster seat (they have none).
  const showTeamEditor = !isIndividualMode && (!isStableMode || guest) && (editing || (!team && !awaitingAutoAssign));
  // Teams a guest can pick from: what the host broadcasts, falling back to the
  // teams visible in standings when hosting from an older build. Sorted so
  // "Team 10" doesn't sit between 1 and 2.
  const pickableTeams = useMemo(() => {
    const fromHost = remote?.teams ?? remote?.standings?.map((t) => t.team) ?? [];
    return [...new Set(fromHost.filter(Boolean))].sort(compareTeamNames);
  }, [remote?.teams, remote?.standings]);
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
              <div style={{ width: "100%" }}>
                {/* Guests pick from the session's real teams rather than typing
                    a name off the screen — a typo used to strand them in a team
                    of one that scored separately all session. Typing stays as
                    the fallback for a team not on the list yet. */}
                {guest && pickableTeams.length > 0 && (
                  <div style={s.teamPickWrap}>
                    <span style={s.teamPickLbl}><Users size={14} strokeWidth={2.3} /> Pick your team</span>
                    <div style={s.teamPickRow}>
                      {pickableTeams.map((t) => (
                        <button
                          key={t}
                          type="button"
                          style={{ ...s.teamPick, ...(team === t ? s.teamPickOn : {}) }}
                          onClick={() => saveTeam(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                    placeholder={
                      guest && pickableTeams.length > 0 ? "…or type another team"
                      : guest && isStableMode ? "Team from the screen (e.g. Team 3)"
                      : "Your team name"
                    }
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button type="submit" style={{ ...s.teamSet, ...(draft.trim() ? {} : s.teamSetOff) }} disabled={!draft.trim()}>
                    {team ? "Save" : "Join"}
                  </button>
                </form>
              </div>
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
          <p style={s.teamScoreHint}>{SCORING_NOTE_PARTICIPANT}</p>
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
              const rh = historyRef.current.get(reviewQid);
              if (!rh) return <p style={s.joinMsg}>That question isn't available to review.</p>;
              const bankQ = byId.get(reviewQid);
              const rq = questionFromHistory(reviewQid, rh);
              if (!rq) return <p style={s.joinMsg}>That question isn't available to review.</p>;
              const explText = rq.explanation_text ?? "";
              const explImgs = rq.explanation_images ?? [];
              const rCorrect = rh.correct ?? [];
              const rMine = rh.myChoice ?? [];
              const rGotIt = pickIsCorrect(rMine, rCorrect);
              return (
                <>
                  <div style={s.pollReviewHead}>
                    <span style={s.joinMsg}>Reviewing question {(rh.index ?? 0) + 1}</span>
                    <button style={s.teamChange} onClick={() => setReviewQid(null)}><RotateCcw size={13} strokeWidth={2.4} /> Back to live</button>
                  </div>
                  {rq.stem && <p style={s.joinMsg}>{rq.stem}</p>}
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
                  <div style={s.joinExplBox}>
                    <span style={s.joinExplLabel}><Lightbulb size={13} strokeWidth={2.3} /> Explanation</span>
                    {explText && <ExplanationText text={explText} accent="#8fd9b6" style={s.joinExpl} />}
                    {bankQ
                      ? explImgs.filter((src) => imgSrc(src)).map((src, i) => (
                          <AuditedQuestionImage key={i} q={bankQ} path={src} kind="explanation" index={i} alt="explanation" style={{ ...s.joinExplImg, cursor: "zoom-in" }} onZoom={setZoomImg} dark />
                        ))
                      : explImgs.filter((src) => imgSrc(src)).map((src, i) => (
                          <img key={i} src={imgSrc(src)} alt="explanation" style={{ ...s.joinExplImg, cursor: "zoom-in" }} loading="lazy" onClick={() => setZoomImg(imgSrc(src))} title="Click to enlarge" />
                        ))}
                    {!explText && explImgs.length === 0 && <p style={{ ...s.joinExpl, fontStyle: "italic", color: "#8a9099" }}>No explanation slide — see the extras below.</p>}
                    <PollExtras q={rq} contextText={bankQ ? undefined : (rh.context ?? "")} />
                  </div>
                </>
              );
            })() : (
              <>
                {/* Prefer the stem the host broadcasts: a participant who isn't
                    signed in can't download the private question bank, so byId
                    is empty for them and gating on it hid the question entirely,
                    leaving them staring at bare answer choices. */}
                {!remote.finished && (remote.stem || byId.size > 0) && (
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
                  <p style={s.stemPeek}>{remote.stem || byId.get(remote.qid)?.stem}</p>
                )}
                <p style={s.joinMsg}>
                  {remote.finished
                    ? <>Poll complete — thanks for playing! 🎉</>
                    : remote.multiSelect
                    ? <>Question {remote.index + 1} of {remote.total} — <strong>{remote.requiredSelections ? `select exactly ${remote.requiredSelections} answers` : "select all that apply"}.</strong></>
                    : <>Question {remote.index + 1} of {remote.total} — read it on the big screen, then tap your answer.</>}
                </p>
                {!remote.finished && revealCountdown != null && revealCountdown > 0 && (
                  <p style={{
                    margin: "0 0 10px", padding: "10px 14px", borderRadius: 10, textAlign: "center",
                    background: "rgba(241,163,143,.16)", border: "1px solid rgba(241,163,143,.4)",
                    color: "#f1a38f", fontWeight: 700, fontSize: 15,
                  }}>
                    Answer revealing in {revealCountdown}… last chance to lock in!
                  </p>
                )}
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
                    const locked = votingClosed || (remote.multiSelect && !!myVote);
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
                {!remote.finished && remote.multiSelect && !votingClosed && !myVote && (
                  <>
                    <p
                      style={{ ...s.joinState, margin: "12px 0 0", ...(remote.requiredSelections && pendingPicks.length > remote.requiredSelections ? { color: "#f1a38f" } : {}) }}
                      aria-live="polite"
                    >
                      {remote.requiredSelections
                        ? `${pendingPicks.length} of ${remote.requiredSelections} selected${pendingPicks.length > remote.requiredSelections ? " — remove a choice" : ""}`
                        : `${pendingPicks.length} selected`}
                    </p>
                    <button
                      style={{
                        ...s.pollBtn,
                        ...((remote.requiredSelections ? pendingPicks.length === remote.requiredSelections : pendingPicks.length > 0) ? s.pollBtnPrimary : {}),
                        width: "100%", justifyContent: "center", marginTop: 10,
                      }}
                      onClick={submitPending}
                      disabled={remote.requiredSelections ? pendingPicks.length !== remote.requiredSelections : !pendingPicks.length}
                    >
                      <Check size={15} strokeWidth={2.6} /> Submit{pendingPicks.length ? ` (${pendingPicks.length})` : ""}
                    </button>
                  </>
                )}
                {!remote.finished && (
                <p style={s.joinState}>
                  {remote.revealed
                    ? <>Answer: <b style={{ color: "#fff" }}>{remote.correct.join(", ")}</b>{myVote?.length ? (pickIsCorrect(myVote, remote.correct) ? " — you got it! 🎉" : ` — you picked ${myVote.join(", ")}`) : " — you didn't vote"}</>
                    : myVote?.length ? `You picked ${myVote.join(", ")}.${remote.multiSelect ? "" : " Tap another to change it."}`
                    : remote.multiSelect
                      ? (remote.requiredSelections ? `Select exactly ${remote.requiredSelections} answers, then Submit.` : "Tap all that apply, then Submit.")
                      : "Tap a letter to cast your vote."}
                </p>
                )}
                {!remote.finished && remote.revealed && (() => {
                  const bankQ = byId.get(remote.qid);
                  const hasBroadcast = remote.explanation_text !== undefined || remote.explanation_images !== undefined
                    || remote.clinical_application !== undefined || remote.context !== undefined;
                  if (!bankQ && !hasBroadcast) return null; // older host + no bank
                  const cq = bankQ ?? syntheticPollQuestion({
                    year: remote.year,
                    qIndex: remote.qIndex,
                    stem: remote.stem,
                    options: remote.options,
                    correct: remote.correct,
                    multiSelect: remote.multiSelect,
                    explanation_text: remote.explanation_text,
                    explanation_images: remote.explanation_images,
                    clinical_application: remote.clinical_application,
                    video_query: remote.video_query,
                    answer_text: remote.answer_text,
                  });
                  const explText = cq.explanation_text ?? "";
                  const explImgs = cq.explanation_images ?? [];
                  return (
                    <div style={s.joinExplBox}>
                      <span style={s.joinExplLabel}><Lightbulb size={13} strokeWidth={2.3} /> Explanation</span>
                      {explText && <ExplanationText text={explText} accent="#8fd9b6" style={s.joinExpl} />}
                      {bankQ
                        ? explImgs.filter((src) => imgSrc(src)).map((src, i) => (
                            <AuditedQuestionImage key={i} q={bankQ} path={src} kind="explanation" index={i} alt="explanation" style={{ ...s.joinExplImg, cursor: "zoom-in" }} onZoom={setZoomImg} dark />
                          ))
                        : explImgs.filter((src) => imgSrc(src)).map((src, i) => (
                            <img key={i} src={imgSrc(src)} alt="explanation" style={{ ...s.joinExplImg, cursor: "zoom-in" }} loading="lazy" onClick={() => setZoomImg(imgSrc(src))} title="Click to enlarge" />
                          ))}
                      {!explText && explImgs.length === 0 && (
                        <p style={{ ...s.joinExpl, fontStyle: "italic", color: "#8a9099" }}>
                          No explanation slide — see the extras below.
                        </p>
                      )}
                      <PollExtras q={cq} contextText={bankQ ? undefined : (remote.context ?? "")} />
                    </div>
                  );
                })()}
              </>
            )}
            {/* Review chips: signed-in users use the bank; guests use the
                stem/options/explanation the host broadcast at each reveal. */}
            {historyRef.current.size > 0 && (byId.size > 0 || guest) && (
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
            {remote.finished && sessionPersonal.answered > 0 && (
              <div style={s.teamBoardMini}>
                <div style={{ ...s.teamMiniRow, ...s.teamMiniMine }}>
                  <span style={s.teamMiniRank}><Crown size={15} strokeWidth={2.4} color="#f2c14e" /></span>
                  <span style={s.teamMiniName}>Your score this poll</span>
                  <span style={s.teamMiniScore}>{sessionPersonal.correct}/{sessionPersonal.answered} · {sessionPersonal.pct}%</span>
                </div>
                {guest && (
                  <p style={s.scoringNote}>Saved on this device only — <a href="/" style={{ color: "#4fd1c5" }}>sign in</a> to keep permanent poll stats across sessions.</p>
                )}
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
                    <span style={s.teamMiniScore}>{remote.rankBy !== "total" && t.answered > 0 ? `${Math.round((t.correct / t.answered) * 100)}%` : `${fmtScore(t.score)} pts`}</span>
                  </div>
                ))}
                <p style={s.scoringNote}>{SCORING_NOTE_PARTICIPANT}</p>
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
            {remote.finished && historyRef.current.size > 0 && (
              <button
                style={s.teamDownload}
                onClick={() => exportPollMissed(missedRows(), { code, who: displayName })}
                title="A PDF study sheet of just the questions you missed, with the full explanation for each"
              >
                <Download size={13} strokeWidth={2.3} /> Download my missed questions (PDF)
              </button>
            )}
            {remote.finished && historyRef.current.size > 0 && (
              <button
                style={s.teamDownload}
                onClick={addMissedToReview}
                disabled={reviewAddState !== "idle"}
                title={guest
                  ? "Save everything you missed this session on this device (sign in for the full spaced-repetition Review queue)"
                  : "Add everything you missed this session to your personal spaced-repetition Review queue"}
              >
                {reviewAddState === "done"
                  ? <><Check size={13} strokeWidth={2.6} /> {guest ? "Saved on this device" : "Added to Review"}</>
                  : reviewAddState === "saving"
                  ? "Adding…"
                  : <><ListChecks size={13} strokeWidth={2.3} /> {guest ? "Save missed on this device" : "Add missed to Review"}</>}
              </button>
            )}
          </>
        )}
      </div>

      {zoomImg && (
        <ZoomLightbox src={zoomImg} alt="Explanation, enlarged" onClose={() => setZoomImg(null)} />
      )}
    </div>
  );
}

// --- guest poll access ------------------------------------------------------
// Visitors without an account (e.g. med students rotating through didactics)
// can join a live poll straight from its ?poll=CODE link. Everything a
// participant needs travels over the Realtime broadcast channel (choices,
// reveals, standings, and — once revealed — explanation + study extras), so
// no sign-in or DB access is required — the guest just supplies a display
// name. Each device gets a random persistent voter id (the host tallies votes
// per id, so guests must not share one). Answers and a missed-question pack
// are kept on-device only (no account to write to the server).
const GUEST_ID_KEY = "prite_guest_voter";
const GUEST_NAME_KEY = "prite_guest_name";
const GUEST_POLL_STATS_KEY = "prite_guest_poll_stats";
const GUEST_REVIEW_KEY = "prite_guest_review_pack";
const EMPTY_BANK = new Map<string, RawQuestion>();

type GuestPollStatRow = {
  poll_code: string;
  question_id: string;
  team: string | null;
  correct: boolean;
  at: string;
};

/** Device-local stand-in for poll_answers when there's no signed-in user. */
function recordGuestPollAnswer(r: {
  poll_code: string; question_id: string; team: string | null; correct: boolean;
}): void {
  try {
    const cur: GuestPollStatRow[] = JSON.parse(localStorage.getItem(GUEST_POLL_STATS_KEY) || "[]");
    if (cur.some((x) => x.poll_code === r.poll_code && x.question_id === r.question_id)) return;
    cur.push({ ...r, at: new Date().toISOString() });
    // Cap growth — keep the most recent ~500 answers on this browser.
    localStorage.setItem(GUEST_POLL_STATS_KEY, JSON.stringify(cur.slice(-500)));
  } catch { /* private mode */ }
}

type GuestReviewItem = {
  q: RawQuestion;
  myChoice: string[] | null;
  poll_code: string;
  saved_at: string;
};

/** Merge this session's missed questions into the on-device guest review pack. */
function saveGuestReviewPack(items: GuestReviewItem[]): void {
  try {
    const prev: GuestReviewItem[] = JSON.parse(localStorage.getItem(GUEST_REVIEW_KEY) || "[]");
    const byKey = new Map<string, GuestReviewItem>();
    for (const it of prev) {
      const k = `${it.q.year}-${it.q.q_index}`;
      byKey.set(k, it);
    }
    for (const it of items) {
      const k = `${it.q.year}-${it.q.q_index}`;
      byKey.set(k, it);
    }
    localStorage.setItem(GUEST_REVIEW_KEY, JSON.stringify([...byKey.values()].slice(-200)));
  } catch { /* private mode */ }
}

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

function SignIn({ onJoinPoll }: { onJoinPoll: (code: string) => void }) {
  // Typed poll code, for the students who are in the room but didn't get the QR
  // code scanned (or scanned it on the wrong device). Same guest path the
  // ?poll=CODE link takes — no account, no sign-in.
  const [codeDraft, setCodeDraft] = useState("");
  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const c = codeDraft.trim().toUpperCase();
    if (c) onJoinPoll(c);
  };

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
          {/* Med students hit the pending queue and get declined — say so up front,
              warmly, so the didactics invitation lands before the rejection does.
              The code box below turns that invitation into something they can act
              on right here, without an account. */}
          <div style={s.gateStudentNote} className="gs4">
            <p style={{ margin: 0 }}>
              <b style={{ color: T.tealDeep }}>M4 or visiting medical student?</b> No need to make a full account —
              our board of psychiatry makes us restrict somewhat who has access to the full question bank.
              But it’s no problem at all, because you can still see all the questions in the class polls and
              participate fully without signing in — just use the QR code to get to the poll, or enter the
              code from the screen here:
            </p>
            <form style={s.gateCodeRow} onSubmit={submitCode}>
              <input
                style={s.gateCodeInput}
                value={codeDraft}
                onChange={(e) => setCodeDraft(e.target.value)}
                placeholder="Poll code"
                aria-label="Poll code from the screen"
                maxLength={12}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="submit"
                style={{ ...s.gateCodeGo, ...(codeDraft.trim() ? {} : s.gateCodeGoOff) }}
                disabled={!codeDraft.trim()}
              >
                <Radio size={14} strokeWidth={2.4} /> Join
              </button>
            </form>
          </div>
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
        <h1 style={s.gateTitle}>{status === "blocked" ? "Full accounts are limited" : "Awaiting approval"}</h1>
        <p style={s.gateSub}>
          You’re signed in as <b style={{ color: T.text }}>{email}</b>.{" "}
          {status === "blocked"
            ? "Our board of psychiatry makes us restrict somewhat who has access to the full question bank, so we can’t set up an account here — but there’s no problem at all. If you believe this is a mistake, email correllsoftware@gmail.com and we’ll sort it out."
            : "An admin needs to approve you before you can start. You’ll get in as soon as they do."}
        </p>
        {/* The most common blocked case is a medical student rotating with us —
            lead with the invitation rather than leaving them at a dead end. */}
        {status === "blocked" && (
          <p style={s.gateStudentNote}>
            <b style={{ color: T.tealDeep }}>Rotating with us as a medical student?</b> You don’t need an
            account at all — we would love for you to be a part of our board-question sections at Tuesday
            didactics. You can join the live polls right from your phone.
          </p>
        )}
        <button style={{ ...s.googleBtn, marginTop: status === "blocked" ? 14 : 0 }} onClick={() => signOut()}><LogOut size={15} strokeWidth={2.2} /> Sign out</button>
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
    <div data-scrim style={s.scrim} onClick={onClose}>
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
    <div data-scrim style={s.scrim} onClick={onClose}>
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
function OfficialResultsPanel({ results, onClose, onCleared, onEditTeams, onEditWeekly }: {
  results: OfficialPollResult[];
  onClose: () => void;
  onCleared: () => void;
  onEditTeams: () => void;
  onEditWeekly: () => void;
}) {
  const [clearStage, setClearStage] = useState<"idle" | "confirm" | "clearing">("idle");
  const doClear = async () => {
    setClearStage("clearing");
    await clearOfficialPollResults();
    setClearStage("idle");
    onCleared();
  };
  return (
    <div data-scrim style={s.scrim} onClick={onClose}>
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
            <button style={s.apApprove} onClick={onEditWeekly}>
              <Shuffle size={13} strokeWidth={2.4} style={{ marginRight: 5, verticalAlign: "-2px" }} />
              Edit this week's pairings
            </button>
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

function BankTopicFilters({
  mode, all, year, modality, onYear, onModality,
}: {
  mode: "neuro" | "therapy" | "meds";
  all: RawQuestion[];
  year: string;
  modality: string;
  onYear: (y: string) => void;
  onModality: (m: string) => void;
}) {
  const therapyChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of all) {
      const m = therapyModality(q);
      counts.set(m, (counts.get(m) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => therapyModalityRank(a[0]) - therapyModalityRank(b[0]) || a[0].localeCompare(b[0]));
  }, [all]);
  const medsChips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of all) {
      const c = carlatCategory(q);
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => carlatCategoryRank(a[0]) - carlatCategoryRank(b[0]) || a[0].localeCompare(b[0]));
  }, [all]);
  const neuroChips = useMemo(() => {
    const counts = new Map<string, { label: string; n: number; year: string }>();
    for (const q of all) {
      const label = neuroChapter(q);
      const prev = counts.get(q.year) || { label, n: 0, year: q.year };
      prev.n += 1;
      counts.set(q.year, prev);
    }
    return [...counts.values()].sort((a, b) => {
      if (a.year === "Review") return 1;
      if (b.year === "Review") return -1;
      return (parseInt(a.year.replace(/\D/g, ""), 10) || 0) - (parseInt(b.year.replace(/\D/g, ""), 10) || 0);
    });
  }, [all]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "0 0 12px" }}>
      <button
        style={{ ...s.orderYear, ...((mode === "therapy" || mode === "meds" ? modality === "all" : year === "all") ? s.orderYearOn : {}) }}
        onClick={() => { if (mode === "therapy" || mode === "meds") onModality("all"); else onYear("all"); }}
      >
        All ({all.length})
      </button>
      {mode === "meds"
        ? medsChips.map(([name, n]) => (
            <button
              key={name}
              style={{ ...s.orderYear, ...(modality === name ? s.orderYearOn : {}) }}
              onClick={() => onModality(modality === name ? "all" : name)}
            >
              {name.replace(/ Medications$/i, "")} <span style={{ fontWeight: 500, opacity: 0.7 }}>{n}</span>
            </button>
          ))
      : mode === "therapy"
        ? therapyChips.map(([name, n]) => (
            <button
              key={name}
              style={{ ...s.orderYear, ...(modality === name ? s.orderYearOn : {}) }}
              onClick={() => onModality(modality === name ? "all" : name)}
            >
              {name} <span style={{ fontWeight: 500, opacity: 0.7 }}>{n}</span>
            </button>
          ))
        : neuroChips.map((c) => (
            <button
              key={c.year}
              style={{ ...s.orderYear, ...(year === c.year ? s.orderYearOn : {}) }}
              onClick={() => onYear(year === c.year ? "all" : c.year)}
              title={c.label}
            >
              {c.year === "Review" ? "Review" : c.label} <span style={{ fontWeight: 500, opacity: 0.7 }}>{c.n}</span>
            </button>
          ))}
    </div>
  );
}

// "Child Psychiatry" nav toggle — the CAPITE bank doesn't exist yet, so this
// is a friendly placeholder pointing volunteers at who's driving the effort.
function CapiteComingSoon({ onClose }: { onClose: () => void }) {
  return (
    <div data-scrim style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 420 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={{ padding: "34px 28px 28px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 18 }}>
            <span className="penguinDance" style={{ fontSize: 52, animationDelay: "0s" }}>🐧</span>
            <span className="penguinDance" style={{ fontSize: 52, animationDelay: "0.15s" }}>🐧</span>
            <span className="penguinDance" style={{ fontSize: 52, animationDelay: "0.3s" }}>🐧</span>
          </div>
          <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 10, color: T.text }}>Child psych questions coming soon</div>
          <p style={{ fontSize: 14.5, color: T.muted, lineHeight: 1.6, margin: "0 0 22px" }}>
            Pending and in process — please contact <b style={{ color: T.text }}>Dr. Tyler Yorgason</b> via
            email if you'd like to help make this happen!
          </p>
          <a
            href="mailto:tyler.yorgason@wright.edu?subject=Helping%20build%20the%20child%20psych%20question%20bank"
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
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineMsg, setDeclineMsg] = useState<string | null>(null);
  useEffect(() => {
    listRosterNames().then(setRoster);
    listStudyGuideCreators().then(setCreators);
  }, []);

  // Block the account and email a polite notice. Two flavors: the plain
  // "accounts are limited to the program" notice, and a warmer one for someone
  // who looks like an M4 or visiting medical student, which invites them to the
  // board-question sections at Tuesday didactics instead.
  const decline = async (p: Profile, variant: DeclineVariant) => {
    const who = p.full_name || p.email;
    const blurb = variant === "student"
      ? `They'll be blocked from the question bank and emailed a friendly note: our board of psychiatry restricts full accounts, but they're warmly invited to the board-question sections at Tuesday didactics.`
      : `They'll be blocked and emailed that our board of psychiatry limits full question-bank accounts to residents and faculty in the program.`;
    if (!window.confirm(
      `Decline ${who}${variant === "student" ? " as a medical student" : ""}?\n\n${blurb}\n\nContact listed: correllsoftware@gmail.com.`
    )) return;
    setDecliningId(p.id);
    setDeclineMsg(null);
    const err = await declineAccess(p.id, variant);
    setDecliningId(null);
    onRefresh();
    setDeclineMsg(err
      ? `Declined, but: ${err}`
      : variant === "student"
        ? `Declined ${who} and sent the medical-student invitation email.`
        : `Declined ${who} and sent the standard decline email.`);
  };

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
          {p.status !== "approved" && p.status !== "blocked" && (
            <button style={s.apApprove} onClick={() => onAct(p.id, { status: "approved" })}>Approve</button>
          )}
          {p.status === "pending" && !isSelf && (
            <>
              <button
                style={s.apDecline}
                disabled={decliningId === p.id}
                title="Block this request and email a polite notice that full question-bank accounts are limited to residents and faculty in the program"
                onClick={() => decline(p, "generic")}
              >
                {decliningId === p.id ? "Declining…" : "Decline"}
              </button>
              <button
                style={s.apDeclineStudent}
                disabled={decliningId === p.id}
                title="Decline as a medical student — sends a warm note explaining the board-of-psychiatry restriction and inviting them to the board-question sections at Tuesday didactics"
                onClick={() => decline(p, "student")}
              >
                {decliningId === p.id ? "Declining…" : "Decline · med student"}
              </button>
            </>
          )}
          {p.status === "blocked" && (
            <button style={s.apApprove} onClick={() => onAct(p.id, { status: "approved" })}>Unblock</button>
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
          {/* Silent block (no email) — for removing existing members without a notice. Pending users use Decline instead. */}
          {p.status === "approved" && !isSelf && (
            <button style={s.apBlock} title="Block without emailing" onClick={() => onAct(p.id, { status: "blocked" })}>
              <X size={14} strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>
    );
  };
  return (
    <div data-scrim style={s.scrim} onClick={onClose}>
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
            {pending.length > 0 && (
              <p style={{ ...s.apEmpty, marginTop: 8, fontStyle: "normal" }}>
                Both decline buttons block the request and send a polite email (contact listed: correllsoftware@gmail.com).{" "}
                <b>Decline</b> sends the plain notice that full question-bank accounts are limited to residents and faculty in the program.{" "}
                <b>Decline · med student</b> sends a warmer note for an M4 or visiting student — same restriction, but it invites them to join the board-question sections at Tuesday didactics.
              </p>
            )}
            {declineMsg && <p style={{ ...s.apEmpty, marginTop: 10, fontStyle: "normal", color: T.text }}>{declineMsg}</p>}
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

/* ---- "What comes first" ------------------------------------------------
   A ranked list the resident drags into the order they want, with a live
   preview of the resulting set underneath. The preview is the part that makes
   it teachable: an abstract ranking of five rules means little until you can
   see that it puts 2023 Neurology at the top of tomorrow's questions.

   Drag is the headline interaction, but it is not the only one — every row
   also moves with the keyboard (and on touch, where HTML5 drag is unreliable)
   via its own up/down buttons. */
function DailyOrderPanel({
  kind = "prite", order, yearFocus, years, preview, weakAreas, setSize = 10, quotaShares, onChange, onReset, onClose,
}: {
  kind?: "prite" | "neuro" | "therapy" | "meds";
  order: OrderRuleId[];
  yearFocus: string[];
  years: string[];
  preview: RawQuestion[];
  weakAreas: { cat: string; acc: number; tried: number }[];
  setSize?: number;
  quotaShares: number[];
  onChange: (next: { order?: OrderRuleId[]; yearFocus?: string[]; quota?: number[] }) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [dragId, setDragId] = useState<OrderRuleId | null>(null);
  const [overId, setOverId] = useState<OrderRuleId | null>(null);
  const shown = visibleOrderRules(kind, order);
  const catalog = kind === "therapy" ? THERAPY_ORDER_RULES : kind === "neuro" ? NEURO_ORDER_RULES : kind === "meds" ? MEDS_ORDER_RULES : ORDER_RULES;
  const quotaCounts = allocateQuota(setSize, quotaShares);
  const leftoverQuota = quotaCounts.slice(shown.length).reduce((a, b) => a + b, 0);

  const move = (id: OrderRuleId, delta: number) => {
    const from = shown.indexOf(id);
    const to = Math.max(0, Math.min(shown.length - 1, from + delta));
    if (from === to) return;
    const nextVisible = shown.slice();
    nextVisible.splice(to, 0, ...nextVisible.splice(from, 1));
    onChange({ order: replaceVisibleOrder(order, nextVisible, kind) });
  };
  const dropOn = (target: OrderRuleId) => {
    if (!dragId || dragId === target) return;
    const nextVisible = shown.filter((id) => id !== dragId);
    nextVisible.splice(shown.indexOf(target), 0, dragId);
    onChange({ order: replaceVisibleOrder(order, nextVisible, kind) });
  };
  const toggleYear = (y: string) => {
    onChange({ yearFocus: yearFocus.includes(y) ? yearFocus.filter((v) => v !== y) : [...yearFocus, y] });
  };

  const quotaDefault = allocateQuota(setSize, DAILY_QUOTA_SHARES).join() === quotaCounts.join();
  const isDefault = (isPracticeBank(kind)
    ? shown.join() === PRACTICE_DEFAULT_VISIBLE.join()
    : order.join() === DEFAULT_ORDER.join() && yearFocus.length === 0) && quotaDefault;

  return (
    <div data-scrim style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 560 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>{kind === "therapy" ? "Therapy daily set" : kind === "neuro" ? "Kaufman daily set" : kind === "meds" ? "Meds daily set" : "Daily questions"}</div>
            <div style={s.apTitle}>What comes first</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={{ ...s.apBody, padding: "4px 22px 22px" }}>
          <p style={s.orderIntro}>
            Drag to rank the mix, then set how many of today’s {setSize} go to each rank. Default is 40 / 5 / 3 / 2 of 50.
            {kind === "therapy"
              ? " — there are no exam years in this bank."
              : kind === "neuro"
                ? " — these are Kaufman book questions, not exam years."
                : "."}
            {" "}If a slice runs short, leftover spots fill from the next ranks.
          </p>

          <ol style={s.orderList}>
            {shown.map((id, i) => {
              const rule = catalog.find((r) => r.id === id) || ORDER_RULES.find((r) => r.id === id)!;
              const dim = id === "weak" && weakAreas.length === 0;
              return (
                <li
                  key={id}
                  draggable
                  onDragStart={() => setDragId(id)}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onDragOver={(e) => { e.preventDefault(); setOverId(id); }}
                  onDrop={(e) => { e.preventDefault(); dropOn(id); setDragId(null); setOverId(null); }}
                  style={{
                    ...s.orderRow,
                    ...(dragId === id ? s.orderRowDrag : {}),
                    ...(overId === id && dragId && dragId !== id ? s.orderRowOver : {}),
                  }}
                >
                  <span style={s.orderGrip} aria-hidden><GripVertical size={15} strokeWidth={2.2} /></span>
                  <span style={s.orderRank}>{i + 1}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={s.orderLabel}>{rule.label}</span>
                    <span style={s.orderHint}>
                      {dim ? "Needs a bit more history before this can rank anything" : rule.hint}
                    </span>
                  </span>
                  {i < quotaCounts.length && (
                    <span style={s.quotaSteer} onPointerDown={(e) => e.stopPropagation()}>
                      <button
                        style={s.orderMoveBtn}
                        onClick={() => onChange({ quota: nudgeQuotaShares(quotaShares, i, -1, setSize) })}
                        disabled={quotaCounts[i] <= 0}
                        aria-label={`Fewer ${rule.label}`}
                        title="Fewer in this slice"
                      ><Minus size={13} strokeWidth={2.6} /></button>
                      <label style={s.quotaSteerValue}>
                        <input
                          type="number"
                          min={0}
                          max={setSize}
                          value={quotaCounts[i]}
                          onChange={(e) => {
                            const want = Math.max(0, Math.min(setSize, parseInt(e.target.value || "0", 10) || 0));
                            onChange({ quota: nudgeQuotaShares(quotaShares, i, want - quotaCounts[i], setSize) });
                          }}
                          aria-label={`${rule.label} count`}
                          className="quotaCount"
                          style={s.quotaSteerInput}
                        />
                        <span>of {setSize}</span>
                      </label>
                      <button
                        style={s.orderMoveBtn}
                        onClick={() => onChange({ quota: nudgeQuotaShares(quotaShares, i, 1, setSize) })}
                        disabled={quotaCounts[i] >= setSize}
                        aria-label={`More ${rule.label}`}
                        title="More in this slice"
                      ><Plus size={13} strokeWidth={2.6} /></button>
                    </span>
                  )}
                  <span style={s.orderMoves}>
                    <button
                      style={s.orderMoveBtn}
                      onClick={() => move(id, -1)}
                      disabled={i === 0}
                      aria-label={`Move ${rule.label} up`}
                      title="Move up"
                    ><ChevronUp size={14} strokeWidth={2.6} /></button>
                    <button
                      style={s.orderMoveBtn}
                      onClick={() => move(id, 1)}
                      disabled={i === shown.length - 1}
                      aria-label={`Move ${rule.label} down`}
                      title="Move down"
                    ><ChevronDown size={14} strokeWidth={2.6} /></button>
                  </span>
                </li>
              );
            })}
          </ol>
          {leftoverQuota > 0 && (
            <div style={s.setHint}>{leftoverQuota} of {setSize} fill from whatever is left if a higher slice runs short.</div>
          )}

          {!isPracticeBank(kind) && (
          <div style={s.setBlock}>
            <div style={s.setLbl}>Pin exam years to the front</div>
            <div style={s.orderYearRow}>
              {years.map((y) => {
                const at = yearFocus.indexOf(y);
                return (
                  <button
                    key={y}
                    style={{ ...s.orderYear, ...(at !== -1 ? s.orderYearOn : {}) }}
                    onClick={() => toggleYear(y)}
                    aria-pressed={at !== -1}
                  >
                    {at !== -1 && <span style={s.orderYearNum}>{at + 1}</span>}
                    {y}
                  </button>
                );
              })}
            </div>
            <div style={s.setHint}>
              {yearFocus.length
                ? `The exam-year slice prefers ${yearFocus.join(", then ")}.`
                : "Nothing pinned — the exam-year slice uses the newest exam year."}
            </div>
          </div>
          )}

          <div style={s.setBlock}>
            <div style={s.setLbl}>Your next questions, in this order</div>
            {preview.length === 0 ? (
              <div style={s.setHint}>Nothing queued right now — finish today's set or add more questions.</div>
            ) : (
              <ol style={s.orderPreview}>
                {preview.map((q, i) => {
                  const therapyTopic = q.bienenfeld
                    ? bienenfeldChapterLabel(q.year)
                    : q.year;
                  return (
                  <li key={questionId(q.year, q.q_index)} style={s.orderPreviewRow}>
                    <span style={s.orderPreviewNum}>{i + 1}</span>
                    <span style={s.orderPreviewYear}>
                      {kind === "therapy"
                        ? (q.quizapine?.modality || "Therapy")
                        : kind === "neuro"
                          ? neuroChapterOptionLabel(q.year, neuroChapter(q))
                          : q.year}
                    </span>
                    <span style={s.orderPreviewCat}>
                      {kind === "therapy"
                        ? (q.bienenfeld?.page != null ? `${therapyTopic} · p. ${q.bienenfeld.page}` : therapyTopic)
                        : kind === "neuro"
                          ? (q.kaufman?.teach_title || neuroTopicLabel(neuroChapter(q)))
                          : (q.prite_label || q.prite_category || "Uncategorized")}
                    </span>
                    {!isPracticeBank(kind) && (q.repeat_count ?? 1) > 1 && (
                      <span style={s.orderPreviewTag}><Repeat size={9} strokeWidth={2.6} /> {q.repeat_count}×</span>
                    )}
                  </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div style={s.orderFoot}>
            <button style={s.ghost} onClick={onReset} disabled={isDefault}>
              <RotateCcw size={13} strokeWidth={2.2} /> Reset to default
            </button>
            <button style={s.primarySm} onClick={onClose}><Check size={14} strokeWidth={2.4} /> Done</button>
          </div>
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
  // Bring-your-own AI keys: kept in this browser only (localStorage), sent
  // with study-guide generation requests in place of the program's keys.
  const [aiKeys, setAiKeys] = useState<OwnAiKeys>(() => getOwnAiKeys());
  const saveAiKey = (patch: OwnAiKeys) => {
    const next = { ...aiKeys, ...patch };
    setAiKeys(next);
    setOwnAiKeys(next);
  };
  return (
    <div data-scrim style={s.scrim} onClick={onClose}>
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
          No clear upward trend yet — each dot is first-try accuracy for questions you first saw that day. Days with fewer than 5 new questions are left off so one lucky item doesn’t look like 100%. Keep answering and a trend line appears once it’s pointing up.
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
    const todayRows = entries.filter((e) => isSameDay(e.updated_at));
    const today = todayRows.length;
    const todayOk = todayRows.filter((e) => e.correct).length;
    const week = entries.filter((e) => Date.now() - Date.parse(e.updated_at) < 7 * 86400000).length;

    // streak: consecutive days (ending today or yesterday) with activity
    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const activeDays = new Set(entries.map((e) => dayKey(new Date(e.updated_at))));
    let streak = 0;
    const cur = new Date();
    if (!activeDays.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
    while (activeDays.has(dayKey(cur))) { streak++; cur.setDate(cur.getDate() - 1); }

    return {
      answered, attempts, today, todayOk, week, mastered, outstanding,
      firstTryAcc: answered ? Math.round((firstTry / answered) * 100) : 0,
      currentAcc: answered ? Math.round((mastered / answered) * 100) : 0,
      streak,
    };
  }, [answers]);

  // Performance over time. One point per day you first-attempted enough
  // questions, pinned to created_at so a review session cannot paint today red.
  const chart = useMemo(() => buildPerfChart(Object.values(answers)), [answers]);

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
    <div data-scrim style={s.scrim} onClick={onClose}>
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
                {card(<><Flame size={18} strokeWidth={2.4} style={{ verticalAlign: "-2px" }} color={m.streak > 0 ? T.gold : T.faint} /> {m.streak}</>, "Day streak", `${m.today} today${m.today ? ` · ${m.todayOk}/${m.today} this session` : ""} · ${m.week} this week`, m.streak > 0 ? T.gold : undefined)}
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
    <div data-scrim style={s.scrim} onClick={onClose}>
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

/* How a question sits with the person studying: never attempted, missed on the
   last attempt, or answered right. Drives the "Your history" filter and the
   one-click quick-start presets at the top of the builder — the two questions
   residents actually ask ("give me my wrong ones" / "give me new ones"). */
type ProgressFilter = "all" | "unseen" | "missed" | "correct";
const progressLabel: Record<ProgressFilter, string> = {
  all: "New & already-answered",
  unseen: "Haven't tried yet",
  missed: "Got wrong",
  correct: "Got right",
};

type AudioExportVariant = {
  playback_rate: number;
  between_question_seconds?: number;
  path: string;
  filename: string;
  bytes: number;
  duration_seconds: number;
  parts?: { path: string; filename: string; bytes: number; offset?: number }[];
};

type AudioExportEntry = Omit<AudioExportVariant, "playback_rate"> & {
  scope_key: string;
  topic: string;
  question_count: number;
  variants?: AudioExportVariant[];
};

const AUDIO_PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
const AUDIO_VOLUME_GAINS = [1, 1.1, 1.25, 1.5] as const;

function AudioDrillsPanel({ all, onClose, fire }: { all: RawQuestion[]; onClose: () => void; fire: (m: string) => void }) {
  const [topic, setTopic] = useState("all");
  const [count, setCount] = useState<number | "all">(20);
  const [recallSecs, setRecallSecs] = useState(4);
  const [transitionSecs, setTransitionSecs] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volumeGain, setVolumeGain] = useState(1.25);
  const [order, setOrder] = useState<"shuffle" | "bank">("shuffle");
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [playState, setPlayState] = useState<"idle" | "loading" | "playing">("idle");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [playbackTotal, setPlaybackTotal] = useState(0);
  const [playbackPhase, setPlaybackPhase] = useState<"question" | "thinking" | "answer" | "between" | null>(null);
  const [savedProgress, setSavedProgress] = useState<AudioReviewProgress[]>([]);
  const [exports, setExports] = useState<AudioExportEntry[]>([]);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null);
  const [downloadRate, setDownloadRate] = useState(1);
  const [downloadGap, setDownloadGap] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const finishCurrent = useRef<(() => void) | null>(null);
  const stopped = useRef(false);
  const playbackRun = useRef(0);
  const activeSession = useRef<Omit<AudioReviewProgress, "user_id" | "updated_at"> | null>(null);
  // The parent passes onClose inline, so its identity changes whenever a toast
  // or other parent state updates. Keep the latest callback in a ref: an effect
  // keyed to onClose would run its cleanup on every such render and stop audio
  // immediately after the "Playing…" toast appears.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const byQuestionId = useMemo(() => new Map(all.map((q) => [questionId(q.year, q.q_index), q])), [all]);
  const topics = useMemo(() => Array.from(new Set(all.flatMap((q) => q.tags?.topics ?? []))).sort(), [all]);
  const matching = useMemo(() => all.filter((q) => topic === "all" || (q.tags?.topics ?? []).includes(topic)), [all, topic]);
  const chosen = useMemo(() => {
    const pool = [...matching];
    if (order === "shuffle") {
      // Fisher-Yates gives each new session a fresh mix without changing the
      // underlying question bank or the user's selected topic.
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    return pool.slice(0, count === "all" ? pool.length : count);
  }, [matching, count, order, shuffleSeed]);
  const currentProgress = useMemo(
    () => savedProgress.find((p) => p.scope_key === topic && !p.completed && p.current_index < p.question_ids.length) ?? null,
    [savedProgress, topic],
  );
  const currentExport = useMemo(() => exports.find((e) => e.scope_key === topic) ?? null, [exports, topic]);
  const currentExportVariants = useMemo<AudioExportVariant[]>(() => {
    if (!currentExport) return [];
    const variants = currentExport.variants?.length
      ? currentExport.variants
      : [{ playback_rate: 1, path: currentExport.path, filename: currentExport.filename, bytes: currentExport.bytes, duration_seconds: currentExport.duration_seconds }];
    return variants.map((variant) => ({ ...variant, between_question_seconds: variant.between_question_seconds ?? currentExport.between_question_seconds ?? 1 }));
  }, [currentExport]);
  const downloadGapOptions = useMemo(() => [...new Set(currentExportVariants.map((variant) => variant.between_question_seconds ?? 1))].sort(), [currentExportVariants]);
  const currentGapVariants = useMemo(() => currentExportVariants.filter((variant) => (variant.between_question_seconds ?? 1) === downloadGap), [currentExportVariants, downloadGap]);
  const currentExportVariant = currentGapVariants.find((variant) => variant.playback_rate === downloadRate) ?? currentGapVariants[0] ?? null;

  useEffect(() => {
    let alive = true;
    listAudioReviewProgress().then((rows) => { if (alive) setSavedProgress(rows); });
    // Version the URL as well as sending no-store headers. Pages deployment
    // aliases can briefly retain an older static JSON object across a release.
    fetch("/data/audio_exports.json?v=audio-5100-topics-r2", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((manifest) => { if (alive && Array.isArray(manifest?.exports)) setExports(manifest.exports); })
      .catch(() => { /* Exports can be populated after the player ships. */ });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (downloadGapOptions.length && !downloadGapOptions.includes(downloadGap)) {
      setDownloadGap(downloadGapOptions[0]);
    }
  }, [downloadGapOptions, downloadGap]);
  useEffect(() => {
    if (currentGapVariants.length && !currentGapVariants.some((variant) => variant.playback_rate === downloadRate)) {
      setDownloadRate(currentGapVariants[0].playback_rate);
    }
  }, [currentGapVariants, downloadRate]);
  const stop = useCallback((resetUi = true) => {
    playbackRun.current += 1;
    stopped.current = true;
    audioRef.current?.pause();
    finishCurrent.current?.();
    finishCurrent.current = null;
    if (resetUi) { setPlayState("idle"); setActiveIndex(null); setPlaybackTotal(0); setPlaybackPhase(null); }
  }, []);
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("keydown", keydown);
      stop(false);
      if (audioContextRef.current) void audioContextRef.current.close();
      audioContextRef.current = null; audioGainRef.current = null; audioSourceRef.current = null; audioRef.current = null;
    };
  }, [stop]);
  const persistSession = (session: Omit<AudioReviewProgress, "user_id" | "updated_at">) => {
    const optimistic: AudioReviewProgress = { ...session, user_id: "", updated_at: new Date().toISOString() };
    setSavedProgress((previous) => session.completed
      ? previous.filter((row) => row.scope_key !== session.scope_key)
      : [optimistic, ...previous.filter((row) => row.scope_key !== session.scope_key)]);
    void saveAudioReviewProgress(session);
  };
  const play = async (resume?: AudioReviewProgress) => {
    const sourceQueue = resume
      ? resume.question_ids.map((id) => byQuestionId.get(id)).filter(Boolean) as RawQuestion[]
      : chosen;
    const startAt = resume ? Math.min(resume.current_index, Math.max(sourceQueue.length - 1, 0)) : 0;
    if (!sourceQueue.length) { fire("This saved review no longer has matching questions"); return; }
    const session: Omit<AudioReviewProgress, "user_id" | "updated_at"> = {
      scope_key: resume?.scope_key ?? topic,
      topic: resume?.topic ?? topic,
      question_ids: sourceQueue.map((q) => questionId(q.year, q.q_index)),
      current_index: startAt,
      recall_seconds: resume?.recall_seconds ?? recallSecs,
      transition_seconds: resume?.transition_seconds ?? transitionSecs,
      playback_rate: resume?.playback_rate ?? playbackRate,
      order_mode: resume?.order_mode ?? order,
      completed: false,
    };
    if (resume) {
      setRecallSecs(resume.recall_seconds);
      setTransitionSecs(resume.transition_seconds);
      setPlaybackRate(resume.playback_rate ?? 1);
      setOrder(resume.order_mode);
    }
    activeSession.current = session;
    persistSession(session);
    stop();
    const runId = playbackRun.current;
    stopped.current = false; setPlayState("loading");
    // HTMLMediaElement volume tops out at 100%. Route the one reusable player
    // through Web Audio so the default can be modestly louder without altering
    // playback rate or requiring the user to raise their device volume.
    const player = audioRef.current ?? new Audio();
    audioRef.current = player;
    if (!audioContextRef.current && typeof AudioContext !== "undefined") {
      const context = new AudioContext();
      const source = context.createMediaElementSource(player);
      const gain = context.createGain();
      source.connect(gain); gain.connect(context.destination);
      audioContextRef.current = context; audioSourceRef.current = source; audioGainRef.current = gain;
    }
    if (audioGainRef.current) audioGainRef.current.gain.value = volumeGain;
    if (audioContextRef.current?.state === "suspended") void audioContextRef.current.resume();
    const ids = sourceQueue.slice(startAt).map((q) => questionId(q.year, q.q_index));
    const ready = await getAudioDrills(ids);
    if (stopped.current || runId !== playbackRun.current) return;
    if (!ids.length || !ready[ids[0]]) { setPlayState("idle"); fire("Audio couldn't be loaded for this selection"); return; }
    setPlaybackTotal(sourceQueue.length); setPlayState("playing");
    const wait = (ms: number) => new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; window.clearTimeout(timer); finishCurrent.current = null; resolve(); };
      const timer = window.setTimeout(finish, ms);
      finishCurrent.current = finish;
    });
    // Reuse one media element for the entire queue. Mobile browsers commonly
    // allow the element started by the user's click but reject fresh Audio()
    // instances created later after an awaited pause. That looked like the
    // first question played and every answer/subsequent question was skipped.
    const playUrl = (url: string) => new Promise<boolean>((resolve) => {
      const a = player;
      a.src = url;
      a.playbackRate = session.playback_rate;
      let done = false;
      const finish = (played = true) => {
        if (done) return;
        done = true;
        a.onended = null; a.onerror = null;
        URL.revokeObjectURL(url);
        finishCurrent.current = null;
        resolve(played);
      };
      finishCurrent.current = finish;
      a.onended = () => finish(true); a.onerror = () => finish(false);
      a.play().catch(() => finish(false));
    });
    const run = async (i: number): Promise<void> => {
      if (stopped.current || runId !== playbackRun.current) return;
      if (i >= sourceQueue.length) {
        session.current_index = sourceQueue.length;
        session.completed = true;
        persistSession(session);
        activeSession.current = null;
        setPlayState("idle"); setActiveIndex(null); setPlaybackTotal(0); setPlaybackPhase(null);
        fire(`Finished ${sourceQueue.length} questions`); return;
      }
      session.current_index = i;
      persistSession(session);
      setActiveIndex(i);
      setPlaybackPhase("question");
      const d = ready[questionId(sourceQueue[i].year, sourceQueue[i].q_index)];
      if (!d?.prompt_audio_path || !d.answer_audio_path) {
        setPlayState("idle"); setActiveIndex(null); fire("Playback stopped because a clip couldn't be loaded"); return;
      }
      const prompt = await getAudioClipUrl(d.prompt_audio_path!);
      if (!prompt) { setPlayState("idle"); setActiveIndex(null); fire("Playback stopped because a clip couldn't be loaded"); return; }
      if (!(await playUrl(prompt))) { setPlayState("idle"); setActiveIndex(null); fire("Playback was blocked—tap Start review again"); return; }
      if (stopped.current || runId !== playbackRun.current) return;
      setPlaybackPhase("thinking");
      await wait(session.recall_seconds * 1000); if (stopped.current || runId !== playbackRun.current) return;
      const answer = await getAudioClipUrl(d.answer_audio_path!);
      if (!answer) { setPlayState("idle"); setActiveIndex(null); fire("Playback stopped because a clip couldn't be loaded"); return; }
      setPlaybackPhase("answer");
      if (!(await playUrl(answer))) { setPlayState("idle"); setActiveIndex(null); fire("Playback was blocked—tap Start review again"); return; }
      if (stopped.current || runId !== playbackRun.current) return;
      session.current_index = i + 1;
      session.completed = session.current_index >= sourceQueue.length;
      persistSession(session);
      if (session.completed) { await run(i + 1); return; }
      setPlaybackPhase("between");
      await wait(session.transition_seconds * 1000);
      if (stopped.current || runId !== playbackRun.current) return;
      await run(i + 1);
    };
    void run(startAt); fire(`${resume ? "Resuming" : "Playing"} ${sourceQueue.length} active-recall questions`);
  };
  const downloadExport = async () => {
    if (!currentExport || !currentExportVariant || downloadBusy) return;
    setDownloadBusy(true);
    try {
      let url: string | null = null;
      if (currentExportVariant.parts?.length) {
        const blobs: Blob[] = [];
        for (let index = 0; index < currentExportVariant.parts.length; index += 1) {
          setDownloadProgress({ current: index + 1, total: currentExportVariant.parts.length });
          const part = currentExportVariant.parts[index];
          const blob = await getAudioExportBlob(part.path, part.offset === undefined ? undefined : { offset: part.offset, bytes: part.bytes });
          if (!blob) throw new Error("A library section couldn't be downloaded");
          if (blob.size !== currentExportVariant.parts[index].bytes) throw new Error("A library section was incomplete");
          blobs.push(blob);
        }
        const complete = new Blob(blobs, { type: "audio/mpeg" });
        if (complete.size !== currentExportVariant.bytes) throw new Error("The complete library file was incomplete");
        url = URL.createObjectURL(complete);
      } else {
        const blob = await getAudioExportBlob(currentExportVariant.path);
        if (blob && blob.size !== currentExportVariant.bytes) throw new Error("The downloaded MP3 was incomplete");
        if (blob) url = URL.createObjectURL(blob);
      }
      if (!url) throw new Error("The download couldn't be prepared");
      const link = document.createElement("a");
      link.href = url; link.download = currentExportVariant.filename;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url!), 60_000);
      fire(`Downloading ${currentExport.topic} at ${currentExportVariant.playback_rate}× with ${currentExportVariant.between_question_seconds ?? 1}-second gaps`);
    } catch (error) {
      console.warn("downloadAudioExport", error);
      fire("The download couldn't be completed—please try again");
    } finally {
      setDownloadProgress(null);
      setDownloadBusy(false);
    }
  };
  const field = { display: "grid", gap: 7, fontSize: 12, fontWeight: 700, color: T.muted, letterSpacing: ".02em" } as const;
  const control = { width: "100%", padding: "11px 38px 11px 12px", borderRadius: 10, border: `1px solid ${T.paperEdge}`, background: "#fff", color: T.text, fontSize: 14.5, fontFamily: "inherit", cursor: "pointer" } as const;
  const queueLabel = `${chosen.length.toLocaleString()} ${chosen.length === 1 ? "question" : "questions"}`;
  const topicLabel = topic === "all" ? "All topics" : topic;
  const matchingScope = topic === "all" ? "across the library" : `in ${topic}`;
  const exportSize = currentExportVariant
    ? currentExportVariant.bytes >= 1024 ** 3
      ? `${(currentExportVariant.bytes / (1024 ** 3)).toFixed(1)} GB`
      : `${(currentExportVariant.bytes / (1024 ** 2)).toFixed(1)} MB`
    : "";
  const exportHours = currentExportVariant ? `${Math.round(currentExportVariant.duration_seconds / 360) / 10} hr` : "";
  return <div data-scrim style={s.scrim} className="scrimIn" onMouseDown={onClose} role="presentation"><section style={{ position: "relative", width: "min(700px, calc(100vw - 28px))", maxHeight: "min(760px, calc(100vh - 28px))", overflowY: "auto", background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 20, boxShadow: "0 30px 90px -28px rgba(0,0,0,.72)" }} className="materialize audioModal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="audio-title">
    <header style={{ display: "flex", alignItems: "flex-start", gap: 13, padding: "24px 62px 20px 24px", borderBottom: `1px solid ${T.paperEdge}`, background: "linear-gradient(135deg, #f7fbf9 0%, #faf7f1 62%)" }}>
      <span style={{ display: "grid", placeItems: "center", width: 44, height: 44, flexShrink: 0, borderRadius: 13, color: "#fff", background: T.teal, boxShadow: "0 8px 20px -10px rgba(14,122,107,.8)" }}><Volume2 size={22} /></span>
      <div><h2 id="audio-title" style={{ margin: 0, color: T.text, fontSize: 22, letterSpacing: "-.02em" }}>Open-ended audio review</h2><p style={{ color: T.muted, margin: "4px 0 0", fontSize: 14, lineHeight: 1.45 }}>Hear a concise question—without answer choices—think through the pause, then hear the answer.</p></div>
      <button style={{ ...s.close, position: "absolute", top: 20, right: 20 }} onClick={onClose} aria-label="Close audio player"><X size={17} strokeWidth={2.3} /></button>
    </header>
    <div style={{ padding: "22px 24px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16, color: T.tealDeep, fontSize: 12.5 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 700 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: T.teal }} />Audio library ready</span><span>{all.length.toLocaleString()} questions</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(150px, .46fr)", gap: 12 }} className="audioGrid"><label style={field}>TOPIC<select value={topic} onChange={(e) => { stop(); setTopic(e.target.value); }} style={control}><option value="all">All topics</option>{topics.map((t) => <option key={t}>{t}</option>)}</select></label><label style={field}>QUEUE SIZE<select value={count} onChange={(e) => { stop(); setCount(e.target.value === "all" ? "all" : Number(e.target.value)); }} style={control}>{[10, 20, 40, 100].map((n) => <option key={n} value={n}>Up to {n}</option>)}<option value="all">All matching</option></select></label></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12, marginTop: 14 }} className="audioGrid"><label style={field}>ORDER<select value={order} onChange={(e) => { stop(); setOrder(e.target.value as typeof order); }} style={control}><option value="shuffle">Shuffled</option><option value="bank">Bank order</option></select></label><label style={field}>PLAYBACK SPEED<select value={playbackRate} onChange={(e) => { const next = Number(e.target.value); setPlaybackRate(next); if (audioRef.current) audioRef.current.playbackRate = next; if (activeSession.current) { activeSession.current.playback_rate = next; persistSession(activeSession.current); } }} style={control}>{AUDIO_PLAYBACK_RATES.map((rate) => <option key={rate} value={rate}>{rate}×</option>)}</select></label><label style={field}>VOLUME<select value={volumeGain} onChange={(e) => { const next = Number(e.target.value); setVolumeGain(next); if (audioGainRef.current) audioGainRef.current.gain.value = next; }} style={control}>{AUDIO_VOLUME_GAINS.map((gain) => <option key={gain} value={gain}>{Math.round(gain * 100)}%</option>)}</select></label><label style={field}>THINKING PAUSE<select value={recallSecs} onChange={(e) => setRecallSecs(Number(e.target.value))} style={control}>{[3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n} sec</option>)}</select></label><label style={field}>BETWEEN QUESTIONS<select value={transitionSecs} onChange={(e) => setTransitionSecs(Number(e.target.value))} style={control}>{[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n} sec</option>)}</select></label></div>
      <div style={{ marginTop: 18, padding: "14px 15px", borderRadius: 12, border: "1px solid rgba(14,122,107,.12)", background: T.tealSoft, color: T.tealDeep, fontSize: 14, lineHeight: 1.45 }}><b>{queueLabel} in this review.</b> <span style={{ color: T.muted }}>{matching.length.toLocaleString()} {matching.length === 1 ? "question" : "questions"} {matchingScope}.</span>{order === "shuffle" && matching.length > 1 && <button onClick={() => { stop(); setShuffleSeed((n) => n + 1); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 8, padding: 0, border: 0, background: "transparent", color: T.tealDeep, font: "inherit", fontWeight: 700, cursor: "pointer" }}><Shuffle size={13} /> Reshuffle</button>}</div>
      {currentProgress && playState === "idle" && <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 12, padding: "13px 15px", borderRadius: 12, border: `1px solid ${T.gold}55`, background: T.goldSoft, color: T.text }}>
        <div style={{ flex: 1, minWidth: 190 }}><b style={{ fontSize: 14 }}>Continue where you left off</b><div style={{ marginTop: 3, color: T.muted, fontSize: 12.5 }}>Question {currentProgress.current_index + 1} of {currentProgress.question_ids.length} · saved {new Date(currentProgress.updated_at).toLocaleDateString()}</div></div>
        <button style={{ ...s.ghost, background: "#fff", padding: "8px 13px" }} onClick={() => void play(currentProgress)}><Play size={14} /> Continue</button>
      </div>}
      {playState !== "idle" && <div style={{ marginTop: 14, padding: "15px 16px", borderRadius: 13, background: T.ink, color: "#fff", overflow: "hidden" }} aria-live="polite">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span className="audioPulse" aria-hidden><Volume2 size={17} /></span><div style={{ minWidth: 0 }}><b>{playState === "loading" ? "Preparing your review" : `Question ${(activeIndex ?? 0) + 1} of ${playbackTotal}`}</b><div style={{ color: "#b9c4cf", fontSize: 13, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{playState === "loading" ? `Loading ${queueLabel}…` : playbackPhase === "question" ? `Question · ${playbackRate}×` : playbackPhase === "thinking" ? `Thinking pause · ${activeSession.current?.recall_seconds ?? recallSecs} sec` : playbackPhase === "answer" ? `Answer & teaching point · ${playbackRate}×` : playbackPhase === "between" ? "Next question coming up" : topicLabel}</div></div></div>
        <div style={{ height: 5, borderRadius: 999, marginTop: 13, background: "rgba(255,255,255,.16)", overflow: "hidden" }}><div style={{ height: "100%", width: playState === "loading" ? "8%" : `${(((activeIndex ?? 0) + 1) / Math.max(playbackTotal, 1)) * 100}%`, background: "#7ee0cf", borderRadius: 999, transition: "width .35s ease" }} /></div>
        <div className="audioWave" aria-hidden><i /><i /><i /><i /><i /><i /><i /></div>
      </div>}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 18 }} className="audioActions"><button style={{ ...s.primarySm, minWidth: 144, justifyContent: "center", padding: "10px 16px" }} disabled={!chosen.length || playState !== "idle"} onClick={() => void play()}><Play size={15} /> {playState === "loading" ? "Preparing…" : playState === "playing" ? "Playing" : currentProgress ? "Start over" : "Start review"}</button>{playState !== "idle" && <button style={{ ...s.ghost, padding: "10px 15px" }} onClick={() => stop()}><Square size={13} /> Save & stop</button>}<span style={{ marginLeft: "auto", color: T.faint, fontSize: 12.5 }}>Progress saves automatically</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 18, paddingTop: 17, borderTop: `1px solid ${T.paperEdge}` }}>
        <div style={{ flex: 1, minWidth: 210 }}><b style={{ color: T.text, fontSize: 14 }}>{topic === "all" ? "Take the complete library offline" : "Take the complete topic offline"}</b><div style={{ marginTop: 3, color: T.faint, fontSize: 12.5 }}>{currentExport ? `One open-ended MP3 · ${currentExport.question_count.toLocaleString()} questions · ${currentExportVariant?.between_question_seconds ?? 1}-sec gaps · ${exportHours} · ${exportSize}${currentExportVariant?.parts?.length ? ` · securely assembled from ${currentExportVariant.parts.length} sections` : ""}` : "The single-file open-ended download for this selection is being prepared."}</div></div>
        <label style={{ ...field, minWidth: 100 }}>MP3 GAP<select value={downloadGap} onChange={(e) => setDownloadGap(Number(e.target.value))} disabled={!downloadGapOptions.length} style={{ ...control, paddingTop: 9, paddingBottom: 9 }}>{downloadGapOptions.map((gap) => <option key={gap} value={gap}>{gap} sec</option>)}</select></label>
        <label style={{ ...field, minWidth: 100 }}>MP3 SPEED<select value={downloadRate} onChange={(e) => setDownloadRate(Number(e.target.value))} disabled={!currentGapVariants.length} style={{ ...control, paddingTop: 9, paddingBottom: 9 }}>{currentGapVariants.map((variant) => <option key={variant.playback_rate} value={variant.playback_rate}>{variant.playback_rate}×</option>)}</select></label>
        <button style={{ ...s.ghost, padding: "9px 14px" }} disabled={!currentExportVariant || downloadBusy} onClick={() => void downloadExport()}><Download size={14} /> {downloadProgress ? `Assembling ${downloadProgress.current}/${downloadProgress.total}…` : downloadBusy ? "Preparing…" : "Download MP3"}</button>
      </div>
    </div>
  </section></div>;
}

function DeckBuilder({
  all, byId, onClose, onOpen, onStudy, onSaveTest, fire, usedGroupKeys, answers, kaplanRefs, kaplanErr, kind = "prite",
}: {
  all: RawQuestion[];
  byId: Map<string, RawQuestion>;
  onClose: () => void;
  onOpen: (id: string) => void;
  onStudy?: (qs: RawQuestion[], label: string) => void;
  onSaveTest?: (qids: string[]) => void;
  fire: (m: string) => void;
  usedGroupKeys?: Set<string>; // repeat-groups already in the user's saved tests
  answers: Record<string, AnswerRow>; // this user's attempt history
  kaplanRefs: Record<string, KaplanRef>; // question id -> textbook citation, {} until loaded
  kaplanErr?: string | null; // why they didn't load, shown instead of a silently dead filter
  kind?: "prite" | "neuro" | "therapy" | "meds";
}) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"both" | "stem" | "choices" | "answer">("both");
  const [year, setYear] = useState("all");
  const [cat, setCat] = useState("all");
  const [med, setMed] = useState("all");
  const [dx, setDx] = useState("all");
  const [topic, setTopic] = useState("all");
  const [progress, setProgress] = useState<ProgressFilter>("all");
  const [repeatMin, setRepeatMin] = useState("all");
  const [kaplan, setKaplan] = useState<"all" | "with" | "without">("all");
  const [sortBy, setSortBy] = useState<"default" | "repeats">("default");
  // On by default: collapse cross-year repeats to one, and drop questions
  // already handed out in a saved test — so a generated set doesn't repeat
  // last week's or double up the same item. Uncheck to see everything.
  const [avoidDup, setAvoidDup] = useState(!isPracticeBank(kind));
  // Restrict to the categories this resident scores worst in (see weakAreas).
  const [weakOnly, setWeakOnly] = useState(false);
  // The nine dropdowns start folded: most people want a preset and a "go".
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [shuffleOrder, setShuffleOrder] = useState(false);
  const [sampleN, setSampleN] = useState(20);
  const [pptxWithExpl, setPptxWithExpl] = useState(false);

  const years = useMemo(() => {
    const ys = Array.from(new Set(all.map((q) => q.year)));
    if (kind === "neuro") return ys.sort((a, b) => neuroYearRank(a) - neuroYearRank(b));
    if (kind === "therapy") {
      return ys.sort((a, b) => {
        const qa = all.find((q) => q.year === a);
        const qb = all.find((q) => q.year === b);
        const ma = qa ? therapyModality(qa) : "";
        const mb = qb ? therapyModality(qb) : "";
        const mr = therapyModalityRank(ma) - therapyModalityRank(mb);
        if (mr) return mr;
        if (ma === "Bienenfeld") return bienenfeldYearRank(a) - bienenfeldYearRank(b);
        return a.localeCompare(b);
      });
    }
    if (kind === "meds") {
      return ys.sort((a, b) => {
        const qa = all.find((q) => q.year === a);
        const qb = all.find((q) => q.year === b);
        const ca = qa ? carlatCategory(qa) : "";
        const cb = qb ? carlatCategory(qb) : "";
        const cr = carlatCategoryRank(ca) - carlatCategoryRank(cb);
        if (cr) return cr;
        return a.localeCompare(b);
      });
    }
    return ys.sort((a, b) => a.localeCompare(b));
  }, [all, kind]);
  const cats = useMemo(() => {
    const m = new Map<string, string>();
    all.forEach((q) => { if (q.prite_category) m.set(q.prite_category, q.prite_label || q.prite_category); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [all]);
  const uniq = (key: "medication" | "diagnosis" | "topics") =>
    Array.from(new Set(all.flatMap((q) => q.tags?.[key] ?? []))).sort();
  const meds = useMemo(() => uniq("medication"), [all]);
  const dxs = useMemo(() => uniq("diagnosis"), [all]);
  const topics = useMemo(() => uniq("topics").filter((t) => t !== "Kaufman"), [all]);
  const neuroTopics = useMemo(() => {
    const names = new Set<string>();
    for (const q of all) {
      const label = neuroTopicLabel(neuroChapter(q));
      if (label && label !== "Kaufman") names.add(label);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [all]);

  // Where each question stands for this user. "Got wrong" keys off the latest
  // attempt and ignores `cleared` — dismissing the learning-opportunities nag
  // shouldn't erase the fact that you missed it and might want another go.
  const progressOf = (q: RawQuestion): ProgressFilter => {
    const row = answers[questionId(q.year, q.q_index)];
    return !row ? "unseen" : row.correct ? "correct" : "missed";
  };
  const progressCounts = useMemo(() => {
    const c = { all: all.length, unseen: 0, missed: 0, correct: 0 };
    for (const q of all) c[progressOf(q)]++;
    return c;
  }, [all, answers]); // eslint-disable-line

  /* Shared with the daily-set ordering so "my weakest sections" means exactly
     the same thing in the filter panel and in What comes first. */
  const weakAreas = useMemo(() => weakCategories(all, answers), [all, answers]);
  const weakCatSet = useMemo(() => new Set(weakAreas.map((w) => w.cat)), [weakAreas]);
  /* How many of the folded-away filters are actually doing something. Drives the
     badge on "More filters" so a narrowed result never looks unexplained. */
  const activeFilterCount = useMemo(() => {
    let n = 0;
    for (const v of [year, cat, topic, med, dx, repeatMin, kaplan, progress]) if (v !== "all") n += 1;
    if (sortBy !== "default") n += 1;
    if (scope !== "both") n += 1;
    if (weakOnly) n += 1;
    return n;
  }, [year, cat, topic, med, dx, repeatMin, kaplan, progress, sortBy, scope, weakOnly]);
  const catLabel = useMemo(() => new Map(cats), [cats]);

  // How many questions each one-tap preset would actually hand you.
  const presetCounts = useMemo(() => {
    const highYield = new Set<string>();
    const weak = new Set<string>();
    for (const q of all) {
      if ((q.repeat_count ?? 1) >= 3) highYield.add(questionGroupKey(q));
      if (weakCatSet.has(q.prite_category ?? "") && progressOf(q) !== "correct") {
        weak.add(questionGroupKey(q));
      }
    }
    return { highYield: highYield.size, weak: weak.size };
  }, [all, weakCatSet, answers]); // eslint-disable-line

  // How many of the loaded questions have a textbook citation. Counted against
  // `all` rather than the bundle so the number matches what's actually browsable.
  const kaplanCount = useMemo(
    () => all.reduce((n, q) => n + (kaplanRefs[questionId(q.year, q.q_index)] ? 1 : 0), 0),
    [all, kaplanRefs]
  );

  // Raw filter/search result, before de-duplication.
  const rawMatches = useMemo(() => {
    const filtered = all.filter((q) => {
      if (year !== "all" && q.year !== year) return false;
      if (cat !== "all" && q.prite_category !== cat) return false;
      if (med !== "all" && !(q.tags?.medication ?? []).includes(med)) return false;
      if (dx !== "all" && !(q.tags?.diagnosis ?? []).includes(dx)) return false;
      if (topic !== "all") {
        if (kind === "neuro") {
          if (neuroTopicLabel(neuroChapter(q)) !== topic) return false;
        } else if (!(q.tags?.topics ?? []).includes(topic)) {
          return false;
        }
      }
      if (progress !== "all" && progressOf(q) !== progress) return false;
      if (repeatMin !== "all" && (q.repeat_count ?? 1) < parseInt(repeatMin, 10)) return false;
      // Weak-areas mode: only the low-accuracy categories, and skip anything
      // already answered correctly — practising those isn't what's needed here.
      if (weakOnly) {
        if (!weakCatSet.has(q.prite_category ?? "")) return false;
        if (progressOf(q) === "correct") return false;
      }
      if (kaplan !== "all") {
        const cited = !!kaplanRefs[questionId(q.year, q.q_index)];
        if (kaplan === "with" ? !cited : cited) return false;
      }
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
  }, [all, year, cat, med, dx, topic, progress, answers, repeatMin, kaplan, kaplanRefs, sortBy, search, scope, weakOnly, weakCatSet, kind]); // eslint-disable-line

  // De-duplicated view: drop questions whose repeat-group is already in a
  // saved test, then collapse remaining cross-year twins to one apiece
  // (keeping the first, so the sort/order is preserved). This is the working
  // set everything below acts on, so Pick-random / Study / Save all inherit it.
  const matches = useMemo(() => {
    if (!avoidDup) return rawMatches;
    const out: RawQuestion[] = [];
    const seen = new Set<string>();
    for (const q of rawMatches) {
      const g = questionGroupKey(q);
      if (usedGroupKeys?.has(g) || seen.has(g)) continue;
      seen.add(g);
      out.push(q);
    }
    return out;
  }, [rawMatches, avoidDup, usedGroupKeys]);
  const dupHidden = rawMatches.length - matches.length;

  // when the filter changes, select all matches by default
  useEffect(() => { setSelected(new Set(matches.map((q) => questionId(q.year, q.q_index)))); }, [year, cat, med, dx, topic, progress, repeatMin, kaplan, sortBy, search, scope, avoidDup]); // eslint-disable-line

  const toggle = (id: string) => setSelected((cur) => {
    const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // hand the picked questions (in list order) to a custom study session
  const study = () => {
    let ordered = matches.filter((q) => selected.has(questionId(q.year, q.q_index)));
    if (!ordered.length) return;
    if (shuffleOrder) ordered = shuffleKeepingTherapySequences(ordered, shuffled);
    else ordered = keepTherapySequencesTogether(expandTherapySequences(ordered, all));
    const parts: string[] = [];
    if (progress !== "all") parts.push(progressLabel[progress]);
    if (cat !== "all") parts.push(cats.find(([k]) => k === cat)?.[1] ?? cat);
    if (dx !== "all") parts.push(dx);
    if (med !== "all") parts.push(med);
    if (year !== "all") parts.push(year);
    if (topic !== "all") parts.push(topic);
    if (search.trim()) parts.push(`"${search.trim()}"`);
    onStudy?.(ordered, parts.join(" · "));
  };

  /* One-click presets. Each clears every other filter first, so a resident who
     wants "the ones I got wrong" gets exactly that instead of the leftovers of
     whatever they last searched. Repeat-collapsing stays on for fresh questions
     (no point studying the same item twice) but comes off for history-based
     picks — if you missed both copies of a repeat, you should see both. */
  const applyPreset = (p: ProgressFilter) => {
    setSearch(""); setScope("both");
    setYear("all"); setCat("all"); setMed("all"); setDx("all"); setTopic("all");
    setRepeatMin("all"); setSortBy("default"); setWeakOnly(false);
    setAvoidDup(p === "all" || p === "unseen");
    setProgress(p);
  };

  /* Questions the PRITE has asked 3+ times across the years — the closest thing
     the bank has to a "this will be on the exam" list. Sorted most-repeated
     first, de-duplicated so you see each one once rather than once per year. */
  const applyHighYield = () => {
    setSearch(""); setScope("both");
    setYear("all"); setCat("all"); setMed("all"); setDx("all"); setTopic("all");
    setProgress("all"); setWeakOnly(false); setKaplan("all");
    setRepeatMin("3"); setSortBy("repeats"); setAvoidDup(true);
  };

  /* Your lowest-accuracy categories, minus anything you've already gotten
     right. Needs some answer history before it can rank anything. */
  const applyWeakAreas = () => {
    setSearch(""); setScope("both");
    setYear("all"); setCat("all"); setMed("all"); setDx("all"); setTopic("all");
    setProgress("all"); setRepeatMin("all"); setSortBy("default"); setKaplan("all");
    setAvoidDup(true); setWeakOnly(true);
  };

  // randomly select N of the current matches (capped to however many match)
  const pickRandom = () => {
    const n = Math.max(1, Math.min(sampleN, matches.length));
    const pick = expandTherapySequences(shuffled(matches).slice(0, n), all);
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
    <div data-scrim style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 640 }} onClick={(e) => e.stopPropagation()} className="rise deckPanel">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Search · study · export</div>
            <div style={s.apTitle}>{kind === "neuro" ? "Filter Kaufman questions" : kind === "therapy" ? "Filter therapy questions" : kind === "meds" ? "Filter medication questions" : "Build a study set"}</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.deckFilters}>
          {/* Quick start: the two things people actually come here for, one tap
              each, above the fold. Everything below still composes on top. */}
          <div style={s.quickRow}>
            <span style={s.quickLabel} className="quickLabel">Quick start</span>
            {([
              { p: "unseen" as const, icon: <Sparkles size={13} strokeWidth={2.3} />, text: "Ones I haven't tried" },
              { p: "missed" as const, icon: <RotateCcw size={13} strokeWidth={2.3} />, text: "Ones I got wrong" },
              { p: "correct" as const, icon: <Check size={13} strokeWidth={2.6} />, text: "Ones I got right" },
              { p: "all" as const, icon: <Layers size={13} strokeWidth={2.3} />, text: "Everything" },
            ]).map(({ p, icon, text }) => (
              <button
                key={p}
                style={{ ...s.quickBtn, ...(progress === p ? s.quickBtnOn : {}) }}
                onClick={() => applyPreset(p)}
                title={
                  p === "unseen" ? "Questions you've never answered"
                    : p === "missed" ? "Questions you missed on your last attempt — a second crack at them"
                      : p === "correct" ? "Questions you've already gotten right"
                        : "Clear every filter and start over"
                }
              >
                {icon} {text} <b style={{ fontWeight: 700 }}>{progressCounts[p].toLocaleString()}</b>
              </button>
            ))}
          </div>
          {/* Two targeted sets people asked for: the questions the exam keeps
              reusing, and the sections you personally score worst in. */}
          <div style={s.quickRow}>
            <span style={s.quickLabel} className="quickLabel">Targeted</span>
            {!isPracticeBank(kind) && (
            <button
              style={{ ...s.quickBtn, ...(repeatMin === "3" && sortBy === "repeats" && !weakOnly ? s.quickBtnOn : {}) }}
              onClick={applyHighYield}
              title="Questions the PRITE has asked 3 or more times across different years — the highest-yield items in the bank"
            >
              <Repeat size={13} strokeWidth={2.3} /> High-yield repeats{" "}
              <b style={{ fontWeight: 700 }}>{presetCounts.highYield.toLocaleString()}</b>
            </button>
            )}
            <button
              style={{ ...s.quickBtn, ...(weakOnly ? s.quickBtnOn : {}), ...(weakAreas.length ? {} : { opacity: 0.45, cursor: "not-allowed" }) }}
              onClick={() => weakAreas.length && applyWeakAreas()}
              disabled={!weakAreas.length}
              title={
                weakAreas.length
                  ? `Your lowest-scoring ${kind === "therapy" ? "modalities" : kind === "neuro" ? "chapters" : kind === "meds" ? "medication classes" : "categories"}: ${weakAreas.map((w) => catLabel.get(w.cat) ?? w.cat).join(", ")}`
                  : "Answer a few more questions first — this needs some history before it can tell which sections are giving you trouble"
              }
            >
              <Target size={13} strokeWidth={2.3} /> {kind === "therapy" ? "Modalities I’m weakest in" : kind === "neuro" ? "Chapters I’m weakest in" : kind === "meds" ? "Classes I’m weakest in" : "Areas I\u2019m weakest in"}{" "}
              <b style={{ fontWeight: 700 }}>{weakAreas.length ? presetCounts.weak.toLocaleString() : "—"}</b>
            </button>
          </div>
          {(kind === "neuro" || kind === "therapy" || kind === "meds") && (
            <div style={{ margin: "4px 0 10px" }}>
              <span style={s.quickLabel} className="quickLabel">{kind === "neuro" ? "Chapters" : kind === "meds" ? "Classes" : "Modalities"}</span>
              <BankTopicFilters
                mode={kind}
                all={all}
                year={year}
                modality={cat === "all" ? "all" : (catLabel.get(cat) || cat)}
                onYear={(y) => { setYear(y); setTopic("all"); }}
                onModality={(m) => { setCat(m === "all" ? "all" : slug(m)); setYear("all"); setTopic("all"); }}
              />
            </div>
          )}
          <p style={s.quickHint}>
            {weakOnly && weakAreas.length ? (
              <>
                Your weakest sections right now:{" "}
                {weakAreas.map((w, i) => (
                  <span key={w.cat}>
                    {i > 0 ? ", " : ""}
                    <b style={{ color: T.text }}>{catLabel.get(w.cat) ?? w.cat}</b>{" "}
                    ({Math.round(w.acc * 100)}% of {w.tried})
                  </span>
                ))}
                . Ones you already got right are left out.
              </>
            ) : (
              <>Pick one, narrow it further below if you like, then hit <b style={{ color: T.text }}>Study these</b> at the bottom.</>
            )}
          </p>
          <div style={s.deckSearchRow}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={kind === "therapy" ? "Search (e.g. transference, Kohut, exposure)" : kind === "neuro" ? "Search (e.g. seizure, aphasia, MS)" : kind === "meds" ? "Search (e.g. clozapine, lithium, QT)" : "Search for a word (e.g. fluoxetine)"} style={{ ...s.deckSearch, marginBottom: 0, flex: 1 }} />
            <button
              style={{ ...s.moreBtn, ...(showAdvanced || activeFilterCount > 0 ? s.moreBtnOn : {}) }}
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              title={kind === "therapy" ? "Modality, chapter or topic, and how you've done" : kind === "neuro" ? "Chapter, topic, and how you've done" : "Year, category, topic, medication, diagnosis, repeats, textbook citations, and sort order"}
            >
              {showAdvanced ? <ChevronUp size={14} strokeWidth={2.4} /> : <ChevronDown size={14} strokeWidth={2.4} />}
              More filters
              {activeFilterCount > 0 && <span style={s.moreCount}>{activeFilterCount}</span>}
            </button>
            {activeFilterCount > 0 && (
              <button style={s.clearBtn} onClick={() => applyPreset("all")} title="Clear every filter and start over">
                Clear
              </button>
            )}
          </div>

          {/* Everything below is optional. It stays folded away by default so the
              panel opens as "pick a set and go" rather than a wall of dropdowns. */}
          {showAdvanced && (
            <div style={s.advWrap}>
              <div style={s.advGroup}>
                <span style={s.advLabel}>What it&rsquo;s about</span>
                <div style={s.deckSelRow}>
                  {kind !== "neuro" && (
                    <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ ...s.cohortSel, ...(cat !== "all" ? s.cohortSelOn : {}) }}>
                      <option value="all">{kind === "therapy" ? "Any modality" : "Any category"}</option>{cats.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                    </select>
                  )}
                  {kind !== "therapy" && (
                    <select value={topic} onChange={(e) => setTopic(e.target.value)} style={{ ...s.cohortSel, ...(topic !== "all" ? s.cohortSelOn : {}) }}>
                      <option value="all">Any topic</option>
                      {(kind === "neuro" ? neuroTopics : topics).map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  )}
                  {kind === "prite" && (
                    <select value={med} onChange={(e) => setMed(e.target.value)} style={{ ...s.cohortSel, ...(med !== "all" ? s.cohortSelOn : {}) }}>
                      <option value="all">Any medication</option>{meds.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                  {kind === "prite" && (
                    <select value={dx} onChange={(e) => setDx(e.target.value)} style={{ ...s.cohortSel, ...(dx !== "all" ? s.cohortSelOn : {}) }}>
                      <option value="all">Any diagnosis</option>{dxs.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  )}
                  <select value={year} onChange={(e) => setYear(e.target.value)} style={{ ...s.cohortSel, ...(year !== "all" ? s.cohortSelOn : {}) }}>
                    <option value="all">{kind === "neuro" ? "Any chapter" : kind === "therapy" ? "Any chapter or topic" : kind === "meds" ? "Any medication" : "Any year"}</option>
                    {kind === "therapy"
                      ? years.reduce<{ mod: string; items: string[] }[]>((groups, y) => {
                          const sample = all.find((q) => q.year === y);
                          const mod = sample ? therapyModality(sample) : "Other";
                          const last = groups[groups.length - 1];
                          if (last && last.mod === mod) last.items.push(y);
                          else groups.push({ mod, items: [y] });
                          return groups;
                        }, []).map((g) => (
                          <optgroup key={g.mod} label={g.mod}>
                            {g.items.map((y) => (
                              <option key={y} value={y}>
                                {g.mod === "Bienenfeld" ? bienenfeldChapterLabel(y) : y}
                              </option>
                            ))}
                          </optgroup>
                        ))
                      : years.map((y) => {
                      const sample = all.find((q) => q.year === y);
                      const label = kind === "neuro" && sample
                        ? neuroChapterOptionLabel(y, neuroChapter(sample))
                        : y;
                      return <option key={y} value={y}>{label}</option>;
                    })}
                  </select>
                </div>
              </div>

              <div style={s.advGroup}>
                <span style={s.advLabel}>{isPracticeBank(kind) ? "How you’ve done" : "How you’ve done & how high-yield"}</span>
                <div style={s.deckSelRow}>
                  <select
                    value={progress}
                    onChange={(e) => setProgress(e.target.value as ProgressFilter)}
                    style={{ ...s.cohortSel, ...(progress !== "all" ? s.cohortSelOn : {}) }}
                    title="Filter by how you've done on each question so far"
                  >
                    <option value="all">Your history: any ({progressCounts.all.toLocaleString()})</option>
                    <option value="unseen">Haven&rsquo;t tried yet ({progressCounts.unseen.toLocaleString()})</option>
                    <option value="missed">I got wrong ({progressCounts.missed.toLocaleString()})</option>
                    <option value="correct">I got right ({progressCounts.correct.toLocaleString()})</option>
                  </select>
                  {!isPracticeBank(kind) && (
                  <select value={repeatMin} onChange={(e) => setRepeatMin(e.target.value)} style={{ ...s.cohortSel, ...(repeatMin !== "all" ? s.cohortSelOn : {}) }} title="Questions reused (verbatim or near-verbatim) across multiple years">
                    <option value="all">Any (repeat or not)</option>
                    <option value="2">Repeated 2+ years</option>
                    <option value="3">Repeated 3+ years</option>
                    <option value="4">Repeated 4+ years</option>
                  </select>
                  )}
                  {!isPracticeBank(kind) && (
                  <select
                    value={kaplan}
                    onChange={(e) => setKaplan(e.target.value as "all" | "with" | "without")}
                    style={{ ...s.cohortSel, ...(kaplan !== "all" ? s.cohortSelOn : {}) }}
                    disabled={kaplanCount === 0}
                    title={kaplanErr
                      ? `Textbook citations couldn't load — ${kaplanErr}`
                      : kaplanCount === 0
                        ? "Textbook citations are still loading…"
                        : "Questions with a verified supporting passage from Kaplan & Sadock, shown on the question's Textbook tab"}
                  >
                    <option value="all">Any (textbook or not)</option>
                    <option value="with">Has textbook citation{kaplanCount ? ` (${kaplanCount})` : ""}</option>
                    <option value="without">No textbook citation</option>
                  </select>
                  )}
                </div>
              </div>

              <div style={s.advGroup}>
                <span style={s.advLabel}>Search &amp; order</span>
                <div style={s.deckSelRow}>
                  <div style={s.scopeToggle}>
                    {(["both", "stem", "choices", "answer"] as const).map((sc) => (
                      <button key={sc} style={{ ...s.scopeBtn, ...(scope === sc ? s.scopeOn : {}) }} onClick={() => setScope(sc)}>
                        {sc === "both" ? "Anywhere" : sc === "stem" ? "Stem" : sc === "choices" ? "Choices" : "Answer"}
                      </button>
                    ))}
                  </div>
                  {!isPracticeBank(kind) && (
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as "default" | "repeats")} style={{ ...s.cohortSel, ...(sortBy !== "default" ? s.cohortSelOn : {}) }} title="Order the results below">
                    <option value="default">Sort: default order</option>
                    <option value="repeats">Sort: most repeated first</option>
                  </select>
                  )}
                </div>
              </div>

              {!isPracticeBank(kind) && kaplanErr && (
                <span style={{ fontSize: 12, color: T.wrongText, background: T.wrongBg,
                               border: `1px solid ${T.wrongLine}33`, borderRadius: 8,
                               padding: "6px 10px", alignSelf: "center", maxWidth: 460 }}>
                  Textbook citations couldn&rsquo;t load — {kaplanErr}
                </span>
              )}
            </div>
          )}
          <div style={s.deckCount}>
            <span><b style={{ color: T.text }}>{matches.length}</b> match · <b style={{ color: T.teal }}>{selected.size}</b> selected</span>
            {!isPracticeBank(kind) && (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: T.muted, cursor: "pointer", marginLeft: 14 }}
              title="Skip cross-year repeats of the same question and any question already in one of your saved tests — so a generated set doesn't reuse last week's or double up an item">
              <input type="checkbox" checked={avoidDup} onChange={(e) => setAvoidDup(e.target.checked)} />
              Avoid repeats &amp; already-used
              {avoidDup && dupHidden > 0 && <span style={{ color: T.faint }}>({dupHidden} hidden)</span>}
            </label>
            )}
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
        <div style={s.apBody} className="deckBody">
          {matches.length === 0 && (
            <p style={s.apEmpty}>
              {progress === "missed" && progressCounts.missed === 0
                ? "You haven't missed any questions yet — nothing to redo."
                : progress === "unseen" && progressCounts.unseen === 0
                  ? "You've answered every question in the bank. Try “Ones I got wrong” instead."
                  : progress === "correct" && progressCounts.correct === 0
                    ? "No answered-correctly questions yet."
                    : "No questions match these filters."}
            </p>
          )}
          {shown.map((q) => {
            const id = questionId(q.year, q.q_index);
            const st = progressOf(q);
            return (
              <div key={id} style={s.deckRow}>
                <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} style={{ marginTop: 4 }} />
                <div style={s.deckRowText} onClick={() => onOpen(id)} title="Open this question">
                  <div style={s.deckRowMeta}>
                    {/* At-a-glance history, so a mixed list is still scannable */}
                    <span
                      style={{
                        ...s.histBadge,
                        color: st === "missed" ? T.wrongText : st === "correct" ? T.correctText : T.faint,
                        background: st === "missed" ? T.wrongBg : st === "correct" ? T.correctBg : "transparent",
                        borderColor: st === "missed" ? T.wrongLine : st === "correct" ? T.correctLine : T.paperEdge,
                      }}
                      title={st === "missed" ? "You missed this one" : st === "correct" ? "You got this one right" : "You haven't tried this one"}
                    >
                      {st === "missed" ? "Missed" : st === "correct" ? "Correct" : "New"}
                    </span>
                    {kind === "therapy"
                      ? `${q.quizapine?.modality || q.prite_label || "Therapy"} · ${q.bienenfeld ? bienenfeldChapterLabel(q.year) : q.year}${q.bienenfeld?.page != null ? ` · p. ${q.bienenfeld.page}` : ""}`
                      : kind === "neuro"
                        ? neuroChapterOptionLabel(q.year, neuroChapter(q))
                      : `${q.year} · Q${q.q_index} · ${q.prite_label}`}
                    {!isPracticeBank(kind) && (q.repeat_count ?? 1) > 1 && (
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
    <div data-scrim style={s.scrim} onClick={onClose}>
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

function shareLabel(t: SavedTest): string | null {
  if (!t.mine) return t.owner_name ? `From ${t.owner_name}` : "Shared with you";
  if (t.visibility === "everyone") return "Everyone";
  if (t.visibility === "chiefs") return t.shared_with.length ? `Ed chiefs + ${t.shared_with.length}` : "Ed chiefs";
  if (t.shared_with.length) return `${t.shared_with.length} person${t.shared_with.length === 1 ? "" : "s"}`;
  return null;
}

function ShareTestModal({
  test, onClose, onSaved,
}: {
  test: SavedTest;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [visibility, setVisibility] = useState<TestVisibility>(test.visibility);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(test.shared_with));
  const [people, setPeople] = useState<SharePerson[] | null>(null);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listShareablePeople().then((list) => { if (alive) setPeople(list); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = people ?? [];
    if (!needle) return list;
    return list.filter((p) =>
      p.name.toLowerCase().includes(needle) || (p.level ?? "").toLowerCase().includes(needle)
    );
  }, [people, q]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true); setErr(null);
    const ok = await shareTest(test.id, visibility, [...picked]);
    setSaving(false);
    if (!ok) { setErr("Couldn't update sharing — try signing in again."); return; }
    await onSaved();
    onClose();
  };

  const visCopy =
    visibility === "everyone" ? "Every approved account can study, host, or export this test."
    : visibility === "chiefs" ? "Education chiefs (and admins) can open it. Add extra names below if you want."
    : picked.size ? "Only you and the people you pick below can open it."
    : "Only you can see this test until you pick people or change who it's for.";

  return (
    <div data-scrim style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 480 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Share a saved test</div>
            <div style={s.apTitle}>{test.name}</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.apBody}>
          <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.6, margin: "0 0 12px" }}>
            Recipients can study it, host a live poll, or export the PowerPoint. They can't edit or delete your copy.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {([
              ["private", "Just me"],
              ["chiefs", "Ed chiefs"],
              ["everyone", "Everyone"],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                style={{ ...s.apToggle, ...(visibility === v ? s.apToggleOn : {}) }}
                onClick={() => setVisibility(v)}
              >
                {label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, margin: "0 0 14px" }}>{visCopy}</p>
          {visibility !== "everyone" && (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.4, margin: "4px 0 8px" }}>
                {visibility === "chiefs" ? "Also share with" : "Share with specific people"}
                {picked.size ? ` · ${picked.size} selected` : ""}
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name"
                style={{ ...s.deckSearch, marginBottom: 8 }}
              />
              {people === null && <p style={s.apEmpty}>Loading people…</p>}
              {people && filtered.length === 0 && <p style={s.apEmpty}>No matching names.</p>}
              {filtered.map((p) => {
                const on = picked.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%",
                      textAlign: "left", background: on ? T.tealSoft : "#fff",
                      border: `1px solid ${on ? T.teal : T.paperEdge}`,
                      borderRadius: 10, padding: "8px 10px", marginBottom: 6, cursor: "pointer",
                    }}
                  >
                    <span style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      display: "grid", placeItems: "center",
                      background: on ? T.teal : "#fff",
                      border: `1px solid ${on ? T.teal : T.paperEdge}`,
                      color: "#fff",
                    }}>
                      {on && <Check size={12} strokeWidth={3} />}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{p.name}</span>
                    {p.level && <span style={{ fontSize: 12, color: T.faint }}>{p.level}</span>}
                    {p.chief && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.tealDeep, background: T.tealSoft, borderRadius: 999, padding: "1px 7px" }}>
                        ed chief
                      </span>
                    )}
                  </button>
                );
              })}
            </>
          )}
          {err && <p style={{ ...s.apEmpty, color: T.wrongLine, fontStyle: "normal" }}>{err}</p>}
        </div>
        <div style={s.deckFoot}>
          <button style={{ ...s.primarySm, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={save}>
            <Share2 size={13} strokeWidth={2.3} /> {saving ? "Saving…" : "Save sharing"}
          </button>
          <button style={{ ...s.ghost, marginLeft: 0 }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function TestsPanel({
  tests, byId, onClose, onStudy, onHost, onPptx, onEdit, onRename, onDelete, onShare, guidesByTest, onStudyGuide, onOpenGuide, onSlides, canGenerate,
}: {
  tests: SavedTest[];
  byId: Map<string, RawQuestion>;
  onClose: () => void;
  onStudy: (t: SavedTest) => void;
  onHost: (t: SavedTest) => void;
  onPptx: (t: SavedTest) => void;
  onEdit: (t: SavedTest) => void;
  onRename: (t: SavedTest) => void;
  onDelete: (t: SavedTest) => void;
  onShare: (t: SavedTest) => void;
  guidesByTest: Record<string, StudyGuide>;
  onStudyGuide: (t: SavedTest) => void;
  onOpenGuide: (t: SavedTest, guide: StudyGuide) => void;
  onSlides: (t: SavedTest) => void;
  canGenerate: boolean; // admins + education-chief allowlist — generation costs money
}) {
  return (
    <div data-scrim style={s.scrim} onClick={onClose}>
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
            Tests someone shares with you will show up here too.
          </p>
        ) : (
          <div style={{ ...s.apBody, display: "grid", gap: 10 }}>
            {tests.map((t, i) => {
              const prev = tests[i - 1];
              const section =
                t.mine && (!prev || !prev.mine) && tests.some((x) => !x.mine) ? "Your tests"
                : !t.mine && (!prev || prev.mine) ? "Shared with you"
                : null;
              const found = t.qids.filter((id) => byId.has(id)).length;
              const shared = shareLabel(t);
              return (
                <React.Fragment key={t.id}>
                {section && <div style={{ ...s.apSectionLbl, margin: i === 0 ? "0 0 2px" : "8px 0 2px" }}>{section}</div>}
                <div style={{ border: `1px solid ${T.paperEdge}`, borderRadius: 12, padding: "12px 14px", background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <b style={{ fontSize: 15.5, color: T.text }}>{t.name}</b>
                    <span style={{ fontSize: 12.5, color: T.faint }}>
                      {found} question{found === 1 ? "" : "s"}{found !== t.qids.length ? ` (${t.qids.length - found} not in this bank)` : ""} · saved {new Date(t.created).toLocaleDateString()}
                    </span>
                    {shared && (
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: T.tealDeep, background: T.tealSoft, borderRadius: 999, padding: "2px 8px" }}>{shared}</span>
                    )}
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
                      // Generating costs money — chiefs/admins only, and only
                      // the owner can kick off a new run against this test.
                      // Once the slides exist this button is just a free
                      // download, so it stays for everyone who can see the test.
                      if (!hasSlides && (!canGenerate || !t.mine)) return null;
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
                          if (!t.mine || !canGenerate) {
                            return <span style={{ fontSize: 11.5, color: T.faint }}>guide still working…</span>;
                          }
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
                      if (!canGenerate || !t.mine) return null; // generating costs money — chiefs/admins only, owner only
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
                    {t.mine && (
                      <button style={{ ...s.ghost, marginLeft: 0 }} onClick={() => onShare(t)} title="Share with ed chiefs, everyone, or specific people">
                        <Share2 size={13} strokeWidth={2.3} /> Share
                      </button>
                    )}
                    {t.mine && (
                      <button style={{ ...s.ghost, marginLeft: 0 }} onClick={() => onEdit(t)} title="Add, remove, or reorder this test's questions">
                        <ListChecks size={13} strokeWidth={2.3} /> Edit questions
                      </button>
                    )}
                    {t.mine && (
                      <button style={{ ...s.ghost, marginLeft: 0 }} onClick={() => onRename(t)} title="Rename">
                        <Pencil size={13} strokeWidth={2.3} /> Rename
                      </button>
                    )}
                    {t.mine && (
                      <button style={{ ...s.ghost, marginLeft: 0, color: T.wrongLine }} onClick={() => onDelete(t)} title="Delete this test">
                        <Trash2 size={13} strokeWidth={2.3} /> Delete
                      </button>
                    )}
                  </div>
                </div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* Edit an existing saved test: add questions (search the bank), remove ones,
   and reorder. Built because AI-generated tests sometimes repeat questions
   already used — the host wants to prune/swap them without rebuilding the set
   from scratch. Works on a local copy of the qid list; nothing is written
   until Save. */
function TestEditor({
  test, all, byId, testsByGroupKey, onClose, onSave,
}: {
  test: SavedTest;
  all: RawQuestion[];
  byId: Map<string, RawQuestion>;
  testsByGroupKey: Map<string, { id: string; name: string }[]>;
  onClose: () => void;
  onSave: (qids: string[]) => Promise<void>;
}) {
  const [qids, setQids] = useState<string[]>(test.qids);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = qids.length !== test.qids.length || qids.some((id, i) => id !== test.qids[i]);

  const inTest = useMemo(() => new Set(qids), [qids]);
  // How many questions in the CURRENT (unsaved) test share each repeat-group,
  // so we can flag the two ECT items that are really the same question.
  const groupCountsHere = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of qids) {
      const q = byId.get(id);
      if (q) { const g = questionGroupKey(q); m.set(g, (m.get(g) ?? 0) + 1); }
    }
    return m;
  }, [qids, byId]);

  // The little repeat/reuse tags for a question. `dupHere` adds the
  // within-this-test warning (only shown for rows already in the test, not
  // for search candidates).
  const tagsFor = (q: RawQuestion, dupHere: boolean) => {
    const g = questionGroupKey(q);
    const tags: React.ReactNode[] = [];
    if (dupHere && (groupCountsHere.get(g) ?? 0) > 1) {
      tags.push(<span key="dup" style={s.tagDup} title="Another question in this test is the same item — you probably want only one">⚠ Duplicate in this test</span>);
    }
    const otherYears = (q.repeat_years ?? []).filter((y) => y !== q.year);
    if ((q.repeat_count ?? 1) > 1 && otherYears.length) {
      const label = otherYears.length === 1 ? `Question also in ${otherYears[0]} test` : `Question also in ${otherYears.join(", ")} tests`;
      tags.push(<span key="yr" style={s.tagYear} title={`This PRITE item also appeared on the ${otherYears.join(", ")} exam`}><Repeat size={10} strokeWidth={2.4} /> {label}</span>);
    }
    const others = (testsByGroupKey.get(g) ?? []).filter((t) => t.id !== test.id);
    if (others.length) {
      tags.push(<span key="poll" style={s.tagUsed} title={`Already in your saved test${others.length === 1 ? "" : "s"}: ${others.map((t) => t.name).join(", ")}`}><ListChecks size={10} strokeWidth={2.4} /> {others.length === 1 ? `In “${others[0].name}”` : `In ${others.length} other tests`}</span>);
    }
    return tags.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>{tags}</div> : null;
  };
  const remove = (id: string) => setQids((cur) => cur.filter((x) => x !== id));
  const add = (id: string) => setQids((cur) => (cur.includes(id) ? cur : [...cur, id]));
  const move = (i: number, dir: -1 | 1) => setQids((cur) => {
    const j = i + dir;
    if (j < 0 || j >= cur.length) return cur;
    const next = [...cur];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  // Candidate questions to add: match the search across stem/answer, excluding
  // ones already in the test. Only search once there's a query, and cap the
  // list so a broad term doesn't render thousands of rows.
  const matches = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return [];
    const out: RawQuestion[] = [];
    for (const q of all) {
      const id = questionId(q.year, q.q_index);
      if (inTest.has(id)) continue;
      if (q.stem.toLowerCase().includes(s) || (q.answer_text ?? "").toLowerCase().includes(s) ||
          `${q.year} ${q.q_index}`.toLowerCase().includes(s) || (q.prite_label ?? "").toLowerCase().includes(s)) {
        out.push(q);
        if (out.length >= 40) break;
      }
    }
    return out;
  }, [all, search, inTest]);

  const save = async () => {
    if (!qids.length) { if (!window.confirm("This test would have no questions. Save anyway?")) return; }
    setSaving(true);
    await onSave(qids);
    setSaving(false);
  };

  return (
    <div data-scrim style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 640 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Add, remove & reorder questions</div>
            <div style={s.apTitle}>Edit “{test.name}”</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>

        <div style={s.apBody}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.4, margin: "2px 0 10px" }}>
            In this test · {qids.length} question{qids.length === 1 ? "" : "s"}
          </div>
          {qids.length === 0 && <p style={s.apEmpty}>No questions yet — search below to add some.</p>}
          {qids.map((id, i) => {
            const q = byId.get(id);
            return (
              <div key={id} style={s.deckRow}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
                  <button style={s.reorderBtn} onClick={() => move(i, -1)} disabled={i === 0} title="Move up"><ChevronUp size={14} strokeWidth={2.4} /></button>
                  <button style={s.reorderBtn} onClick={() => move(i, 1)} disabled={i === qids.length - 1} title="Move down"><ChevronDown size={14} strokeWidth={2.4} /></button>
                </div>
                <div style={{ ...s.deckRowText, cursor: "default" }}>
                  <div style={s.deckRowMeta}>
                    {i + 1}. {q ? <>{q.year} · Q{q.q_index} · {q.prite_label}</> : <span style={{ color: T.wrongLine }}>{id} · not in current bank</span>}
                  </div>
                  {q && <div style={s.deckRowStem}>{q.stem}</div>}
                  {q && tagsFor(q, true)}
                </div>
                <button style={{ ...s.reorderBtn, color: T.wrongLine }} onClick={() => remove(id)} title="Remove from test"><X size={15} strokeWidth={2.4} /></button>
              </div>
            );
          })}

          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: 0.4, margin: "20px 0 8px" }}>Add a question</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by word, year, or Q# (e.g. lithium, 2023, 137)"
            style={{ ...s.deckSearch, marginBottom: 10 }}
            autoFocus
          />
          {search.trim() && matches.length === 0 && <p style={s.apEmpty}>No other questions match “{search.trim()}”.</p>}
          {matches.map((q) => {
            const id = questionId(q.year, q.q_index);
            return (
              <div key={id} style={s.deckRow}>
                <button style={{ ...s.reorderBtn, color: T.tealDeep, marginTop: 2 }} onClick={() => add(id)} title="Add to test"><Plus size={16} strokeWidth={2.6} /></button>
                <div style={{ ...s.deckRowText, cursor: "default" }}>
                  <div style={s.deckRowMeta}>
                    {q.year} · Q{q.q_index} · {q.prite_label}
                  </div>
                  <div style={s.deckRowStem}>{q.stem}</div>
                  <div style={s.deckRowAns}>→ {q.answer_letter} · {q.answer_text}</div>
                  {tagsFor(q, false)}
                </div>
              </div>
            );
          })}
        </div>

        <div style={s.deckFoot}>
          <button style={{ ...s.primarySm, opacity: saving ? 0.5 : 1 }} disabled={saving} onClick={save}>
            <Check size={14} strokeWidth={2.4} /> {saving ? "Saving…" : dirty ? "Save changes" : "Done"}
          </button>
          <button style={{ ...s.ghost, marginLeft: 0 }} onClick={onClose}>Cancel</button>
          <span style={s.flashNote}>{dirty ? "Unsaved changes" : "No changes yet"}</span>
        </div>
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
    <div data-scrim style={s.scrim} onClick={onClose}>
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
  /* A run older than this has been killed server-side, not merely slowed: the
     background task records any real failure as status='error', so a row stuck
     at 'generating' means the isolate died. 12 minutes matches
     sweep-stuck-guides, so the page and the sweeper never disagree. Re-checked
     on a timer because the component may be mounted across the threshold. */
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const audioStalled =
    guide?.status === "generating" &&
    !!guide?.generation_started_at &&
    nowTick - new Date(guide.generation_started_at).getTime() > 12 * 60_000;
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
                  ) : guide.status === "generating" && !audioStalled ? (
                    <span style={{ fontSize: 12.5, color: T.tealDeep }}>Recording… appears here when ready</span>
                  ) : guide.status === "generating" && audioStalled ? (
                    /* The server run was cut short without recording an error, so
                       the row would otherwise say "appears here when ready"
                       forever — which is how a guide went out to the residents
                       with dead audio. Say what actually happened and offer the
                       retry (narrate-only: reuses the written script). */
                    <>
                      <span style={{ fontSize: 12.5, color: T.wrongLine }}>Narration stalled</span>
                      {canGen && (
                        <button style={s.primarySm} onClick={addAudio} disabled={kickingAudio}
                                title="Retry the narration using the script that's already written">
                          <Volume2 size={13} strokeWidth={2.3} /> {kickingAudio ? "Retrying…" : "Retry audio"}
                        </button>
                      )}
                    </>
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
    <div data-scrim style={s.scrim} onClick={onClose}>
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
    <div data-scrim style={s.scrim} onClick={onClose}>
      <div style={{ ...s.apPanel, maxWidth: 620 }} onClick={(e) => e.stopPropagation()} className="rise">
        <div style={s.apHead}>
          <div>
            <div style={s.apEyebrow}>Learning opportunities</div>
            <div style={s.apTitle}>Missed questions ({rows.length})</div>
          </div>
          <button style={s.close} onClick={onClose}><X size={16} strokeWidth={2.4} /></button>
        </div>
        <div style={s.missActions}>
          <button style={s.apApprove} onClick={onReview} title="Start a practice run of these questions, answers hidden, so you can try them again"><RotateCcw size={13} strokeWidth={2.3} /> Try these again</button>
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
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => !revealed && setRevealed(true)}
                    onKeyDown={(e) => {
                      if (!revealed && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        setRevealed(true);
                      }
                    }}
                    style={{
                      border: `1.5px solid ${revealed ? T.teal + "66" : T.paperEdge}`,
                      borderRadius: 14,
                      padding: "16px 16px 14px",
                      background: revealed ? T.tealSoft : T.paper,
                      cursor: revealed ? "default" : "pointer",
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: T.muted, marginBottom: 8 }}>
                      {revealed ? "Answer" : "Question · click to unveil"}
                    </div>
                    <p style={{ ...s.stem, margin: 0 }}>
                      {revealed ? renderClozeResolved(card.cloze_text) : renderClozePreview(card.cloze_text)}
                    </p>
                  </div>
                  {!revealed ? (
                    <button style={{ ...s.apApprove, padding: "10px 20px", fontSize: 14 }} onClick={() => setRevealed(true)}>
                      <Eye size={14} strokeWidth={2.2} /> Show answer
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
    <div ref={scrimRef} data-scrim style={s.scrim} onClick={() => dismiss()}>
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
.quotaCount { -moz-appearance: textfield; }
.quotaCount::-webkit-outer-spin-button,
.quotaCount::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.opt:hover:not(:disabled) { border-color: ${T.teal}33 !important; transform: translateY(-1px); box-shadow: 0 8px 20px -14px rgba(20,24,40,.4); }
.opt:disabled { cursor: default; }
.opt { transition: transform .12s cubic-bezier(.2,.7,.3,1), border-color .12s ease, box-shadow .15s ease; }
.tab:hover { color: ${T.text}; }
/* The answer reads as a scrollable collection of chapters. Each chapter keeps
   its label and purpose visible, and opens with a restrained paper-fold motion. */
.learningCard { position: relative; isolation: isolate; transition: transform .2s cubic-bezier(.2,.7,.3,1), border-color .2s ease, box-shadow .2s ease; }
.learningCard::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 3px; background: linear-gradient(180deg, ${T.teal}, #69c5ad); opacity: 0; transition: opacity .2s ease; z-index: 2; }
.learningCard::after { content: ""; position: absolute; width: 210px; height: 210px; right: -120px; top: -150px; border-radius: 50%; background: radial-gradient(circle, rgba(14,122,107,.12), rgba(14,122,107,0) 68%); opacity: 0; transform: scale(.7); transition: opacity .3s ease, transform .45s cubic-bezier(.2,.7,.3,1); pointer-events: none; z-index: -1; }
.learningCard:hover { transform: translateY(-1px); border-color: ${T.teal}55 !important; box-shadow: 0 14px 34px -26px rgba(17,51,51,.65); }
.learningCardOpen::before, .learningCardOpen::after { opacity: 1; }
.learningCardOpen::after { transform: scale(1); }
.learningCardButton:hover .learningChevron { color: ${T.teal} !important; }
.learningKeep:hover { color: ${T.tealDeep} !important; border-color: ${T.teal}88 !important; background: ${T.tealSoft} !important; transform: translateY(-1px); }
.learningKeepOn { box-shadow: 0 5px 13px -9px rgba(14,122,107,.8); }
.learningBody { display: grid; grid-template-rows: 0fr; opacity: 0; visibility: hidden; transition: grid-template-rows .38s cubic-bezier(.2,.72,.25,1), opacity .2s ease, visibility 0s linear .38s; }
.learningBodyOpen { grid-template-rows: 1fr; opacity: 1; visibility: visible; transition: grid-template-rows .42s cubic-bezier(.2,.72,.25,1), opacity .28s ease .08s, visibility 0s linear 0s; }
.learningBody > div { min-height: 0; overflow: hidden; }
.learningBodyOpen .learningBodyInner { padding-top: 20px !important; padding-bottom: 22px !important; border-top-width: 1px !important; border-top-color: ${T.paperEdge} !important; }
.learningCardIn { animation: learningCardIn .36s cubic-bezier(.22,.75,.28,1) both; }
@keyframes learningCardIn { from { opacity: 0; transform: translateY(9px); } }
/* My notes + Group notes share a row. align-items:start so opening one doesn't
   stretch the closed one to match; below 760px there isn't room for two note
   cards side by side, so they stack as before. */
.learningPair { display: grid; grid-template-columns: 1fr 1fr; align-items: start; gap: 10px; }
/* Half-width headers wrap, which would give back the height the pairing saves,
   so while they're side by side these two borrow the phone layout's compaction:
   no index number or one-line summary, and the Keep-open pill drops to its icon.
   Below 760px the pair stacks full width again and looks like every other card. */
/* The paired cards carry no step number at any width — the stack numbers the
   sections you work through, and these two are a side note to that. */
.learningPair .learningIndexCell { display: none; }
@media (min-width: 761px) {
  .learningPair .learningCardButton { grid-template-columns: 42px minmax(0,1fr) auto auto !important; padding: 14px !important; }
  .learningPair .learningKeep { margin: 0 10px 0 2px !important; width: 34px; height: 34px; padding: 0 !important; justify-content: center; }
  .learningPair .learningKeepLabel { display: none; }
}
@media (max-width: 760px) { .learningPair { grid-template-columns: 1fr; } }
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
@media (max-width: 560px) { .audioGrid { grid-template-columns: 1fr !important; } }
@media (max-width: 560px) {
  .learningCardHeader { grid-template-columns: minmax(0,1fr) auto !important; }
  .learningCardButton { grid-template-columns: 36px minmax(0,1fr) auto !important; padding: 14px !important; }
  .learningCardButton > span:first-child { display: none !important; }
  .learningCardButton .learningChevron { grid-column: 3; }
  .learningCardButton > span:nth-child(2) { grid-column: 1; }
  .learningCardButton > span:nth-child(3) { grid-column: 2; }
  .learningCardButton > span:nth-last-child(2):not(:nth-child(3)) { grid-column: 3; }
  .learningKeep { width: 34px; height: 34px; padding: 0 !important; margin: 0 10px 0 2px !important; align-self: center; justify-content: center; }
  .learningKeepLabel { display: none; }
  .learningHead { align-items: flex-end !important; }
  .learningActions { justify-content: flex-end !important; }
  .learningBodyInner { padding-left: 15px !important; padding-right: 15px !important; }
  .learningBodyOpen .learningBodyInner { padding-top: 16px !important; padding-bottom: 16px !important; }
  .audioModal { border-radius: 16px !important; }
  .audioActions > span { width: 100%; margin-left: 0 !important; }
}
.audioPulse { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; color: #10231f; background: #7ee0cf; animation: audioPulse 1.35s ease-in-out infinite; }
@keyframes audioPulse { 0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(126,224,207,.42); } 50% { transform: scale(1.08); box-shadow: 0 0 0 10px rgba(126,224,207,0); } }
.audioWave { display: flex; align-items: center; gap: 3px; height: 18px; margin-top: 10px; }
.audioWave i { display: block; width: 3px; height: 6px; border-radius: 3px; background: #7ee0cf; animation: audioWave .8s ease-in-out infinite alternate; }
.audioWave i:nth-child(2) { animation-delay: .12s; }.audioWave i:nth-child(3) { animation-delay: .24s; }.audioWave i:nth-child(4) { animation-delay: .36s; }.audioWave i:nth-child(5) { animation-delay: .48s; }.audioWave i:nth-child(6) { animation-delay: .6s; }.audioWave i:nth-child(7) { animation-delay: .72s; }
@keyframes audioWave { from { height: 5px; opacity: .45; } to { height: 18px; opacity: 1; } }
/* Placeholder shimmer while a private textbook page image is being fetched. */
@keyframes ksShimmer { from { background-position: 180% 0; } to { background-position: -80% 0; } }
/* The textbook page-window pager takes focus so left/right arrows page through
   the section. It needs a visible focus ring for that to be discoverable, but
   only for keyboard users — :focus-visible keeps it off after a mouse click. */
.ksPager:focus { outline: none; }
.ksPager:focus-visible { outline: 2px solid #0e7a6b; outline-offset: 2px; }
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
/* The incoming half of the page turn. In a book the page underneath doesn't
   swing in — it was always there — so this is just a fast settle, and the
   sense of motion comes from the fold's crease sweeping across it. */
.qIn { animation: qIn .22s cubic-bezier(.2,.75,.3,1) both; transform-origin: left center; }
@keyframes qIn { from { opacity: 0; transform: translateY(5px) scale(.995); } }
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

/* ---- Floating "Next question" button (pinned bottom-right) ----
   A liquid-glass pill over the plasma backdrop. Layers, back to front:
     .nextUpLens  a specular blob that chases the cursor (--gx/--gy, set in JS)
     .nextUpRim   a fixed top-edge highlight, the "thick pane" cue
     ::after      a sheen that sweeps on a loop so it keeps inviting the click
   Motion: springs in on reveal, tilts and brightens under the cursor, and on
   click the arrow flies off while the pill recoils — then we advance. */
.nextUp { animation: nextUpIn .42s cubic-bezier(.22,1.4,.42,1) both; transition: transform .18s cubic-bezier(.3,1.2,.5,1), box-shadow .18s ease, border-color .18s ease; --gx: 50%; --gy: 50%; }
@keyframes nextUpIn { 0% { opacity: 0; transform: translateY(12px) scale(.92); } 100% { opacity: 1; transform: none; } }
.nextUp .nextUpArrow { position: relative; display: inline-flex; transition: transform .22s cubic-bezier(.3,1.4,.5,1); }

/* Specular highlight — follows the pointer, invisible until you're on it. */
.nextUp .nextUpLens {
  position: absolute; inset: -40%; pointer-events: none; opacity: 0;
  background: radial-gradient(circle at var(--gx) var(--gy), rgba(255,255,255,.75), rgba(255,255,255,.22) 26%, transparent 58%);
  transition: opacity .22s ease;
}
.nextUp:hover .nextUpLens { opacity: .85; }
/* Glass is thickest at the top edge, where it catches the most light. */
.nextUp .nextUpRim {
  position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  background: linear-gradient(180deg, rgba(255,255,255,.36), rgba(255,255,255,.04) 46%, rgba(255,255,255,.14));
}
.nextUp::after {
  content: ""; position: absolute; top: 0; bottom: 0; left: -60%; width: 45%;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,.5), transparent);
  transform: skewX(-18deg); pointer-events: none;
  animation: nextUpSheen 4.4s ease-in-out 1.2s infinite;
}
@keyframes nextUpSheen { 0% { left: -60%; } 22%, 100% { left: 130%; } }

.nextUp:hover {
  transform: translateY(-3px) scale(1.05);
  border-color: rgba(255,255,255,.58);
  box-shadow: 0 14px 34px rgba(6,20,26,.48), inset 0 1px 0 rgba(255,255,255,.7), inset 0 -8px 18px rgba(255,255,255,.16);
}
.nextUp:hover .nextUpArrow { transform: translateX(4px); }
.nextUp:active { transform: translateY(0) scale(.97); }
/* Click: the arrow leaves, the pill squeezes after it, then we advance. */
.nextUp.nextUpGo { animation: nextUpRecoil .2s ease-out both; }
.nextUp.nextUpGo .nextUpArrow { animation: nextUpFly .2s cubic-bezier(.4,0,.9,.4) both; }
@keyframes nextUpRecoil { 0% { transform: none; } 40% { transform: translateX(-3px) scale(.97); } 100% { transform: translateX(8px) scale(.99); opacity: .75; } }
@keyframes nextUpFly { 0% { transform: none; opacity: 1; } 100% { transform: translateX(22px); opacity: 0; } }

.bgToggle:hover { color: #cfd6e2; }

/* ---- Page turn ----
   StPageFlip's technique, without StPageFlip. Its soft page is not 3D at all:
   drawSoft() sets a clip-path polygon plus a flat 2D transform, and lets
   shadow layers do the rest. Borrowing that buys the paper read AND drops the
   3D version's problems — a clip in percentages works at any card height, and
   nothing magnifies past its box, so the sheet can never spill over the header.

   The fold line sweeps right to left at f. Three regions, all keyed off it:
     the page still flat    [0, f]              — the card, clipped
     the folded-over flap   [max(0, 2f-100), f] — mirrored across the fold
     the next sheet         [f, 100]            — the plate underneath

   EVERY layer below must share the 0/50/100 keyframe offsets and the same
   easing. CSS applies a timing function between each PAIR of keyframes, not
   across the whole animation, so a 2-stop layer and a 3-stop layer drift apart
   mid-flight and the flap visibly detaches from the crease. The 50% stop is
   also where 2f-100 crosses zero, so the clamp at the spine comes free. */
.pageStack { position: relative; --foldEase: cubic-bezier(.36,.02,.6,.5); }
/* Under the hand, the fold must track the pointer 1:1 — an ease curve would
   put the crease somewhere other than where the finger is. */
.pageStack.peeling { --foldEase: linear; }
/* The grab strip. 20px wide against the card's 26px padding, so it lives over
   dead space and never intercepts a click meant for an answer. */
.peelGrip {
  position: absolute; top: 0; right: 0; bottom: 0; width: 20px; z-index: 7;
  border-radius: 0 16px 16px 0; cursor: grab; touch-action: none;
}
.peelGrip:active { cursor: grabbing; }
.peelGrip::after {
  content: ""; position: absolute; right: 4px; top: 50%; width: 3px; height: 44px;
  transform: translateY(-50%); border-radius: 3px; opacity: 0;
  background: linear-gradient(180deg, transparent, rgba(35,38,47,.28), transparent);
  transition: opacity .18s ease;
}
.peelGrip:hover::after { opacity: 1; }

.pageFold { animation: foldAway .3s var(--foldEase) both; will-change: clip-path; }
@keyframes foldAway {
  0%   { clip-path: inset(0 0 0 0); }
  50%  { clip-path: inset(0 50% 0 0); }
  100% { clip-path: inset(0 100% 0 0); }
}
/* The back of the sheet. Deliberately darker than the page — it is angled away
   from the light, and if it matches the paper the fold reads as one flat panel. */
.foldFlap {
  position: absolute; inset: 0; z-index: 4; pointer-events: none; border-radius: 16px;
  background: linear-gradient(100deg, #e7e0d0, #efe9dc 62%, #f2ece0);
  animation: foldFlap .3s var(--foldEase) both;
}
@keyframes foldFlap {
  0%   { clip-path: inset(0 0 0 100%); }
  50%  { clip-path: inset(0 50% 0 0); }
  100% { clip-path: inset(0 100% 0 0); }
}
/* Crease: hard right edge riding exactly on the fold line, with a broad soft
   ramp left of it for the bulge. A composited transform, so it tracks the clip
   for free. Tight on purpose — spread it out and the fold becomes a grey smear. */
.foldCrease {
  position: absolute; inset: 0; z-index: 5; pointer-events: none;
  background: linear-gradient(90deg,
    rgba(10,14,26,0) 62%, rgba(10,14,26,.05) 78%, rgba(10,14,26,.13) 90%,
    rgba(10,14,26,.28) 97.5%, rgba(10,14,26,.46));
  animation: foldCrease .3s var(--foldEase) both;
}
@keyframes foldCrease {
  0%   { transform: translateX(0); }
  50%  { transform: translateX(-50%); }
  100% { transform: translateX(-100%); }
}
/* Contact shadow thrown left from the flap's free edge. This is the layer that
   separates the folded sheet from the page under it; without it there is no
   visible boundary between them. Holds at the spine through the second half. */
.foldEdge {
  position: absolute; inset: 0; z-index: 2; pointer-events: none;
  background: linear-gradient(90deg,
    rgba(10,14,26,0) 87%, rgba(10,14,26,.09) 95%, rgba(10,14,26,.30));
  animation: foldEdge .3s var(--foldEase) both;
}
@keyframes foldEdge {
  0%   { transform: translateX(0); }
  50%  { transform: translateX(-100%); }
  100% { transform: translateX(-100%); }
}
/* The folded edge catches the light. Carries the flap's own clip so the
   highlight never paints onto the flat page beside it. */
.foldSheen {
  position: absolute; inset: 0; z-index: 6; pointer-events: none;
  background: linear-gradient(90deg,
    rgba(255,255,255,.85), rgba(255,255,255,.3) 3%, rgba(255,255,255,0) 13%);
  animation: foldFlap .3s var(--foldEase) both, foldSheen .3s var(--foldEase) both;
}
@keyframes foldSheen {
  0%   { transform: translateX(100%); opacity: 0; }
  50%  { transform: translateX(0%);   opacity: .85; }
  100% { transform: translateX(0%);   opacity: .25; }
}
@media (prefers-reduced-motion: reduce) {
  .nextUp, .nextUp.nextUpGo, .nextUp::after, .nextUp .nextUpArrow, .nextUp.nextUpGo .nextUpArrow { animation: none !important; }
  .nextUp::after, .nextUp .nextUpLens { display: none; }
  .nextUp, .nextUp .nextUpArrow { transition: none !important; }
  .pageFold { animation: none !important; clip-path: none !important; }
  .foldFlap, .foldCrease, .foldEdge, .foldSheen, .peelGrip { display: none !important; }
}
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
  .learningCard, .learningCard::before, .learningCard::after, .learningBody, .learningChevron { transition: none !important; }
  .learningCardIn { animation: none !important; }
}
/* The mobile "Menu" toggle lives in the header; desktop never sees it. */
.mobMenuBtn { display: none !important; align-items: center; gap: 5px; }
/* Phone treatment. A landscape phone is *wide* (844px) but very short, so
   width alone can't detect it — keyed off max-height too, otherwise landscape
   fell through to the desktop path: every pill kept its text label, the header
   wrapped to three rows, and the Menu button stayed hidden. */
@media (max-width: 680px), (max-height: 520px) {
  .topActions { gap: 6px !important; flex-wrap: wrap !important; justify-content: flex-end !important; }
  .topActBtn { padding: 7px 9px !important; }
  .btnTxt { display: none !important; }
  /* Collapse the pill clutter behind the Menu button: header actions, library
     buttons, study toggles etc. are hidden until the menu is opened. */
  .mobMenuBtn { display: inline-flex !important; }
  .mobExtra { display: none !important; }
  .mobMenuOpen .mobExtra { display: inline-flex !important; }
  .mobMenuOpen .topActions { display: flex !important; }
  /* The study-set builder's filters are taller than a phone screen, and the
     inner-scroll layout pushed the "Study these" footer off the bottom where
     nobody could reach it. On phones the whole panel scrolls instead. */
  .deckPanel { overflow-y: auto !important; }
  .deckPanel .deckBody { overflow: visible !important; }
}
@media (max-width: 680px) {
  .topInner { flex-wrap: wrap !important; padding: 10px 14px !important; gap: 8px 10px !important; }
  .topMeta { width: 100% !important; justify-content: space-between !important; gap: 8px !important; flex-wrap: wrap !important; }
  /* On a phone the quick-start presets stack, so the eyebrow gets its own line
     instead of stealing width from the first (widest) button. */
  .quickLabel { flex-basis: 100%; margin-bottom: 2px; }
}
/* Landscape phone: vertical space is the scarce resource. Keep the whole bar
   on one line (no second row for topMeta) and trim its padding, so the sticky
   header costs ~40px of a 390px viewport instead of a third of the screen. */
@media (max-height: 520px) {
  .topInner { flex-wrap: nowrap !important; padding: 6px 14px !important; gap: 8px !important; }
  /* width:auto cancels the ≤680px rule above — a narrow landscape phone (568px)
     matches both blocks, and a 100%-wide meta on a nowrap row overflows. */
  .topMeta { flex-wrap: nowrap !important; gap: 8px !important; width: auto !important; min-width: 0; }
  .brandHome { flex-shrink: 0; }
  /* Opened, the menu could otherwise run past the bottom of the screen. */
  .mobMenuOpen [data-topbar] { max-height: 78vh; overflow-y: auto; }
  .mobMenuOpen .topMeta { flex-wrap: wrap !important; }
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
  apDecline: { background: "#fff", color: T.wrongLine, border: `1px solid ${T.wrongLine}88`, padding: "7px 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  // Softer than the plain decline — this one is an invitation, not a rejection.
  apDeclineStudent: { background: "#fff", color: T.gold, border: `1px solid ${T.gold}88`, padding: "7px 13px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
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
  cohortSel: { background: "#fff", color: T.text, border: `1px solid ${T.paperEdge}`, borderRadius: 9, padding: "7px 10px", fontSize: 13, cursor: "pointer", maxWidth: "100%", minWidth: 0 },
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
  gateStudentNote: { fontSize: 12, color: T.muted, lineHeight: 1.55, margin: "12px 0 0", padding: "11px 13px", textAlign: "left", background: T.tealSoft, border: `1px solid ${T.teal}2e`, borderRadius: 10 },
  gateCodeRow: { display: "flex", gap: 7, marginTop: 10 },
  // Poll codes are short and upper-case — mono + wide tracking makes an O/0 mix-up obvious.
  gateCodeInput: { flex: 1, minWidth: 0, background: "#fff", border: `1px solid ${T.teal}3d`, borderRadius: 8, padding: "9px 11px", fontSize: 14, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.text, fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace", outline: "none" },
  gateCodeGo: { display: "inline-flex", alignItems: "center", gap: 6, background: T.teal, color: "#fff", border: "none", borderRadius: 8, padding: "9px 15px", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
  gateCodeGoOff: { background: "#b9cfc9", cursor: "not-allowed" },
  tlHeading: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: T.faint, marginBottom: 7 },
  tlRow: { display: "flex", flexWrap: "wrap", gap: 7 },
  tlBtn: { flex: "1 1 auto", background: "#fff", color: T.text, border: `1px solid ${T.paperEdge}`, borderRadius: 9, padding: "10px 12px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },

  // position/zIndex lift the question column above the fixed
  // ClosingPlasmaBackground canvas, which paints at z-index 0.
  well: { position: "relative", zIndex: 1, maxWidth: 740, margin: "0 auto", padding: "20px 22px 90px" },
  bankBanner: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    margin: "0 0 14px",
    padding: "11px 13px",
    borderRadius: 12,
    background: "rgba(250, 247, 241, 0.94)",
    border: `1px solid ${T.paperEdge}`,
    boxShadow: "0 10px 28px -18px rgba(0,0,0,.45)",
  } as React.CSSProperties,
  bankBannerIcon: {
    display: "grid",
    placeItems: "center",
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: 8,
    background: T.tealSoft,
    color: T.tealDeep,
  } as React.CSSProperties,
  bankBannerTitle: {
    fontSize: 13.5,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    color: T.text,
    lineHeight: 1.3,
  } as React.CSSProperties,
  bankBannerHint: {
    marginTop: 3,
    fontSize: 12.5,
    lineHeight: 1.45,
    color: T.muted,
  } as React.CSSProperties,
  bankBannerLink: {
    color: T.tealDeep,
    fontWeight: 650,
    textUnderlineOffset: 2,
  } as React.CSSProperties,

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

  /* ---- "What comes first" ordering panel ---- */
  orderIntro: { fontSize: 13, color: T.muted, lineHeight: 1.5, margin: "10px 0 14px" },
  orderList: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 7 },
  orderRow: {
    display: "flex", alignItems: "center", gap: 11, padding: "11px 12px",
    background: T.card, border: `1px solid ${T.paperEdge}`, borderRadius: 11,
    cursor: "grab", userSelect: "none",
  },
  orderRowDrag: { opacity: 0.45, cursor: "grabbing" },
  // A solid top edge is the drop indicator — the row will land above this one.
  orderRowOver: { borderColor: T.teal, boxShadow: `inset 0 3px 0 -1px ${T.teal}` },
  orderGrip: { color: T.faint, display: "flex", flex: "none" },
  orderRank: {
    flex: "none", width: 21, height: 21, display: "grid", placeItems: "center",
    borderRadius: 6, background: T.tealSoft, color: T.tealDeep,
    fontSize: 11.5, fontWeight: 700, fontVariantNumeric: "tabular-nums",
  },
  orderLabel: { display: "block", fontSize: 13.5, fontWeight: 600, color: T.text },
  orderHint: { display: "block", fontSize: 11.5, color: T.muted, lineHeight: 1.4, marginTop: 1 },
  orderMoves: { display: "flex", flexDirection: "column", gap: 2, flex: "none" },
  quotaSteer: { display: "inline-flex", alignItems: "center", gap: 5, flex: "none" },
  quotaSteerValue: {
    display: "inline-flex", alignItems: "center", gap: 4,
    fontSize: 12, fontWeight: 650, color: T.tealDeep, fontVariantNumeric: "tabular-nums",
  },
  quotaSteerInput: {
    width: 46, minWidth: 46, border: `1px solid ${T.paperEdge}`, borderRadius: 6, padding: "4px 6px",
    textAlign: "center", fontSize: 13, fontWeight: 700, color: T.tealDeep, background: T.tealSoft,
    fontVariantNumeric: "tabular-nums", boxSizing: "border-box",
  },
  orderMoveBtn: {
    display: "grid", placeItems: "center", width: 22, height: 17, padding: 0,
    background: "transparent", border: `1px solid ${T.paperEdge}`, borderRadius: 5,
    color: T.muted, cursor: "pointer",
  },
  orderYearRow: { display: "flex", flexWrap: "wrap", gap: 7 },
  orderYear: {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
    background: T.card, border: `1px solid ${T.paperEdge}`, borderRadius: 999,
    fontSize: 13, fontWeight: 600, color: T.muted, cursor: "pointer",
    fontVariantNumeric: "tabular-nums",
  },
  orderYearOn: { background: T.tealSoft, borderColor: T.teal, color: T.tealDeep },
  orderYearNum: {
    display: "grid", placeItems: "center", width: 16, height: 16, borderRadius: 5,
    background: T.teal, color: "#fff", fontSize: 10.5, fontWeight: 700,
  },
  orderPreview: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 },
  orderPreviewRow: {
    display: "flex", alignItems: "center", gap: 9, padding: "6px 9px",
    background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 8, fontSize: 12.5,
  },
  orderPreviewNum: { color: T.faint, fontSize: 11, width: 14, fontVariantNumeric: "tabular-nums", flex: "none" },
  orderPreviewYear: { color: T.tealDeep, fontWeight: 700, flex: "none", fontVariantNumeric: "tabular-nums" },
  orderPreviewCat: { color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 },
  orderPreviewTag: {
    display: "inline-flex", alignItems: "center", gap: 3, flex: "none",
    color: T.gold, fontSize: 10.5, fontWeight: 700,
  },
  orderFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 16 },
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
  // Marks a control whose setting is no longer the default, so a customised
  // order is visible from the nav without opening the panel.
  deckBtnOn: { borderColor: T.teal, color: "#eaf6f2" },
  deckDot: { width: 6, height: 6, borderRadius: "50%", background: T.teal, marginLeft: 1 },
  deckFilters: { padding: "2px 20px 12px", borderBottom: `1px solid ${T.paperEdge}` },
  // Quick-start presets — deliberately the biggest, plainest-English control in
  // the panel, since "my wrong ones" / "ones I haven't done" is what people ask.
  quickRow: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 7, marginBottom: 6 },
  quickLabel: { fontSize: 11, fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: T.faint, marginRight: 2 },
  quickBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: T.paper, color: T.text, border: `1px solid ${T.paperEdge}`, borderRadius: 999, padding: "7px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  quickBtnOn: { background: T.teal, color: "#fff", border: `1px solid ${T.teal}` },
  quickHint: { margin: "0 0 10px", fontSize: 12, color: T.faint, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  cohortSelOn: { border: `1px solid ${T.teal}`, color: T.teal, fontWeight: 600 },
  histBadge: { display: "inline-block", border: "1px solid", borderRadius: 999, padding: "0 7px", fontSize: 10.5, fontWeight: 700, letterSpacing: ".02em", marginRight: 7, verticalAlign: "1px" },
  deckSearch: { width: "100%", border: `1px solid ${T.paperEdge}`, borderRadius: 9, padding: "10px 13px", fontSize: 14, background: "#fff", color: T.text, marginBottom: 9 },
  deckSearchRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 9, flexWrap: "wrap" },
  scopeToggle: { display: "inline-flex", background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 9, padding: 2, gap: 2 },
  scopeBtn: { background: "transparent", color: T.muted, border: "none", padding: "7px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  scopeOn: { background: T.teal, color: "#fff" },
  deckSelRow: { display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 0 },
  moreBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: T.muted, border: `1px solid ${T.paperEdge}`, borderRadius: 9, padding: "9px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  moreBtnOn: { color: T.teal, border: `1px solid ${T.teal}` },
  moreCount: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: T.teal, color: "#fff", fontSize: 11, fontWeight: 700 },
  clearBtn: { background: "transparent", color: T.muted, border: "none", padding: "9px 6px", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline" },
  advWrap: { display: "flex", flexDirection: "column", gap: 12, padding: "12px 13px", marginBottom: 10, background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 10 },
  advGroup: { display: "flex", flexDirection: "column", gap: 6 },
  advLabel: { fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: T.faint },
  // wraps rather than squeezing — on a phone the count + dedupe toggle + the
  // select/clear buttons can't share one line without clipping
  deckCount: { display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 8, fontSize: 13, color: T.muted, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  deckRow: { display: "flex", alignItems: "flex-start", gap: 11, padding: "11px 4px", borderBottom: `1px solid ${T.paperEdge}` },
  reorderBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 22, flexShrink: 0, background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 7, color: T.muted, cursor: "pointer", padding: 0 },
  deckRowText: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1, cursor: "pointer" },
  deckRowMeta: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 10.5, letterSpacing: "0.04em", textTransform: "uppercase", color: T.faint },
  repeatBadge: { display: "inline-flex", alignItems: "center", gap: 2, marginLeft: 6, padding: "1px 5px", borderRadius: 999, background: T.goldSoft, color: T.gold, fontWeight: 700, letterSpacing: 0 },
  // Repeat/reuse tags in the test editor. Distinct colors: red = same item
  // twice in THIS set; gold = recurred across PRITE years; teal = already in
  // another of your saved tests/polls.
  tagDup: { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: T.wrongBg, color: T.wrongText, fontSize: 11, fontWeight: 700 },
  tagYear: { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: T.goldSoft, color: T.gold, fontSize: 11, fontWeight: 700 },
  tagUsed: { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, background: T.tealSoft, color: T.tealDeep, fontSize: 11, fontWeight: 700 },
  deckRowStem: { fontSize: 13.5, color: T.text, lineHeight: 1.45 },
  deckRowAns: { fontSize: 12.5, color: T.tealDeep, fontWeight: 500 },
  deckFoot: { display: "flex", alignItems: "center", gap: 13, padding: "14px 22px", borderTop: `1px solid ${T.paperEdge}`, flexWrap: "wrap" },

  progressRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 },
  qeyebrow: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 12, letterSpacing: "0.04em", color: "#8c93a1", textTransform: "uppercase" },
  reportBtn: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", color: T.faint, fontSize: 12, cursor: "pointer", padding: "2px 4px" },
  multiTag: { display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, color: T.gold, background: T.goldSoft, borderRadius: 6, padding: "3px 9px" },
  multiBanner: { display: "flex", alignItems: "center", gap: 9, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 14, lineHeight: 1.4, color: T.gold, background: T.goldSoft, border: `1px solid ${T.gold}`, borderRadius: 10, padding: "11px 14px", margin: "0 0 14px" },

  // position: relative anchors the page-turn shading overlays to the card.
  qcard: { position: "relative", background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 16, padding: "26px 26px 22px", boxShadow: "0 1px 0 rgba(0,0,0,.04), 0 18px 40px -28px rgba(20,24,40,.5)" },
  caughtCard: { width: "100%", maxWidth: 440, background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 18, padding: "32px 28px", textAlign: "center", boxShadow: "0 30px 80px -30px rgba(0,0,0,.5)" },
  figRow: { display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18, justifyContent: "center" },
  figImg: { maxWidth: "100%", maxHeight: 320, borderRadius: 10, border: `1px solid ${T.paperEdge}`, background: "#fff" },
  stem: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 20, lineHeight: 1.5, color: T.text, margin: "0 0 22px", fontWeight: 400 },
  stemSelectable: { cursor: "text", marginBottom: 8 },
  hlMark: { background: T.goldSoft, color: "inherit", borderRadius: 3, padding: "0 1px", boxShadow: `inset 0 -2px 0 ${T.gold}`, cursor: "pointer" },
  hlHint: { display: "flex", justifyContent: "center", alignItems: "center", gap: 5, fontSize: 11.5, color: T.faint, margin: "12px 0 0" },

  options: { display: "flex", flexDirection: "column", gap: 9 },
  askWrap: { marginTop: 14, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 9 },
  noClueBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${T.paperEdge}`, color: T.muted, padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  askToggle: { display: "inline-flex", alignItems: "center", gap: 7, background: T.tealSoft, border: `1px solid ${T.tealSoft}`, color: T.tealDeep, padding: "9px 15px", borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: "pointer" },
  askToggleOn: { background: T.teal, border: `1px solid ${T.teal}`, color: "#fff" },
  askPanel: { flexBasis: "100%", marginTop: 1, padding: "13px 15px", background: T.card, border: `1px solid ${T.paperEdge}`, borderRadius: 12 },
  // Static Next on the Ask AI row — pushed to the far right of the card.
  nextUpInline: {
    marginLeft: "auto",
    overflow: "hidden", isolation: "isolate",
    display: "inline-flex", alignItems: "center", gap: 10,
    background: `linear-gradient(145deg, rgba(255,255,255,.22), rgba(14,122,107,.30) 52%, rgba(255,255,255,.10)), ${T.teal}`,
    border: "1px solid rgba(255,255,255,.34)", color: "#fff",
    padding: "11px 20px", borderRadius: 999, fontSize: 14.5, fontWeight: 700, cursor: "pointer",
    textShadow: "0 1px 2px rgba(0,0,0,.34)",
    boxShadow: "0 6px 16px rgba(6,20,26,.28), inset 0 1px 0 rgba(255,255,255,.45), inset 0 -6px 14px rgba(255,255,255,.10)",
    flexShrink: 0,
  },
  // Floating Next — larger hit target, liquid glass over the plasma backdrop.
  // On desktop, align its right edge with the centered question card; max()
  // keeps a 16px inset on narrow screens. Safe-area for the iPhone home bar.
  nextUpFab: {
    position: "fixed", right: "max(16px, calc(50vw - 348px))", bottom: "calc(20px + env(safe-area-inset-bottom, 0px))", zIndex: 50,
    overflow: "hidden", isolation: "isolate",
    display: "inline-flex", alignItems: "center", gap: 12,
    // Opaque teal base under the glass gradient: floating, it now passes over
    // the white question card, where a purely translucent fill lost its white
    // label. The gradient still supplies the glass read.
    background: `linear-gradient(145deg, rgba(255,255,255,.22), rgba(14,122,107,.30) 52%, rgba(255,255,255,.10)), ${T.teal}`,
    backdropFilter: "blur(13px) saturate(1.9)", WebkitBackdropFilter: "blur(13px) saturate(1.9)",
    border: "1px solid rgba(255,255,255,.34)", color: "#fff",
    padding: "16px 28px", borderRadius: 999, fontSize: 16.5, fontWeight: 700, cursor: "pointer",
    textShadow: "0 1px 2px rgba(0,0,0,.34)",
    boxShadow: "0 12px 32px rgba(6,20,26,.52), inset 0 1px 0 rgba(255,255,255,.5), inset 0 -6px 14px rgba(255,255,255,.10)",
  },
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

  below: { marginTop: 12 },
  learningHead: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 18, marginBottom: 8, flexWrap: "wrap" },
  learningActions: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" },
  learningAction: { background: T.inkSoft, color: "#b9c0cc", border: `1px solid ${T.inkLine}`, borderRadius: 999, padding: "6px 10px", fontSize: 11.5, fontWeight: 650, cursor: "pointer" },
  learningStack: { display: "grid", gap: 10 },
  learningCard: { background: T.paper, border: `1px solid ${T.paperEdge}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 5px 18px -18px rgba(0,0,0,.55)" },
  learningCardHeader: { position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "stretch", background: "linear-gradient(110deg, rgba(255,255,255,.96), rgba(247,246,242,.92))" },
  learningCardButton: { width: "100%", display: "grid", gridTemplateColumns: "38px 42px minmax(0,1fr) auto auto", alignItems: "center", gap: 11, padding: "15px 10px 15px 18px", background: "transparent", color: T.text, border: "none", textAlign: "left", cursor: "pointer" },
  learningKeep: { alignSelf: "center", display: "inline-flex", alignItems: "center", gap: 5, margin: "0 16px 0 2px", padding: "6px 9px", borderRadius: 999, borderWidth: 1, borderStyle: "solid", borderColor: T.paperEdge, background: "rgba(255,255,255,.82)", color: T.muted, fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", transition: "color .18s ease, border-color .18s ease, background .18s ease, transform .18s ease" },
  learningKeepOn: { color: T.tealDeep, borderColor: `${T.teal}88`, background: T.tealSoft },
  learningIndex: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", color: "#a4a5a1", fontSize: 10.5, fontWeight: 750, letterSpacing: "0.08em", transition: "color .2s ease" },
  learningIndexOpen: { color: T.teal },
  learningIcon: { width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: 11, color: T.muted, background: "#fff", borderWidth: 1, borderStyle: "solid", borderColor: T.paperEdge, boxShadow: "0 4px 10px -8px rgba(0,0,0,.38)", transition: "color .2s ease, background .2s ease, border-color .2s ease, transform .25s cubic-bezier(.2,.7,.3,1)" },
  learningIconOpen: { color: "#fff", background: T.teal, borderColor: T.teal, transform: "rotate(-2deg) scale(1.04)" },
  learningCardText: { minWidth: 0, display: "flex", alignItems: "baseline", gap: "6px 11px", flexWrap: "wrap" },
  learningCardTitle: { color: T.text, fontSize: 15.5, fontWeight: 750, lineHeight: 1.25, letterSpacing: "-0.01em" },
  learningCardSummary: { color: T.muted, fontSize: 12.5, lineHeight: 1.35, fontWeight: 450 },
  learningCount: { display: "inline-grid", placeItems: "center", minWidth: 22, height: 22, padding: "0 7px", borderRadius: 999, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 10.5, fontWeight: 750, background: T.tealSoft, color: T.tealDeep },
  learningChevron: { color: T.faint, transition: "transform .3s cubic-bezier(.2,.75,.25,1), color .2s ease", flexShrink: 0 },
  learningBodyInner: { borderTop: "0 solid transparent", padding: "0 22px" },

  expl: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 16.5, lineHeight: 1.6, color: T.text, margin: "0 0 16px", whiteSpace: "pre-wrap" },
  explImg: { display: "block", maxWidth: "100%", borderRadius: 10, border: `1px solid ${T.paperEdge}`, background: "#fff", margin: "0 0 12px" },
  emptyExpl: { display: "flex", alignItems: "center", gap: 10, color: T.muted, fontSize: 14, background: "#fff", border: `1px dashed ${T.paperEdge}`, borderRadius: 11, padding: "14px 16px" },
  videoLink: { display: "flex", alignItems: "center", gap: 10, color: T.text, textDecoration: "none", fontSize: 14.5, background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 11, padding: "13px 15px" },
  videoNote: { fontSize: 12.5, color: T.muted, marginTop: 10, lineHeight: 1.5 },

  podcastItem: { display: "flex", alignItems: "flex-start", gap: 10, color: T.text, textDecoration: "none", background: "#fff", border: `1px solid ${T.paperEdge}`, borderRadius: 11, padding: "12px 14px", marginBottom: 8 },
  podcastMeta: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase", color: T.faint, marginBottom: 4 },
  podcastTitle: { fontSize: 14, fontWeight: 600, lineHeight: 1.35, color: T.text },
  podcastWhy: { fontSize: 12.5, color: T.muted, marginTop: 4, lineHeight: 1.45 },
  podcastChapter: { fontSize: 12, color: T.tealDeep, marginTop: 6 },
  podcastLblDark: { display: "block", fontSize: 12, color: "#9aa0ab", marginBottom: 9, marginTop: 10, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  podcastItemDark: { display: "flex", alignItems: "flex-start", gap: 10, color: "#c7ccd6", textDecoration: "none", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "11px 13px", marginBottom: 8 },
  podcastMetaDark: { fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", fontSize: 10.5, letterSpacing: "0.04em", textTransform: "uppercase", color: "#7c828d", marginBottom: 4 },
  podcastTitleDark: { fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, color: "#fff" },
  podcastWhyDark: { fontSize: 12, color: "#9aa0ab", marginTop: 4, lineHeight: 1.45 },
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


  confetti: { position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 70 },
  balloonField: { position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 75 },
  toast: { position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", background: T.ink, color: "#fff", padding: "11px 18px", borderRadius: 11, fontSize: 13.5, fontWeight: 500, boxShadow: "0 16px 40px -16px rgba(0,0,0,.6)", zIndex: 60, maxWidth: "90vw", textAlign: "center" },
  replyToast: { position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "stretch", gap: 2, background: T.ink, color: "#fff", borderRadius: 13, boxShadow: "0 18px 44px -16px rgba(0,0,0,.62)", zIndex: 61, maxWidth: "92vw", overflow: "hidden" },
  replyToastMain: { display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", color: "#fff", padding: "13px 8px 13px 16px", fontSize: 13.5, fontWeight: 600, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", cursor: "pointer", textAlign: "left", lineHeight: 1.35 },
  replyToastIcon: { display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 8, background: T.teal, color: "#fff", flexShrink: 0 },
  replyToastCta: { color: T.tealSoft, fontWeight: 700, whiteSpace: "nowrap" },
  replyToastX: { display: "grid", placeItems: "center", width: 40, background: "transparent", border: "none", borderLeft: "1px solid rgba(255,255,255,.14)", color: "rgba(255,255,255,.72)", cursor: "pointer", flexShrink: 0 },

  disclaimer: { maxWidth: 620, margin: "44px auto 0", paddingTop: 16, borderTop: `1px solid ${T.inkLine}`, color: T.faint, fontSize: 11.5, lineHeight: 1.5, textAlign: "center" },
  shortcutHint: { marginTop: 7, color: "#8f98a7", fontSize: 10.5 },
  siteReportBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${T.paperEdge}`, color: T.muted, fontSize: 12, padding: "6px 12px", borderRadius: 8, cursor: "pointer" },
  // Footer backdrop switch — quiet by default, brightens on hover (.bgToggle).
  bgToggle: { display: "inline-flex", alignItems: "center", gap: 9, background: "none", border: "none", color: T.faint, fontSize: 12, padding: "4px 6px", cursor: "pointer", transition: "color .18s ease" },
  bgTrack: { position: "relative", width: 30, height: 17, borderRadius: 999, background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.16)", transition: "background .22s ease, border-color .22s ease", flexShrink: 0 },
  bgTrackOn: { background: T.teal, borderColor: T.teal },
  bgKnob: { position: "absolute", top: 2, left: 2, width: 11, height: 11, borderRadius: "50%", background: "#fff", opacity: .75, transition: "transform .22s cubic-bezier(.3,1.3,.5,1), opacity .22s ease" },
  bgKnobOn: { transform: "translateX(13px)", opacity: 1 },
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
  // Guest team picker — chips wrap so a 10-team session still fits a phone.
  teamPickWrap: { width: "100%", marginBottom: 10 },
  teamPickLbl: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#aeb4c0", marginBottom: 7 },
  teamPickRow: { display: "flex", flexWrap: "wrap", gap: 7 },
  teamPick: { background: T.ink, color: "#e7eaf0", border: `1.5px solid ${T.inkLine}`, borderRadius: 999, padding: "8px 15px", fontSize: 14, fontWeight: 600, cursor: "pointer", minHeight: 38 },
  teamPickOn: { background: T.teal, borderColor: T.teal, color: "#fff" },
  teamInput: { flex: 1, minWidth: 0, background: T.ink, color: "#fff", border: `1.5px solid ${T.inkLine}`, borderRadius: 10, padding: "9px 12px", fontSize: 15, fontFamily: "'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif" },
  teamSet: { flexShrink: 0, background: T.teal, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontSize: 14.5, fontWeight: 700, cursor: "pointer" },
  teamSetOff: { opacity: 0.4, cursor: "default" },
  teamTag: { display: "inline-flex", alignItems: "center", gap: 7, color: "#c7ccd6", fontSize: 14.5 },
  teamChange: { marginLeft: "auto", background: "none", border: `1px solid ${T.inkLine}`, color: "#aeb4c0", borderRadius: 8, padding: "5px 11px", fontSize: 13, cursor: "pointer" },
  teamScoreHint: { margin: "-8px 0 16px", color: T.faint, fontSize: 12.5, lineHeight: 1.4 },
  // The "how scoring works" footnote under each standings list.
  scoringNote: { margin: "14px 2px 0", color: T.faint, fontSize: 12.5, lineHeight: 1.5, maxWidth: 720 },
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
  // Tap-to-open extra-material chips inside the poll answer box (In practice /
  // Context / Video / Ask AI), dark-themed to match the participant view.
  pollExtraChips: { display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 },
  pollExtraChip: { display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", color: "#c7ccd6", borderRadius: 999, padding: "5px 11px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  pollExtraChipOn: { background: "rgba(242,193,78,.16)", border: "1px solid rgba(242,193,78,.5)", color: "#f2c14e" },
  pollExtraBody: { margin: "10px 0 0", color: "#c7ccd6", fontSize: 14, lineHeight: 1.55, whiteSpace: "pre-wrap", background: "rgba(255,255,255,.03)", borderRadius: 10, padding: "11px 13px" },
  pollExtraVideo: { display: "flex", alignItems: "center", gap: 9, marginTop: 10, textDecoration: "none", color: "#c7ccd6", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "11px 13px", fontSize: 13.5 },
  pollAiTarget: { display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(120,144,230,.14)", border: "1px solid rgba(120,144,230,.4)", color: "#aeb8ea", borderRadius: 9, padding: "7px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
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
