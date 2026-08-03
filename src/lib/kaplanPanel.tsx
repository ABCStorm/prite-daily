import React, { useEffect, useRef, useState } from "react";
import { BookOpen, ImageOff, ChevronLeft, ChevronRight } from "lucide-react";
import { kaplanImage, prefetchKaplanImage, pageImageName,
         type KaplanRef, type KaplanCite } from "./kaplanRefs";

/* The "Textbook" tab: shows the Kaplan & Sadock passage(s) backing a question.

   Three things here are deliberate and shouldn't be "improved" away:

   1. No page numbers. The K&S source is a reflowed ebook with NO printed page
      numbers anywhere, so any page figure we have is an index into our own PDF,
      not a citable book page. We cite section number + title instead — and the
      pager below describes position relative to the quote ("2 pages earlier"),
      never as a number.
   2. Images are fetched through kaplanImage() into object URLs rather than set
      as <img src>, because the bucket is private and a plain img tag can't send
      the Authorization header.
   3. The pager stops at the section boundary. Only pages within the citation's
      own section are rendered and uploaded, so paging past the end would 404;
      more to the point, spilling into an unrelated section is worse than not
      scrolling at all. The `atStart`/`atEnd` flags say the stop is a real
      section edge rather than just the end of the window we rendered. */

type Theme = {
  text: string;
  muted: string;
  faint: string;
  teal: string;
  tealDeep: string;
  tealSoft: string;
  paperEdge: string;
  card: string;
};

/** One page screenshot, loaded lazily and only once it scrolls into view. */
function PageShot({ name, theme, onZoom }: { name: string; theme: Theme; onZoom: (u: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  /* Deliberately does NOT clear `url` when `name` changes. Paging to a
     neighbouring page usually hits the prefetch cache and resolves within a
     microtask, so blanking first would strobe a shimmer between every page.
     Hold the page you're looking at until its replacement is decoded. */
  useEffect(() => {
    let alive = true;
    setErr(false);
    kaplanImage(name)
      .then((u) => { if (alive) setUrl(u); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [name]);

  if (err) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                    fontSize: 13, color: theme.faint }}>
        <ImageOff size={15} strokeWidth={1.8} />
        <span>Page image unavailable.</span>
      </div>
    );
  }

  if (!url) {
    return (
      <div style={{ height: "min(72vh, 820px)",
                    background: `linear-gradient(100deg, ${theme.card} 30%, ${theme.tealSoft} 50%, ${theme.card} 70%)`,
                    backgroundSize: "220% 100%", animation: "ksShimmer 1.4s ease-in-out infinite" }} />
    );
  }

  // Big in-panel preview: page uses most of the available column (the textbook
  // tab widens the well) and up to ~88vh tall so you can read it. Click opens
  // the full-screen lightbox with + / − zoom.
  return (
    <div
      onClick={() => onZoom(url)}
      title="Click to enlarge and zoom"
      style={{ background: "#fff", cursor: "zoom-in", lineHeight: 0 }}
    >
      <img
        src={url}
        alt="Kaplan & Sadock page (click to enlarge)"
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

/** Where the reader is, said without ever naming a page number. */
function positionLabel(cur: number, quotePage: number): string {
  const d = cur - quotePage;
  if (d === 0) return "The quoted passage is on this page";
  const n = Math.abs(d);
  return `${n} page${n === 1 ? "" : "s"} ${d < 0 ? "before" : "after"} the quoted passage`;
}

/* The readable window: the cited page plus the pages around it, so a reader can
   actually read the surrounding argument instead of a single orphaned page. */
function PageWindow({ c, section, title, theme, onZoom }: {
  c: KaplanCite;
  section: string;
  title: string;
  theme: Theme;
  onZoom: (u: string) => void;
}) {
  const quotePage = c.page!;
  const lo = c.lo ?? quotePage;
  const hi = c.hi ?? quotePage;
  const [cur, setCur] = useState(quotePage);
  /* Own width, not the viewport's: this panel sits in a column whose width
     depends on the tab layout, so a viewport media query would guess wrong.

     Measured on mount and on window resize rather than with a ResizeObserver.
     RO would also catch container-only changes, but nothing here resizes the
     column without a window resize, and this version is verifiable in a headless
     browser — RO callbacks are tied to frame production and simply never fire in
     one, which silently pinned this to the wide layout for a while. */
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

  // Moving to another question reuses this component (the citations are keyed by
  // index), so reset to the quote rather than stranding the reader mid-window.
  useEffect(() => { setCur(quotePage); }, [quotePage]);

  // Pull the neighbours in the background so paging doesn't flash a shimmer.
  useEffect(() => {
    if (cur > lo) prefetchKaplanImage(pageImageName(cur - 1));
    if (cur < hi) prefetchKaplanImage(pageImageName(cur + 1));
  }, [cur, lo, hi]);

  const go = (d: number) => setCur((p) => Math.min(hi, Math.max(lo, p + d)));
  const atLo = cur <= lo;
  const atHi = cur >= hi;
  const sectionName = `${section ? `§${section} ` : ""}${title}`.trim();

  let edge: string | null = null;
  if (atLo && c.atStart) edge = `Beginning of ${sectionName}`;
  else if (atHi && c.atEnd) edge = `End of ${sectionName}`;

  /* Wide enough, and the arrows float over the page's own left/right margins.
     Buttons tucked under the page in a toolbar read as "controls for this
     widget"; arrows flanking the page read as "there are more pages that way",
     which is the thing readers were missing.

     Below ~480px they drop into the footer instead. The page render is A4 with
     generous margins, but those margins scale with the image while a 46px button
     does not — on a phone the overlay lands squarely on the body text and hides
     several words of the thing you're trying to read. */
  const narrow = width > 0 && width < 480;

  const arrowBtn = (disabled: boolean, side: "left" | "right"): React.CSSProperties => ({
    ...(narrow
      ? { flexShrink: 0 }
      : { position: "absolute", top: "50%", transform: "translateY(-50%)", [side]: 8 }),
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 46, height: 46, borderRadius: 999, padding: 0,
    border: `1px solid ${theme.paperEdge}`,
    // Nearly opaque: overlaid, these sit over dense body text.
    background: disabled ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.94)",
    color: disabled ? theme.faint : theme.tealDeep,
    // Kept visible (dimmed) at the section edges rather than hidden — an arrow
    // that vanishes looks like a bug, and the footer says *why* it stopped.
    boxShadow: disabled || narrow ? "none" : "0 2px 10px -2px rgba(0,0,0,.28)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.45 : 1,
  });

  const arrow = (dir: -1 | 1) => {
    const disabled = dir < 0 ? atLo : atHi;
    return (
      <button type="button" disabled={disabled}
              aria-label={dir < 0 ? "Previous page" : "Next page"}
              // stopPropagation: the page itself is a click-to-zoom target, and
              // without this every page turn would also fire the lightbox.
              onClick={(e) => { e.stopPropagation(); go(dir); }}
              style={arrowBtn(disabled, dir < 0 ? "left" : "right")}>
        {dir < 0 ? <ChevronLeft size={26} strokeWidth={2.2} />
                 : <ChevronRight size={26} strokeWidth={2.2} />}
      </button>
    );
  };

  return (
    <div
      tabIndex={0}
      className="ksPager"
      role="group"
      aria-label="Textbook pages around the quoted passage — use left and right arrow keys"
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
        if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
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
        <PageShot name={pageImageName(cur)} theme={theme} onZoom={onZoom} />
        {!narrow && arrow(-1)}
        {!narrow && arrow(1)}
      </div>

      <div style={{ padding: "6px 9px 7px", background: theme.card,
                    borderTop: `1px solid ${theme.paperEdge}`, userSelect: "none" }}>
        {/* Dots get their own full-width row. Squeezed between the buttons they
            only had ~165px on a phone, which isn't enough for 11 hittable dots —
            they wrapped to a ragged second line. */}
        <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap" }}>
            {Array.from({ length: hi - lo + 1 }, (_, i) => {
              const p = lo + i;
              const isCur = p === cur;
              const isQuote = p === quotePage;
              return (
                <span key={p} onClick={() => setCur(p)} title={positionLabel(p, quotePage)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center",
                               width: 18, height: 18, cursor: "pointer" }}>
                  <span style={{
                    width: isQuote ? 8 : 6, height: isQuote ? 8 : 6, borderRadius: 999,
                    background: isCur ? theme.teal : isQuote ? theme.tealDeep : theme.paperEdge,
                    outline: isCur ? `2px solid ${theme.tealSoft}` : "none",
                  }} />
                </span>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {narrow && arrow(-1)}
          {/* Wraps rather than ellipsing: at phone width "End of §11.3
              Stimulant-Related Disorders" is exactly the sentence you don't want
              cut off, since it's the reason paging stopped. */}
          <div style={{ flex: 1, minWidth: 0, textAlign: "center",
                        fontSize: 11.5, lineHeight: 1.3,
                        color: edge ? theme.tealDeep : theme.muted,
                        fontWeight: edge ? 600 : 400 }}>
            {edge || positionLabel(cur, quotePage)}
          </div>
          {narrow && arrow(1)}
        </div>
      </div>
    </div>
  );
}

function Cite({ c, section, title, theme, onZoom }: {
  c: KaplanCite; section: string; title: string; theme: Theme; onZoom: (u: string) => void;
}) {
  const isPrimary = c.role === "primary";
  return (
    <div style={{ marginTop: 16 }}>
      <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: 0.4,
                     textTransform: "uppercase", padding: "3px 8px", borderRadius: 999,
                     color: isPrimary ? "#fff" : theme.tealDeep,
                     background: isPrimary ? theme.teal : theme.tealSoft }}>
        {isPrimary ? "Supports the answer" : "Context"}
      </span>
      <blockquote style={{ margin: "9px 0 0", padding: "2px 0 2px 14px",
                           borderLeft: `3px solid ${theme.teal}`, fontSize: 15, lineHeight: 1.6,
                           color: theme.text }}>
        “{c.quote}”
      </blockquote>
      {c.note && (
        <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.55, color: theme.muted }}>
          {c.note}
        </p>
      )}
      {c.page && (
        <PageWindow c={c} section={section} title={title} theme={theme} onZoom={onZoom} />
      )}
    </div>
  );
}

export function KaplanPanel({ data, theme, onZoom }: {
  data: KaplanRef;
  theme: Theme;
  onZoom: (u: string) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
        <BookOpen size={17} strokeWidth={2} color={theme.teal} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: theme.text }}>
            {data.section ? `§${data.section} ` : ""}{data.title}
          </div>
          <div style={{ fontSize: 12.5, color: theme.faint, marginTop: 2 }}>
            Kaplan &amp; Sadock’s Comprehensive Textbook of Psychiatry, 10th ed.
          </div>
        </div>
      </div>

      {data.cites.map((c, i) => (
        <Cite key={i} c={c} section={data.section} title={data.title} theme={theme} onZoom={onZoom} />
      ))}

      <p style={{ marginTop: 18, fontSize: 12, lineHeight: 1.5, color: theme.faint,
                  borderTop: `1px solid ${theme.paperEdge}`, paddingTop: 10 }}>
        Quotes are matched verbatim against the textbook, not paraphrased. The source is a reflowed
        ebook with no printed page numbers, so passages are cited by section rather than page. Use
        the arrows (or ← →) to read the pages around a quote; paging stops at the section’s edges.
      </p>
    </div>
  );
}
