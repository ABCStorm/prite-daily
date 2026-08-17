import React, { useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { CARLAT_BOOK_BUY_URL, carlatPageSrc, carlatReaderHref, type CarlatLoc } from "./carlatRefs";

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

export function CarlatPanel({
  loc,
  theme: T,
  onZoom,
}: {
  loc: CarlatLoc;
  theme: Theme;
  onZoom: (u: string, gallery?: string[]) => void;
}) {
  const images = [...(loc.page_images || []), ...(loc.cited_images || []).filter((p) => !(loc.page_images || []).includes(p))];
  const [idx, setIdx] = useState(0);
  const cur = images[Math.max(0, Math.min(idx, images.length - 1))];
  const printed = loc.printed_pages?.[0];
  const label = printed != null ? `p. ${printed}` : "fact sheet";

  if (!cur) {
    return (
      <div style={{ color: T.muted, fontSize: 14 }}>
        No book page is attached to this item.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <BookOpen size={15} strokeWidth={2.1} color={T.teal} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 650 }}>{loc.medication_title}</div>
          <div style={{ color: T.muted, fontSize: 13 }}>
            {loc.category} · Carlat Medication Fact Book, 8th ed. · {label}
            {images.length > 1 ? ` · ${idx + 1} of ${images.length}` : ""}
          </div>
        </div>
        {images.length > 1 && (
          <span style={{ display: "inline-flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx <= 0}
              style={{ opacity: idx <= 0 ? 0.4 : 1 }}
              aria-label="Previous page"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setIdx((i) => Math.min(images.length - 1, i + 1))}
              disabled={idx >= images.length - 1}
              style={{ opacity: idx >= images.length - 1 ? 0.4 : 1 }}
              aria-label="Next page"
            >
              <ChevronRight size={18} />
            </button>
          </span>
        )}
        <a
          href={carlatReaderHref(loc.medication_id)}
          target="_blank"
          rel="noreferrer"
          style={{ color: T.teal, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          Full reader <ExternalLink size={12} />
        </a>
        <a
          href={CARLAT_BOOK_BUY_URL}
          target="_blank"
          rel="noreferrer"
          style={{ color: T.muted, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          Buy the book <ExternalLink size={12} />
        </a>
      </div>
      <div style={{ border: `1px solid ${T.paperEdge}`, borderRadius: 10, overflow: "hidden" }}>
        <PageShot
          src={carlatPageSrc(cur)}
          alt={`${loc.medication_title} ${label}`}
          theme={T}
          onZoom={(u) => onZoom(u, images.map(carlatPageSrc))}
        />
      </div>
    </div>
  );
}
