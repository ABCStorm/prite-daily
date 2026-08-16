import React, { useEffect, useRef, useState } from "react";
import type { DynPearl } from "./dynPerspectives";

type Theme = {
  text: string;
  muted: string;
  faint: string;
  teal: string;
  tealDeep: string;
  paper: string;
  paperEdge: string;
  gold: string;
  goldSoft: string;
  [key: string]: string;
};

type Frame = "idle" | "blink";

export function AnalystFox({
  qid,
  pearl,
}: {
  qid: string;
  pearl: DynPearl;
  theme?: Theme;
}) {
  // The tag mounts this component, so start with both mascot and note visible.
  // The mascot remains clickable for people who want to tuck only the note away.
  const [open, setOpen] = useState(true);
  const [frame, setFrame] = useState<Frame>("idle");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(true);
    setFrame("idle");
  }, [qid]);

  useEffect(() => {
    if (open) return;
    let cancelled = false;
    let blinkTimer = 0;
    const schedule = () => {
      const wait = 3200 + Math.random() * 3600;
      blinkTimer = window.setTimeout(() => {
        if (cancelled) return;
        setFrame("blink");
        window.setTimeout(() => {
          if (!cancelled) setFrame("idle");
          if (!cancelled) schedule();
        }, 150);
      }, wait);
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(blinkTimer);
    };
  }, [open, qid]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const src = frame === "blink" ? "/dyn/dawg-blink.webp" : "/dyn/dawg-idle.webp";

  return (
    <div ref={wrapRef} className="analystFox" style={wrap}>
      <style>{FOX_CSS}</style>
      <button
        type="button"
        className="analystFoxBtn"
        onClick={() => setOpen((v) => !v)}
        title="Show a Dynamic Dawg take on this question"
        aria-expanded={open}
        aria-controls={`dyn-pearl-${qid}`}
      >
        <img src={src} alt="" width={78} height={116} draggable={false} />
      </button>
      {open && (
        <aside id={`dyn-pearl-${qid}`} className="analystFoxCard" role="dialog" aria-label="Dynamic Dawg perspective">
          <p className="analystFoxKicker">Dynamic Dawg</p>
          <p className="analystFoxLine">{pearl.sentence}</p>
        </aside>
      )}
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "absolute",
  top: 18,
  left: 4,
  zIndex: 4,
  width: 84,
  pointerEvents: "none",
};

const FOX_CSS = `
.analystFox { pointer-events: none; }
.analystFoxBtn {
  pointer-events: auto;
  position: relative;
  display: block;
  width: 78px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  filter: drop-shadow(0 8px 10px rgba(27,30,43,.18));
  animation: analystFoxSettle 4.2s ease-in-out infinite;
}
.analystFoxBtn img { display: block; width: 78px; height: auto; user-select: none; }
.analystFoxBtn:hover { transform: translateY(-2px) scale(1.04); animation-play-state: paused; }
.analystFoxBtn:focus-visible { outline: 2px solid #8a4b2f; outline-offset: 3px; border-radius: 12px; }
.analystFoxCard {
  pointer-events: auto;
  position: absolute; top: 10px; left: 84px;
  width: min(420px, calc(100vw - 100px));
  padding: 12px 14px 11px;
  background: #fffaf6;
  border: 1px solid #ead9cc;
  border-radius: 12px;
  box-shadow: 0 16px 36px -22px rgba(27,30,43,.55);
  animation: analystFoxIn .2s ease both;
}
.analystFoxCard::after {
  content: "";
  position: absolute; top: 26px; left: -7px;
  width: 12px; height: 12px;
  background: #fffaf6; border-left: 1px solid #ead9cc; border-bottom: 1px solid #ead9cc;
  transform: rotate(45deg);
}
.analystFoxKicker {
  margin: 0 0 5px;
  font-size: 10.5px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: #8a4b2f;
}
.analystFoxLine {
  margin: 0;
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  font-size: 14px; line-height: 1.5; color: #23262f;
}
@keyframes analystFoxSettle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}
@keyframes analystFoxIn { from { opacity: 0; transform: translateX(-8px); } }
@media (max-width: 640px) {
  .analystFoxBtn, .analystFoxBtn img { width: 62px; }
  .analystFox { width: 66px; }
  .analystFoxCard { left: 68px; width: min(320px, calc(100vw - 80px)); }
}
@media (prefers-reduced-motion: reduce) {
  .analystFoxBtn, .analystFoxCard { animation: none; }
}
`;
