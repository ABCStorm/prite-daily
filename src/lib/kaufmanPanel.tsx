import React, { useEffect, useRef, useState } from "react";
import { BookOpen, ImageOff, ChevronLeft, ChevronRight } from "lucide-react";
import {
  kaufmanImage,
  prefetchKaufmanImage,
  kaufmanPageImageName,
  type KaufmanRef,
} from "./kaufmanRefs";

/* Kaufman 9e panel — same pager rules as DSM/Kaplan:
   1. Don't present PDF indexes as printed-page citations.
   2. Images via kaufmanImage() blob URLs (private R2 + auth header).
   3. Pager stops at section edges (lo/hi + atStart/atEnd). */

type Theme = {
  text: string;
  muted: string;
  faint: string;
  teal: string;
  tealDeep: string;
  tealSoft: string;
  paperEdge: string;
  card: string;
  paper?: string;
  [key: string]: string | undefined;
};

function PageShot({
  name,
  theme,
  onZoom,
}: {
  name: string;
  theme: Theme;
  onZoom: (u: string, gallery?: string[]) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    setErr(false);
    kaufmanImage(name)
      .then((u) => {
        if (alive) setUrl(u);
      })
      .catch(() => {
        if (alive) setErr(true);
      });
    return () => {
      alive = false;
    };
  }, [name]);

  if (err) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          fontSize: 13,
          color: theme.faint,
        }}
      >
        <ImageOff size={15} strokeWidth={1.8} />
        <span>Page image unavailable (sign in required; pages may still be uploading).</span>
      </div>
    );
  }

  if (!url) {
    return (
      <div
        style={{
          height: "min(72vh, 820px)",
          background: `linear-gradient(100deg, ${theme.card} 30%, ${theme.tealSoft} 50%, ${theme.card} 70%)`,
          backgroundSize: "220% 100%",
          animation: "ksShimmer 1.4s ease-in-out infinite",
        }}
      />
    );
  }

  return (
    <div
      onClick={() => onZoom(url)}
      title="Click to enlarge and zoom"
      style={{ background: "#fff", cursor: "zoom-in", lineHeight: 0 }}
    >
      <img
        src={url}
        alt="Kaufman textbook page (click to enlarge)"
        loading="lazy"
        style={{
          display: "block",
          width: "100%",
          maxHeight: "min(88vh, 1400px)",
          height: "auto",
          objectFit: "contain",
          objectPosition: "top center",
        }}
      />
    </div>
  );
}

function positionLabel(cur: number, anchor: number, lo: number, hi: number): string {
  const d = cur - anchor;
  if (d === 0) return "Quoted / most relevant page in this section";
  const n = Math.abs(d);
  const pos = `${n} page${n === 1 ? "" : "s"} ${d < 0 ? "before" : "after"} this passage`;
  const total = hi - lo + 1;
  if (total > 1) {
    const idx = cur - lo + 1;
    return `${pos} · ${idx} of ${total}`;
  }
  return pos;
}

function PageWindow({
  data,
  theme,
  onZoom,
}: {
  data: KaufmanRef;
  theme: Theme;
  onZoom: (u: string, gallery?: string[]) => void;
}) {
  const anchor = data.page ?? 0;
  const lo = data.lo ?? anchor;
  const hi = data.hi ?? anchor;
  const [cur, setCur] = useState(anchor);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (el) setWidth(el.getBoundingClientRect().width);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    setCur(anchor);
  }, [anchor]);

  useEffect(() => {
    if (cur > lo) prefetchKaufmanImage(kaufmanPageImageName(cur - 1));
    if (cur < hi) prefetchKaufmanImage(kaufmanPageImageName(cur + 1));
  }, [cur, lo, hi]);

  if (!anchor) return null;

  const go = (d: number) => setCur((p) => Math.min(hi, Math.max(lo, p + d)));
  const atLo = cur <= lo;
  const atHi = cur >= hi;
  const sectionName = `Chapter ${data.section}: ${data.title}`;
  let edge: string | null = null;
  if (atLo && data.atStart) edge = `Beginning of ${sectionName}`;
  else if (atHi && data.atEnd) edge = `End of ${sectionName}`;

  const narrow = width > 0 && width < 480;
  const pageCount = hi - lo + 1;
  const showDots = pageCount > 1 && pageCount <= 18;

  const arrowBtn = (disabled: boolean, side: "left" | "right"): React.CSSProperties => ({
    ...(narrow
      ? { flexShrink: 0 }
      : { position: "absolute", top: "50%", transform: "translateY(-50%)", [side]: 8 }),
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 46,
    height: 46,
    borderRadius: 999,
    padding: 0,
    border: `1px solid ${theme.paperEdge}`,
    background: disabled ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.94)",
    color: disabled ? theme.faint : theme.tealDeep,
    boxShadow: disabled || narrow ? "none" : "0 2px 10px -2px rgba(0,0,0,.28)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
  });

  const arrow = (dir: -1 | 1) => {
    const disabled = dir < 0 ? atLo : atHi;
    return (
      <button
        type="button"
        disabled={disabled}
        aria-label={dir < 0 ? "Previous page" : "Next page"}
        onClick={(e) => {
          e.stopPropagation();
          go(dir);
        }}
        style={arrowBtn(disabled, dir < 0 ? "left" : "right")}
      >
        {dir < 0 ? (
          <ChevronLeft size={26} strokeWidth={2.2} />
        ) : (
          <ChevronRight size={26} strokeWidth={2.2} />
        )}
      </button>
    );
  };

  return (
    <div
      tabIndex={0}
      className="ksPager"
      role="group"
      aria-label="Kaufman textbook pages — use left and right arrow keys"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          go(-1);
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          go(1);
        }
      }}
      style={{
        marginTop: 12,
        borderRadius: 10,
        border: `1px solid ${theme.paperEdge}`,
        boxShadow: "0 10px 28px -16px rgba(0,0,0,.28)",
        overflow: "hidden",
      }}
    >
      <div ref={wrapRef} style={{ position: "relative" }}>
        <PageShot
          name={kaufmanPageImageName(cur)}
          theme={theme}
          onZoom={(url) => {
            const names = Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => kaufmanPageImageName(lo + i));
            void Promise.all(names.map((n) => kaufmanImage(n).catch(() => ""))).then((urls) => {
              onZoom(url, urls.filter(Boolean));
            });
          }}
        />
        {!narrow && arrow(-1)}
        {!narrow && arrow(1)}
      </div>

      <div
        style={{
          padding: "6px 9px 7px",
          background: theme.card,
          borderTop: `1px solid ${theme.paperEdge}`,
          userSelect: "none",
        }}
      >
        {showDots ? (
          <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap" }}>
            {Array.from({ length: hi - lo + 1 }, (_, i) => {
              const p = lo + i;
              const isCur = p === cur;
              const isAnchor = p === anchor;
              return (
                <span
                  key={p}
                  onClick={() => setCur(p)}
                  title={positionLabel(p, anchor, lo, hi)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 18,
                    height: 18,
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      width: isAnchor ? 8 : 6,
                      height: isAnchor ? 8 : 6,
                      borderRadius: 999,
                      background: isCur ? theme.teal : isAnchor ? theme.tealDeep : theme.paperEdge,
                      outline: isCur ? `2px solid ${theme.tealSoft}` : "none",
                    }}
                  />
                </span>
              );
            })}
          </div>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {narrow && arrow(-1)}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              fontSize: 11.5,
              lineHeight: 1.3,
              color: edge ? theme.tealDeep : theme.muted,
              fontWeight: edge ? 600 : 400,
            }}
          >
            {edge || positionLabel(cur, anchor, lo, hi)}
          </div>
          {narrow && arrow(1)}
        </div>
      </div>
    </div>
  );
}

export function KaufmanPanel({
  data,
  theme: T,
  onZoom,
}: {
  data: KaufmanRef;
  theme: Theme;
  onZoom?: (u: string, gallery?: string[]) => void;
}) {
  const zoom = onZoom ?? (() => {});
  const hasPages = data.page != null && data.lo != null;

  return (
    <div>
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
        <BookOpen size={17} strokeWidth={2} color={T.teal} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>
            {data.section === "R" ? data.title : `Chapter ${data.section}: ${data.title}`}
          </div>
          <div style={{ fontSize: 12.5, color: T.faint, marginTop: 2 }}>
            {data.book || "Kaufman's Clinical Neurology for Psychiatrists, 9th ed."}
          </div>
        </div>
      </div>

      {data.why ? (
        <p style={{ margin: "12px 0 0", fontSize: 13.5, color: T.muted, lineHeight: 1.55 }}>{data.why}</p>
      ) : null}

      {hasPages ? <PageWindow data={data} theme={T} onZoom={zoom} /> : null}

      <p
        style={{
          marginTop: 18,
          fontSize: 12,
          lineHeight: 1.5,
          color: T.faint,
          borderTop: `1px solid ${T.paperEdge}`,
          paddingTop: 10,
        }}
      >
        These pages are from the book’s main teaching text (not its review-question section) and are
        private to signed-in members. Use the arrows (or ← →) to read the surrounding discussion.
        Positions are relative to the matched passage — not printed-page citations.
      </p>
    </div>
  );
}

function shortFigLabel(caption?: string): string {
  if (!caption) return "Figure from Kaufman";
  const m = caption.match(/Fig(?:ure)?\.?\s*[\dA-Za-z]+\.[\dA-Za-z]+/i);
  if (m) return m[0].replace(/\s+/g, " ");
  if (caption.startsWith("Figure from")) return "Figure from Kaufman";
  return caption.replace(/\s+/g, " ").slice(0, 80);
}

/** Cropped book figure (stem or cited teaching-chapter illustration). */
export function KaufmanFigure({
  file,
  caption,
  theme,
  onZoom,
}: {
  file: string;
  caption?: string;
  theme: Theme;
  onZoom: (u: string) => void;
}) {
  return (
    <div style={{ margin: "10px 0 14px", maxWidth: 640 }}>
      <PageShot name={file} theme={theme} onZoom={onZoom} />
      <div style={{ fontSize: 11.5, color: theme.faint, marginTop: 6, lineHeight: 1.4 }}>
        {shortFigLabel(caption)} — tap to enlarge
      </div>
    </div>
  );
}
