import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Clock, Minus, Music, Pause, Play, Plus, SkipForward, Volume2, VolumeX,
} from "lucide-react";
import { DynamicIsland, DynamicIslandView } from "./DynamicIsland";

const TIMER_MIN = 20;
const TIMER_MAX = 120;
const clampSecs = (n: number) => Math.min(TIMER_MAX, Math.max(TIMER_MIN, Math.round(n) || 60));

export function fmtClock(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

type IslandView = "timer" | "music" | null;

const TRACKS = [
  {
    id: "sweet-september",
    title: "Sweet September",
    artist: "Arulo",
    src: "/study-music/sweet-september.mp3",
  },
  {
    id: "sleepy-cat",
    title: "Sleepy Cat",
    artist: "Alejandro Magaña",
    src: "/study-music/sleepy-cat.mp3",
  },
] as const;

const BAR_DELAYS = [0, 0.18, 0.09, 0.27];

function readNum(key: string, fallback: number) {
  try {
    const n = Number(JSON.parse(localStorage.getItem(key) || "null"));
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* best-effort */ }
}

function EqBars({ on, color = "#69c5ad" }: { on: boolean; color?: string }) {
  const reduce = useReducedMotion();
  return (
    <span style={{ display: "flex", height: 14, alignItems: "flex-end", gap: 2 }} aria-hidden>
      {BAR_DELAYS.map((delay) => (
        <motion.span
          key={delay}
          animate={on && !reduce ? { scaleY: [0.4, 1, 0.55, 0.9, 0.4] } : { scaleY: 0.35 }}
          transition={
            on && !reduce
              ? { duration: 1.1, repeat: Infinity, ease: "easeInOut", delay }
              : { duration: 0.2 }
          }
          style={{
            display: "block",
            width: 2,
            height: "100%",
            transformOrigin: "bottom",
            borderRadius: 999,
            background: color,
            scaleY: 0.45,
          }}
        />
      ))}
    </span>
  );
}

function IslandBtn({
  onClick,
  label,
  children,
  tone = "ghost",
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  tone?: "ghost" | "solid" | "warn";
}) {
  const bg = tone === "solid" ? "#0e7a6b" : tone === "warn" ? "#b04a30" : "rgba(255,255,255,.1)";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 32,
        height: 32,
        display: "grid",
        placeItems: "center",
        border: 0,
        borderRadius: 999,
        background: bg,
        color: "#fff",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

export function StudyIsland({
  timerOn,
  onTimerOn,
  timerSecs,
  onTimerSecs,
  timeLeft,
  inPractice,
  answering,
}: {
  timerOn: boolean;
  onTimerOn: (on: boolean) => void;
  timerSecs: number;
  onTimerSecs: (n: number) => void;
  timeLeft: number | null;
  inPractice: boolean;
  answering: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<IslandView>(null);
  const [playing, setPlaying] = useState(false);
  const [track, setTrack] = useState(() => Math.max(0, Math.min(TRACKS.length - 1, Math.round(readNum("pd_lofi_track", 0)))));
  const [volume, setVolume] = useState(() => Math.max(0, Math.min(1, readNum("pd_lofi_vol", 0.32))));
  const current = TRACKS[track] ?? TRACKS[0];
  const timerLive = timerOn && inPractice && answering && timeLeft != null;
  const low = timerLive && timeLeft <= 10;
  const shownTime = timerLive ? timeLeft : timerSecs;

  useEffect(() => { writeJson("pd_lofi_vol", volume); }, [volume]);
  useEffect(() => { writeJson("pd_lofi_track", track); }, [track]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = volume;
  }, [volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.getAttribute("src") !== current.src) {
      el.src = current.src;
    }
    if (playing) {
      void el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  }, [playing, current.src]);

  useEffect(() => {
    if (view === null) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setView(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setView(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [view]);

  const nextTrack = () => setTrack((i) => (i + 1) % TRACKS.length);

  const openFromCompact = (which: IslandView) => {
    setView((cur) => (cur === which ? null : which));
  };

  const bumpSecs = (delta: number) => onTimerSecs(clampSecs(timerSecs + delta));

  return (
    <div ref={rootRef} className="studyIsland" style={wrap}>
      <style>{islandClickCss}</style>
      <audio
        ref={audioRef}
        preload="none"
        onEnded={nextTrack}
      />
      <DynamicIsland
        view={view}
        style={{ pointerEvents: "auto" }}
        compact={
          <>
            <button
              type="button"
              onClick={() => openFromCompact("timer")}
              aria-label={timerOn ? `Timer ${fmtClock(shownTime)}` : "Open question timer"}
              style={compactHit}
            >
              <span style={{
                width: 6,
                height: 6,
                borderRadius: 999,
                background: low ? "#ff9b80" : timerOn ? "#69c5ad" : "rgba(255,255,255,.28)",
                boxShadow: timerOn && !low ? "0 0 8px #69c5ad" : "none",
              }} />
              <Clock size={12} strokeWidth={2.4} color={low ? "#ff9b80" : "rgba(244,241,234,.78)"} />
              <span style={{
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "0.02em",
                color: low ? "#ff9b80" : "#f4f1ea",
              }}>
                {fmtClock(shownTime)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => openFromCompact("music")}
              aria-label={playing ? `Lo-fi playing: ${current.title}` : "Open study music"}
              style={compactHit}
            >
              <EqBars on={playing} color={playing ? "#69c5ad" : "rgba(255,255,255,.35)"} />
            </button>
          </>
        }
      >
        <DynamicIslandView id="timer" style={{ gap: 14 }}>
          <Clock size={18} strokeWidth={2.2} color={low ? "#ff9b80" : "#e0b15a"} />
          <div style={{ display: "flex", flexDirection: "column", minWidth: 92 }}>
            <span style={kicker}>{timerLive ? "This question" : "Seconds / question"}</span>
            <span style={{ ...clockFace, color: low ? "#ff9b80" : "#f4f1ea" }}>{fmtClock(shownTime)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IslandBtn label="Ten seconds less" onClick={() => bumpSecs(-10)}>
              <Minus size={14} strokeWidth={2.4} />
            </IslandBtn>
            <IslandBtn label="Ten seconds more" onClick={() => bumpSecs(10)}>
              <Plus size={14} strokeWidth={2.4} />
            </IslandBtn>
            <button
              type="button"
              onClick={() => onTimerOn(!timerOn)}
              aria-pressed={timerOn}
              style={{
                height: 32,
                padding: "0 12px",
                border: 0,
                borderRadius: 999,
                background: timerOn ? "#0e7a6b" : "rgba(255,255,255,.1)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {timerOn ? "On" : "Off"}
            </button>
          </div>
        </DynamicIslandView>

        <DynamicIslandView id="music" style={{ gap: 14 }}>
          <span style={album}>
            <Music size={15} strokeWidth={2.2} />
          </span>
          <div style={{ display: "flex", flexDirection: "column", textAlign: "left", minWidth: 128, maxWidth: 180 }}>
            <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>{current.title}</span>
            <span style={{ fontSize: 10.5, opacity: 0.6, marginTop: 2 }}>{current.artist} · lo-fi</span>
          </div>
          <EqBars on={playing} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <IslandBtn label={playing ? "Pause" : "Play"} tone="solid" onClick={() => setPlaying((v) => !v)}>
              {playing ? <Pause size={14} strokeWidth={2.4} /> : <Play size={14} strokeWidth={2.4} />}
            </IslandBtn>
            <IslandBtn label="Next track" onClick={nextTrack}>
              <SkipForward size={14} strokeWidth={2.4} />
            </IslandBtn>
          </div>
          <label style={volRow}>
            {volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              aria-label="Volume"
              onChange={(e) => setVolume(Number(e.target.value))}
              style={volSlider}
            />
          </label>
        </DynamicIslandView>
      </DynamicIsland>

      <AnimatePresence>
        {view !== null && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            style={switcher}
          >
            <button
              type="button"
              onClick={() => setView("timer")}
              style={{ ...switchBtn, ...(view === "timer" ? switchOn : {}) }}
            >
              <Clock size={12} strokeWidth={2.3} /> Timer
            </button>
            <button
              type="button"
              onClick={() => setView("music")}
              style={{ ...switchBtn, ...(view === "music" ? switchOn : {}) }}
            >
              <Music size={12} strokeWidth={2.3} /> Lo-fi
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {view === "timer" && (
        <p style={hint}>
          {inPractice
            ? (timerOn
              ? (answering ? "Locks the answer when it hits zero." : "Counts on the next unanswered question.")
              : "Turn it on for a per-question countdown, like the exam.")
            : "Timer runs on Today and Custom sets."}
        </p>
      )}
      {view === "music" && (
        <p style={hint}>
          Mixkit lo-fi · loops while you work. Sweet September (Arulo) and Sleepy Cat (Alejandro Magaña).
        </p>
      )}
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "fixed",
  top: 8,
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 36,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  pointerEvents: "none",
};

const compactHit: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: 0,
  border: 0,
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  pointerEvents: "auto",
};

const kicker: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  opacity: 0.55,
};

const clockFace: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "-0.03em",
  lineHeight: 1.1,
  marginTop: 2,
};

const album: React.CSSProperties = {
  width: 36,
  height: 36,
  display: "grid",
  placeItems: "center",
  borderRadius: 10,
  background: "rgba(255,255,255,.12)",
  flexShrink: 0,
};

const volRow: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "rgba(244,241,234,.7)",
};

const volSlider: React.CSSProperties = {
  width: 72,
  accentColor: "#69c5ad",
};

const switcher: React.CSSProperties = {
  pointerEvents: "auto",
  marginTop: 8,
  display: "inline-flex",
  gap: 4,
  padding: 3,
  borderRadius: 999,
  background: "rgba(17,19,24,.78)",
  border: "1px solid rgba(255,255,255,.08)",
  backdropFilter: "blur(12px)",
};

const switchBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  border: 0,
  background: "transparent",
  color: "rgba(244,241,234,.62)",
  fontSize: 11.5,
  fontWeight: 650,
  padding: "5px 10px",
  borderRadius: 999,
  cursor: "pointer",
};

const switchOn: React.CSSProperties = {
  background: "rgba(255,255,255,.12)",
  color: "#f4f1ea",
};

const hint: React.CSSProperties = {
  pointerEvents: "none",
  margin: "7px 0 0",
  maxWidth: 280,
  textAlign: "center",
  fontSize: 11,
  lineHeight: 1.4,
  color: "rgba(244,241,234,.62)",
  textShadow: "0 1px 8px rgba(0,0,0,.55)",
};

/* Re-enable clicks on the island itself; the wrap is pointer-events none so
   clicks pass through the empty sides to the header underneath. */
const islandClickCss = `
.studyIsland > div:first-of-type,
.studyIsland [role="status"] { pointer-events: auto; }
@media (max-width: 640px) {
  .studyIsland { top: 6px; }
}
`;
