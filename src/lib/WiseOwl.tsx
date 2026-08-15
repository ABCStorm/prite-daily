import React, { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { OwlStat } from "./owlStats";

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

export function WiseOwl({
  qid,
  stat,
}: {
  qid: string;
  stat: OwlStat;
  theme?: Theme;
}) {
  const [open, setOpen] = useState(false);
  const [frame, setFrame] = useState<Frame>("idle");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(false);
    setFrame("idle");
  }, [qid]);

  useEffect(() => {
    if (open) return;
    let cancelled = false;
    let blinkTimer = 0;
    const schedule = () => {
      const wait = 2800 + Math.random() * 3200;
      blinkTimer = window.setTimeout(() => {
        if (cancelled) return;
        setFrame("blink");
        window.setTimeout(() => {
          if (!cancelled) setFrame("idle");
          if (!cancelled) schedule();
        }, 140);
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

  const src = frame === "blink" ? "/owl/cat-blink.webp" : "/owl/cat-idle.webp";

  return (
    <div ref={wrapRef} className="wiseOwl" style={wrap}>
      <style>{OWL_CSS}</style>
      <button
        type="button"
        className="wiseOwlBtn"
        onClick={() => setOpen((v) => !v)}
        title="Show a Stat Cat fact about this question"
        aria-expanded={open}
        aria-controls={`owl-pearl-${qid}`}
      >
        <img src={src} alt="" width={72} height={98} draggable={false} />
      </button>
      {open && (
        <aside id={`owl-pearl-${qid}`} className="wiseOwlCard" role="dialog" aria-label="Stat Cat fact">
          <p className="wiseOwlKicker">Stat Cat</p>
          <p className="wiseOwlLine">{stat.sentence}</p>
          <a
            className="wiseOwlSrc"
            href={stat.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            Source{stat.source_year ? ` · ${stat.source_year}` : ""}: {stat.source_label}
            <ExternalLink size={11} strokeWidth={2.3} />
          </a>
        </aside>
      )}
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "absolute",
  top: 20,
  right: 6,
  zIndex: 4,
  width: 78,
  pointerEvents: "none",
};

const OWL_CSS = `
.wiseOwl { pointer-events: none; }
.wiseOwlBtn {
  pointer-events: auto;
  position: relative;
  display: block;
  width: 72px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  filter: drop-shadow(0 8px 10px rgba(27,30,43,.18));
  animation: wiseOwlPerch 3.6s ease-in-out infinite;
}
.wiseOwlBtn img { display: block; width: 72px; height: auto; user-select: none; }
.wiseOwlBtn:hover { transform: translateY(-2px) scale(1.04); animation-play-state: paused; }
.wiseOwlBtn:focus-visible { outline: 2px solid #0e7a6b; outline-offset: 3px; border-radius: 12px; }
.wiseOwlCard {
  pointer-events: auto;
  position: absolute; top: 8px; right: 78px;
  width: min(340px, calc(100vw - 120px));
  padding: 12px 14px 11px;
  background: #fffdf8;
  border: 1px solid #ece5d8;
  border-radius: 12px;
  box-shadow: 0 16px 36px -22px rgba(27,30,43,.55);
  animation: wiseOwlIn .2s ease both;
}
.wiseOwlCard::after {
  content: "";
  position: absolute; top: 22px; right: -7px;
  width: 12px; height: 12px;
  background: #fffdf8; border-right: 1px solid #ece5d8; border-top: 1px solid #ece5d8;
  transform: rotate(45deg);
}
.wiseOwlKicker {
  margin: 0 0 5px;
  font-size: 10.5px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: #d4832a;
}
.wiseOwlLine {
  margin: 0 0 8px;
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  font-size: 14.5px; line-height: 1.45; color: #23262f;
}
.wiseOwlSrc {
  display: inline-flex; align-items: center; gap: 5px;
  color: #0b5d52; font-size: 12px; font-weight: 600; line-height: 1.35;
  text-decoration: none; border-bottom: 1px solid rgba(11,93,82,.25);
}
.wiseOwlSrc:hover { border-bottom-color: #0b5d52; }
@keyframes wiseOwlPerch {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes wiseOwlIn { from { opacity: 0; transform: translateX(8px); } }
@media (max-width: 640px) {
  .wiseOwlBtn, .wiseOwlBtn img { width: 58px; }
  .wiseOwl { width: 62px; }
  .wiseOwlCard { right: 64px; width: min(280px, calc(100vw - 86px)); }
}
@media (prefers-reduced-motion: reduce) {
  .wiseOwlBtn, .wiseOwlCard { animation: none; }
}
`;
