/**
 * Grid of AnKing/AnkiHub or Sketchy images for a question.
 * Loads via authenticated blob URLs (private R2).
 */
import { useEffect, useState } from "react";
import { resourceImage, prefetchResourceImage } from "./resourceImages";

type Kind = "anking" | "sketchy";

function AuthImg({
  kind,
  name,
  alt,
  onZoom,
}: {
  kind: Kind;
  name: string;
  alt: string;
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
      <div
        style={{
          width: "100%",
          minHeight: 120,
          borderRadius: 10,
          background: "rgba(127,127,127,0.08)",
        }}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onClick={onZoom ? () => onZoom(src) : undefined}
      style={{
        display: "block",
        width: "100%",
        maxHeight: 420,
        objectFit: "contain",
        borderRadius: 10,
        background: "#fff",
        border: "1px solid #ece5d8",
        cursor: onZoom ? "zoom-in" : "default",
      }}
    />
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
    // Prefetch the next couple so scrolling the grid feels instant
    for (const name of images.slice(0, 3)) prefetchResourceImage(kind, name);
  }, [kind, images]);

  if (!images.length) return null;

  const title = kind === "anking" ? "AnKing / AnkiHub" : "Sketchy";
  const blurb =
    kind === "anking"
      ? "Diagrams from matched AnKing Extra / First Aid fields (community Step deck)."
      : "Sketchy panels from matched AnKing Sketchy fields.";

  return (
    <div>
      <p style={{ margin: "0 0 10px", color: theme.muted, fontSize: 13, lineHeight: 1.5 }}>
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
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 12,
        }}
      >
        {images.map((name, i) => (
          <AuthImg
            key={`${kind}-${name}-${i}`}
            kind={kind}
            name={name}
            alt={`${title} figure ${i + 1}`}
            onZoom={onZoom}
          />
        ))}
      </div>
      <p style={{ margin: "12px 0 0", color: theme.faint, fontSize: 11.5, lineHeight: 1.45 }}>
        Educational use for approved PRITE Daily members only. Images remain property of their
        respective copyright holders (AnKing/AnkiHub community assets, Sketchy, etc.).
      </p>
    </div>
  );
}
