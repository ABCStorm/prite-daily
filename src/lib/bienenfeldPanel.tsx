import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import {
  bienenfeldChapterLabel,
  bienenfeldPageSrc,
  bienenfeldReaderHref,
  loadBienenfeldChapters,
  type BienenfeldChapter,
  type BienenfeldChapterPage,
  type BienenfeldLoc,
  type BienenfeldReturn,
} from "./bienenfeldRefs";

type Theme = {
  text: string;
  muted: string;
  faint: string;
  teal: string;
  tealDeep: string;
  tealSoft: string;
  paperEdge: string;
  card: string;
  [key: string]: string | undefined;
};

function pageLabel(p: BienenfeldChapterPage): string {
  if (p.printed_int != null) return String(p.printed_int);
  if (p.printed_page) return String(p.printed_page);
  return p.tag;
}

function PageShot({
  src,
  alt,
  theme,
  onZoom,
}: {
  src: string;
  alt: string;
  theme: Theme;
  onZoom: (u: string) => void;
}) {
  const [ready, setReady] = useState(false);
  return (
    <div
      onClick={() => onZoom(src)}
      title="Click to enlarge"
      style={{ background: "#fff", cursor: "zoom-in", lineHeight: 0, minHeight: ready ? 0 : 240 }}
    >
      {!ready && (
        <div
          style={{
            height: "min(56vh, 640px)",
            background: `linear-gradient(100deg, ${theme.card} 30%, ${theme.tealSoft} 50%, ${theme.card} 70%)`,
            backgroundSize: "220% 100%",
            animation: "ksShimmer 1.4s ease-in-out infinite",
          }}
        />
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setReady(true)}
        style={{
          display: ready ? "block" : "none",
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

export function BienenfeldPanel({
  loc,
  theme: T,
  onZoom,
  returnTo,
  showQuote = true,
}: {
  loc: BienenfeldLoc;
  theme: Theme;
  onZoom?: (u: string, gallery?: string[]) => void;
  returnTo?: BienenfeldReturn | null;
  showQuote?: boolean;
}) {
  const zoom = onZoom ?? (() => {});
  const [chapters, setChapters] = useState<BienenfeldChapter[] | null>(null);
  const [cur, setCur] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let alive = true;
    loadBienenfeldChapters()
      .then((chs) => {
        if (alive) setChapters(chs);
      })
      .catch(() => {
        if (alive) setChapters([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const measure = () => {
      const el = wrapRef.current;
      if (el) setWidth(el.getBoundingClientRect().width);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const chapter = useMemo(() => {
    if (!chapters?.length) return null;
    if (loc.chapter_id) {
      const hit = chapters.find((c) => c.id === loc.chapter_id);
      if (hit) return hit;
    }
    if (loc.page != null) {
      return (
        chapters.find((c) => c.pages.some((p) => p.printed_int === loc.page)) || null
      );
    }
    return null;
  }, [chapters, loc.chapter_id, loc.page]);

  const pages = chapter?.pages?.filter((p) => p.image) ?? [];

  const anchor = useMemo(() => {
    if (!pages.length) return 0;
    const byPrint = pages.findIndex((p) => p.printed_int === loc.page);
    if (byPrint >= 0) return byPrint;
    if (loc.image) {
      const byImg = pages.findIndex((p) => p.image === loc.image || loc.image?.endsWith(p.image));
      if (byImg >= 0) return byImg;
    }
    return 0;
  }, [pages, loc.page, loc.image]);

  useEffect(() => {
    setCur(anchor);
  }, [anchor, loc.page, loc.chapter_id]);

  const page = pages[cur];
  const src = bienenfeldPageSrc(page?.image || loc.image);
  const title = chapter?.title || loc.chapter_title || "Bienenfeld";
  const number = chapter?.number;
  const heading = number != null && number !== ""
    ? `Chapter ${number}: ${bienenfeldChapterLabel(title)}`
    : bienenfeldChapterLabel(title);
  const readerPage = page?.printed_int ?? loc.page ?? null;
  const chapterHref = bienenfeldReaderHref({
    page: readerPage,
    chapterId: chapter?.id || loc.chapter_id,
    returnTo,
  });
  const readerHref = bienenfeldReaderHref({ returnTo });
  const narrow = width > 0 && width < 480;
  const atLo = cur <= 0;
  const atHi = cur >= pages.length - 1;

  const go = (d: number) => setCur((p) => Math.min(pages.length - 1, Math.max(0, p + d)));

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
    border: `1px solid ${T.paperEdge}`,
    background: disabled ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.94)",
    color: disabled ? T.faint : T.tealDeep,
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
        {dir < 0 ? <ChevronLeft size={26} strokeWidth={2.2} /> : <ChevronRight size={26} strokeWidth={2.2} />}
      </button>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
        <BookOpen size={17} strokeWidth={2} color={T.teal} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text }}>{heading}</div>
          <div style={{ fontSize: 12.5, color: T.faint, marginTop: 2 }}>
            Dr. David Bienenfeld, <i>Psychodynamic Theory for Clinicians</i>
            {readerPage != null ? ` · p. ${readerPage}` : ""}
          </div>
        </div>
      </div>

      {showQuote && loc.quote ? (
        <blockquote
          style={{
            margin: "12px 0 0",
            padding: "8px 0 8px 12px",
            borderLeft: `3px solid ${T.teal}`,
            fontSize: 13.5,
            lineHeight: 1.55,
            color: T.muted,
          }}
        >
          {loc.quote}
        </blockquote>
      ) : null}

      {src ? (
        <div
          tabIndex={0}
          className="ksPager"
          role="group"
          aria-label="Bienenfeld chapter pages — use left and right arrow keys"
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
            border: `1px solid ${T.paperEdge}`,
            boxShadow: "0 10px 28px -16px rgba(0,0,0,.28)",
            overflow: "hidden",
          }}
        >
          <div ref={wrapRef} style={{ position: "relative" }}>
            <PageShot
              src={src}
              alt={readerPage != null ? `Bienenfeld page ${readerPage}` : "Bienenfeld page"}
              theme={T}
              onZoom={(u) => zoom(u, pages.map((p) => bienenfeldPageSrc(p.image)).filter((s): s is string => !!s))}
            />
            {pages.length > 1 && !narrow && arrow(-1)}
            {pages.length > 1 && !narrow && arrow(1)}
          </div>
          <div
            style={{
              padding: "6px 9px 7px",
              background: T.card,
              borderTop: `1px solid ${T.paperEdge}`,
              userSelect: "none",
            }}
          >
            {pages.length > 1 && pages.length <= 18 ? (
              <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap" }}>
                {pages.map((p, i) => {
                  const isCur = i === cur;
                  const isAnchor = i === anchor;
                  return (
                    <span
                      key={p.tag || p.image || i}
                      onClick={() => setCur(i)}
                      title={`Page ${pageLabel(p)}`}
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
                          background: isCur ? T.teal : isAnchor ? T.tealDeep : T.paperEdge,
                          outline: isCur ? `2px solid ${T.tealSoft}` : "none",
                        }}
                      />
                    </span>
                  );
                })}
              </div>
            ) : null}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {pages.length > 1 && narrow && arrow(-1)}
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  textAlign: "center",
                  fontSize: 11.5,
                  lineHeight: 1.3,
                  color: T.muted,
                }}
              >
                {pages.length
                  ? `${cur + 1} of ${pages.length} in this chapter${page ? ` · p. ${pageLabel(page)}` : ""}`
                  : readerPage != null
                    ? `Printed page ${readerPage}`
                    : "Source page"}
              </div>
              {pages.length > 1 && narrow && arrow(1)}
            </div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 14,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <a
          href={chapterHref}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 650,
            color: T.tealDeep,
            textUnderlineOffset: 2,
          }}
        >
          <ExternalLink size={14} strokeWidth={2.2} />
          Read this chapter in the book
        </a>
        <a
          href={readerHref}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 13, color: T.muted, textUnderlineOffset: 2 }}
        >
          Open the full reader
        </a>
      </div>
    </div>
  );
}
