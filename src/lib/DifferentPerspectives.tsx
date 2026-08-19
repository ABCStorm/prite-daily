import React, { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { DynPearl } from "./dynPerspectives";
import type { OwlStat } from "./owlStats";
import type { TherapyPearl } from "./therapyPerspectives";
import { ProjectFolder } from "./ProjectFolder";
import { perspectivesForQuestion, type PerspectiveCard } from "./perspectives";

type Frame = "idle" | "blink";

/** Chairs without an illustrated mascot yet get a lettered badge instead. */
function MascotBadge({ card, height }: { card: PerspectiveCard; height: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height,
        width: height,
        borderRadius: "50%",
        background: card.palette.accentSoft,
        color: card.palette.accent,
        fontWeight: 800,
        fontSize: Math.max(11, height * 0.34),
        letterSpacing: "0.02em",
      }}
    >
      {card.palette.mark}
    </span>
  );
}

function MascotSprite({
  card,
  height,
}: {
  card: PerspectiveCard;
  height: number;
}) {
  const [frame, setFrame] = useState<Frame>("idle");

  useEffect(() => {
    if (!card.mascot) return;
    let cancelled = false;
    let blinkTimer = 0;
    const schedule = () => {
      blinkTimer = window.setTimeout(() => {
        if (cancelled) return;
        setFrame("blink");
        window.setTimeout(() => {
          if (!cancelled) setFrame("idle");
          if (!cancelled) schedule();
        }, 140);
      }, 2800 + Math.random() * 3400);
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(blinkTimer);
    };
  }, [card.id, card.mascot]);

  if (!card.mascot) return <MascotBadge card={card} height={height} />;

  const src = frame === "blink" ? card.mascot.blink : card.mascot.idle;
  return (
    <img
      src={src}
      alt=""
      height={height}
      draggable={false}
      style={{ display: "block", height, width: "auto", userSelect: "none", pointerEvents: "none" }}
    />
  );
}

function PreviewSheet({ card }: { card: PerspectiveCard }) {
  const teaser = card.body.replace(/\s+/g, " ").trim();
  return (
    <span
      style={{
        position: "relative",
        display: "block",
        height: "100%",
        width: "100%",
        background: card.palette.paper,
        color: card.palette.ink,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 10,
          top: 10,
          height: 6,
          width: 28,
          borderRadius: 999,
          background: card.palette.accent,
          opacity: 0.35,
        }}
      />
      <span
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          top: 24,
          fontSize: 8,
          fontWeight: 750,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: card.palette.accent,
        }}
      >
        {card.school}
      </span>
      <span
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          top: 38,
          fontSize: 9.5,
          lineHeight: 1.35,
          color: card.palette.ink,
          opacity: 0.72,
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {teaser}
      </span>
      <span style={{ position: "absolute", left: "50%", bottom: 6, transform: "translateX(-50%)" }}>
        <MascotSprite card={card} height={58} />
      </span>
      <span
        style={{
          position: "absolute",
          right: 8,
          bottom: 8,
          fontSize: 12,
          fontWeight: 650,
          color: `${card.palette.accent}99`,
        }}
      >
        {card.palette.mark}
      </span>
    </span>
  );
}

function ReadingSheet({ card }: { card: PerspectiveCard }) {
  return (
    <article
      className="perspectivesReading"
      style={{
        alignItems: "start",
        background: card.palette.paper,
        border: `1px solid ${card.palette.paperEdge}`,
        borderRadius: 16,
        padding: "18px 20px 16px",
        boxShadow: "0 18px 40px -28px rgba(27,30,43,.45)",
      }}
    >
      <div style={{ display: "grid", justifyItems: "center", gap: 8, paddingTop: 4 }}>
        <MascotSprite card={card} height={86} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 750,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: card.palette.accent,
            textAlign: "center",
          }}
        >
          {card.school}
        </span>
      </div>
      <div>
        <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: card.palette.ink, letterSpacing: "-0.015em" }}>
          {card.title}
        </h3>
        <p
          style={{
            margin: 0,
            fontFamily: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
            fontSize: 16,
            lineHeight: 1.55,
            color: card.palette.ink,
          }}
        >
          {card.body}
        </p>
        {card.source && (
          <a
            href={card.source.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginTop: 12,
              color: "#0b5d52",
              fontSize: 12.5,
              fontWeight: 650,
              textDecoration: "none",
              borderBottom: "1px solid rgba(11,93,82,.25)",
            }}
          >
            Source{card.source.year ? ` · ${card.source.year}` : ""}: {card.source.label}
            <ExternalLink size={11} strokeWidth={2.3} />
          </a>
        )}
      </div>
    </article>
  );
}

export function DifferentPerspectives({
  qid,
  dyn,
  owl,
  therapy,
}: {
  qid: string;
  dyn?: DynPearl;
  owl?: OwlStat;
  therapy?: TherapyPearl;
}) {
  const cards = perspectivesForQuestion(qid, { dyn, owl, therapy });
  if (!cards.length) return null;
  const present = cards.map((c) => c.school.toLowerCase());
  const presentLine = present.length === 1
    ? `${present[0][0].toUpperCase()}${present[0].slice(1)} is here now.`
    : `${present.slice(0, -1).join(", ")} and ${present[present.length - 1]} chairs are here now.`;

  return (
    <div className="fade perspectivesStage">
      <style>{STAGE_CSS}</style>
      <p style={{ margin: "0 0 4px", fontSize: 13.5, lineHeight: 1.5, color: "#6c7280", maxWidth: 560 }}>
        Each file is one theoretical chair on this same case. Hover the folder to fan them; click to read.
      </p>
      <div className="perspectivesFolderWrap">
        <ProjectFolder
          key={qid}
          title="Different perspectives"
          description="Same case, other chairs"
          itemLabel="perspective"
          count={cards.length}
          previews={cards.map((card) => ({
            id: card.id,
            label: card.title,
            content: <PreviewSheet card={card} />,
            expanded: <ReadingSheet card={card} />,
          }))}
        />
      </div>
      {cards.length < 4 && (
        <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "#9aa0ab", textAlign: "center" }}>
          {presentLine} More psychotherapy lenses will land in this folder.
        </p>
      )}
    </div>
  );
}

const STAGE_CSS = `
.perspectivesFolderWrap { display: flex; justify-content: center; padding: 88px 8px 10px; }
.perspectivesReading { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: 18px; }
@media (max-width: 640px) {
  .perspectivesFolderWrap { padding: 72px 0 8px; transform: scale(0.92); transform-origin: top center; }
  .perspectivesReading { grid-template-columns: 1fr; justify-items: center; text-align: left; }
}
@media (prefers-reduced-motion: reduce) {
  .perspectivesFolderWrap { transform: none; }
}
`;
