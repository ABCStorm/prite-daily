/**
 * Grid of AnKing/AnkiHub or Sketchy images for a question.
 * Loads via authenticated blob URLs (private R2).
 * Each figure sits in a Uiverse-style 3D tilt frame (CyberTiltCard).
 */
import { useEffect, useState } from "react";
import { resourceImage, prefetchResourceImage } from "./resourceImages";
import { CyberTiltCard, cyberTiltStyles } from "./CyberTiltCard";

type Kind = "anking" | "sketchy";

function AuthImg({
  kind,
  name,
  alt,
  wide,
  onZoom,
}: {
  kind: Kind;
  name: string;
  alt: string;
  wide?: boolean;
  onZoom?: (src: string) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setErr(false);
    resourceImage(kind, name)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setErr(true);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, name]);

  if (err) {
    return (
      <div
        style={{
          fontSize: 12,
          color: "#9aa0ab",
          padding: 12,
          border: "1px dashed #ece5d8",
          borderRadius: 8,
        }}
      >
        Couldn’t load {name}
      </div>
    );
  }

  if (!src) {
    return (
      <CyberTiltCard wide={wide}>
        <div
          style={{
            width: "100%",
            minHeight: wide ? 220 : 260,
            background: "rgba(127,127,127,0.1)",
          }}
        />
      </CyberTiltCard>
    );
  }

  return (
    <CyberTiltCard wide={wide} onActivate={onZoom ? () => onZoom(src) : undefined}>
      <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} />
    </CyberTiltCard>
  );
}

export type AnkingMatchMeta = {
  score?: number;
  text_preview?: string;
  entities?: string[];
  source_deck?: string;
  ankihub_id?: string | null;
};

export function ResourceImagePanel({
  kind,
  images,
  match,
  theme,
  onZoom,
}: {
  kind: Kind;
  images: string[];
  match?: AnkingMatchMeta | null;
  theme: { text: string; muted: string; faint: string; teal: string; paperEdge: string };
  onZoom?: (src: string) => void;
}) {
  useEffect(() => {
    for (const name of images.slice(0, 3)) prefetchResourceImage(kind, name);
  }, [kind, images]);

  if (!images.length) return null;

  const title = kind === "anking" ? "AnKing / AnkiHub" : "Sketchy";
  const blurb =
    kind === "anking"
      ? "Diagrams from matched AnKing Extra / First Aid fields (community Step deck)."
      : "Sketchy panels from matched AnKing Sketchy fields.";

  // AnKing / First Aid pages need width for readable text — one wide column.
  // Sketchy can share a multi-column grid of medium tiles.
  const wide = kind === "anking";

  return (
    <div>
      <style>{cyberTiltStyles}</style>
      <p style={{ margin: "0 0 12px", color: theme.muted, fontSize: 13, lineHeight: 1.5 }}>
        {blurb}
        {match?.text_preview ? (
          <>
            {" "}
            Matched card: <em style={{ color: theme.text }}>{match.text_preview}</em>
            {match.entities?.length ? (
              <span style={{ color: theme.faint }}> · {match.entities.slice(0, 4).join(", ")}</span>
            ) : null}
          </>
        ) : null}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: wide
            ? "1fr"
            : "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
          // Let AnKing use nearly the full learning-panel width
          width: "100%",
          maxWidth: wide ? "100%" : undefined,
        }}
      >
        {images.map((name, i) => (
          <AuthImg
            key={`${kind}-${name}-${i}`}
            kind={kind}
            name={name}
            alt={`${title} figure ${i + 1}`}
            wide={wide}
            onZoom={onZoom}
          />
        ))}
      </div>
      <p style={{ margin: "14px 0 0", color: theme.faint, fontSize: 11.5, lineHeight: 1.45 }}>
        Educational use for approved PRITE Daily members only. Images remain property of their
        respective copyright holders (AnKing/AnkiHub community assets, Sketchy, etc.).
        {" "}Click an image to enlarge.
      </p>
    </div>
  );
}
