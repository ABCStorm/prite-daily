import React, { useState } from "react";
import { ExternalLink } from "lucide-react";
import { CARLAT_BOOK_BUY_URL, carlatPageSrc, type CarlatLoc } from "./carlatRefs";

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
  const pages = loc.printed_pages || [];
  const gallery = images.map(carlatPageSrc);

  if (!images.length) {
    return (
      <div style={{ color: T.muted, fontSize: 14 }}>
        No book page is attached to this item.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 650 }}>{loc.medication_title}</div>
          <div style={{ color: T.muted, fontSize: 13 }}>
            {loc.category} · Carlat Medication Fact Book, 8th ed.
            {pages.length ? ` · p. ${pages.join("–")}` : ""}
          </div>
        </div>
        <a
          href={CARLAT_BOOK_BUY_URL}
          target="_blank"
          rel="noreferrer"
          style={{ color: T.muted, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          Buy the book <ExternalLink size={12} />
        </a>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {images.map((src, i) => (
          <div key={src} style={{ border: `1px solid ${T.paperEdge}`, borderRadius: 10, overflow: "hidden" }}>
            <PageShot
              src={carlatPageSrc(src)}
              alt={`${loc.medication_title}${pages[i] != null ? ` p. ${pages[i]}` : ""}`}
              theme={T}
              onZoom={(u) => onZoom(u, gallery)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
