/**
 * Document-folder card animation inspired by the Framer "Document Folder"
 * component (https://framer.com/m/Document-card-U9IiCH.js@ac6MOJH3eBldgCoGRS1D).
 *
 * Interaction: rest → hover tilt → click pulls the page out → click flips to
 * the back (full “why this paper” text + links).
 */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, FileText } from "lucide-react";

export type DocumentFolderProps = {
  title: string;
  subtitle?: string;
  badges?: string[];
  body?: string;
  links?: { label: string; href: string }[];
  href: string;
  folderLabel?: string;
  /** Folder face color (manila tan). */
  accent?: string;
  /** Folder back / tab (slightly deeper brown). */
  accentDeep?: string;
  /** Ink color on the folder face. */
  ink?: string;
  width?: number | string;
};

type Phase = "closed" | "open" | "flipped";

const spring = { type: "spring" as const, stiffness: 260, damping: 22 };
const springSoft = { type: "spring" as const, stiffness: 180, damping: 20 };

/** Classic manila / kraft folder palette with light variation. */
export const MANILA_PALETTES = [
  { accent: "#E2C392", accentDeep: "#C9A06A", ink: "#3D2914" }, // classic manila
  { accent: "#DDBB88", accentDeep: "#B8925C", ink: "#3A2612" }, // slightly richer
  { accent: "#E8D0A4", accentDeep: "#CDB07A", ink: "#3F2C16" }, // lighter cream
  { accent: "#D4AE78", accentDeep: "#B08950", ink: "#352210" }, // toasted
  { accent: "#E6C99A", accentDeep: "#C4A06C", ink: "#3C2813" }, // warm
  { accent: "#D8B68A", accentDeep: "#B89660", ink: "#3A2511" }, // sand
] as const;

export function manilaForKey(key: string): (typeof MANILA_PALETTES)[number] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return MANILA_PALETTES[h % MANILA_PALETTES.length];
}

export function DocumentFolderCard({
  title,
  subtitle,
  badges = [],
  body,
  links = [],
  href,
  folderLabel = "RESEARCH",
  accent = MANILA_PALETTES[0].accent,
  accentDeep = MANILA_PALETTES[0].accentDeep,
  ink = MANILA_PALETTES[0].ink,
  width = "100%",
}: DocumentFolderProps) {
  const [phase, setPhase] = useState<Phase>("closed");
  const [hovered, setHovered] = useState(false);

  const open = phase === "open" || phase === "flipped";
  const flipped = phase === "flipped";

  const onFolderClick = () => {
    if (phase === "closed") setPhase("open");
    else if (phase === "open") setPhase("flipped");
    else setPhase("closed");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onFolderClick();
    }
    if (e.key === "Escape") setPhase("closed");
  };

  // When flipped, grow the shell so the full "why" sentence can scroll/read.
  const shellMinH = flipped ? 360 : open ? 300 : 260;

  return (
    <div
      style={{
        width,
        maxWidth: 360,
        margin: "0 auto",
        paddingTop: flipped ? 12 : open ? 28 : 8,
        paddingBottom: 8,
        transition: "padding 280ms ease",
      }}
    >
      <motion.div
        role="button"
        tabIndex={0}
        aria-label={`${folderLabel}: ${title}. ${
          phase === "closed"
            ? "Activate to open the document"
            : phase === "open"
              ? "Activate to flip for details"
              : "Activate to close"
        }`}
        aria-expanded={open}
        onClick={onFolderClick}
        onKeyDown={onKeyDown}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        animate={{ minHeight: shellMinH }}
        transition={springSoft}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: flipped ? undefined : "318 / 300",
          minHeight: shellMinH,
          height: flipped ? shellMinH : undefined,
          cursor: "pointer",
          outline: "none",
          perspective: 1200,
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        whileTap={{ scale: 0.985 }}
      >
        {/* Folder back */}
        <motion.div
          aria-hidden
          style={{
            position: "absolute",
            inset: "6% 4% 4% 4%",
            borderRadius: 18,
            background: `linear-gradient(165deg, ${accentDeep} 0%, ${shade(accentDeep, -12)} 100%)`,
            boxShadow: "0 14px 28px rgba(61, 41, 20, 0.22)",
            transformStyle: "preserve-3d",
            // kraft texture hint
            backgroundImage: `
              linear-gradient(165deg, ${accentDeep} 0%, ${shade(accentDeep, -10)} 100%),
              repeating-linear-gradient(
                -12deg,
                transparent,
                transparent 2px,
                rgba(255,255,255,0.03) 2px,
                rgba(255,255,255,0.03) 3px
              )
            `,
          }}
        />

        {/* Folder tab */}
        <motion.div
          aria-hidden
          style={{
            position: "absolute",
            top: "2%",
            left: "10%",
            width: "40%",
            height: "12%",
            borderRadius: "12px 12px 0 0",
            background: `linear-gradient(180deg, ${shade(accentDeep, 8)} 0%, ${accentDeep} 100%)`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)",
            zIndex: 0,
          }}
        />

        {/* Document page */}
        <motion.div
          style={{
            position: "absolute",
            left: flipped ? "5%" : "10%",
            right: flipped ? "5%" : "10%",
            top: flipped ? "4%" : "14%",
            bottom: flipped ? "6%" : "18%",
            borderRadius: 14,
            transformStyle: "preserve-3d",
            zIndex: open ? 3 : 1,
            transformOrigin: "50% 90%",
          }}
          animate={{
            y: open ? (flipped ? 0 : -36) : hovered ? -10 : 4,
            x: open ? (flipped ? 0 : 8) : hovered ? 6 : 0,
            rotate: open ? (flipped ? 0 : 5) : hovered ? 6 : 0,
            rotateY: flipped ? 180 : 0,
            boxShadow: open
              ? "0 -1px 1px rgba(61,41,20,0.12), 0 -4px 8px rgba(61,41,20,0.12), 0 -14px 28px rgba(61,41,20,0.16)"
              : hovered
                ? "0 6px 16px rgba(61,41,20,0.14)"
                : "0 2px 6px rgba(61,41,20,0.1)",
          }}
          transition={flipped ? springSoft : spring}
        >
          {/* Front */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 14,
              background: "linear-gradient(180deg, #FFFEFA 0%, #F7F1E6 100%)",
              border: "1px solid rgba(61, 41, 20, 0.1)",
              padding: "16px 16px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: ink,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.1,
                textTransform: "uppercase",
                opacity: 0.75,
              }}
            >
              <FileText size={13} strokeWidth={2.2} />
              Research article
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 650,
                color: ink,
                lineHeight: 1.35,
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div
                style={{
                  fontSize: 11.5,
                  color: `${ink}99`,
                  lineHeight: 1.4,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {subtitle}
              </div>
            )}
            {badges.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: "auto" }}>
                {badges.slice(0, 3).map((b) => (
                  <span
                    key={b}
                    style={{
                      fontSize: 10,
                      fontWeight: 650,
                      color: ink,
                      background: "rgba(61, 41, 20, 0.08)",
                      borderRadius: 999,
                      padding: "2px 7px",
                    }}
                  >
                    {b}
                  </span>
                ))}
              </div>
            )}
            <div
              style={{
                fontSize: 10,
                color: `${ink}66`,
                marginTop: badges.length ? 4 : "auto",
              }}
            >
              {phase === "closed"
                ? hovered
                  ? "Click to open"
                  : "Hover · click to open"
                : "Click to flip for why it matters"}
            </div>
          </div>

          {/* Back — full readable “why” text */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 14,
              background: "linear-gradient(180deg, #FFFEFA 0%, #F7F1E6 100%)",
              border: "1px solid rgba(61, 41, 20, 0.1)",
              padding: "14px 14px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              overflow: "hidden",
              // Allow selecting / scrolling the why text
              userSelect: "text",
              WebkitUserSelect: "text",
            }}
            onClick={(e) => {
              // Clicks on the back surface still close on empty chrome;
              // scrolling/selecting text shouldn't fight the parent.
              if ((e.target as HTMLElement).closest("a, [data-scroll]")) {
                e.stopPropagation();
              }
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.1,
                textTransform: "uppercase",
                color: ink,
                opacity: 0.7,
                flex: "0 0 auto",
              }}
            >
              Why this paper
            </div>
            <div
              data-scroll
              onWheel={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                fontSize: 13.5,
                color: ink,
                lineHeight: 1.5,
                flex: "1 1 auto",
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                WebkitOverflowScrolling: "touch",
                paddingRight: 4,
                // Soft fade hint at bottom when content is long
                maskImage:
                  "linear-gradient(to bottom, #000 0%, #000 calc(100% - 12px), transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, #000 0%, #000 calc(100% - 12px), transparent 100%)",
              }}
            >
              {body ||
                "Open the full article for the abstract and details. A clinical summary for this item is still being written."}
            </div>
            {(links.length > 0 || href) && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  flex: "0 0 auto",
                  paddingTop: 2,
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {(links.length ? links : [{ label: "Open article", href }]).map((l) => (
                  <a
                    key={l.label + l.href}
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 11.5,
                      fontWeight: 650,
                      color: ink,
                      textDecoration: "none",
                      background: "rgba(61, 41, 20, 0.08)",
                      borderRadius: 999,
                      padding: "5px 10px",
                    }}
                  >
                    {l.label}
                    <ExternalLink size={11} strokeWidth={2.2} />
                  </a>
                ))}
              </div>
            )}
            <div
              style={{ fontSize: 10, color: `${ink}66`, flex: "0 0 auto" }}
              onClick={(e) => {
                e.stopPropagation();
                setPhase("closed");
              }}
            >
              Tap here to close
            </div>
          </div>
        </motion.div>

        {/* Folder front cover — tucks down when open/flipped so the page can be read */}
        <motion.div
          aria-hidden
          style={{
            position: "absolute",
            left: "4%",
            right: "4%",
            bottom: "4%",
            borderRadius: 18,
            background: `
              linear-gradient(165deg, ${shade(accent, 10)} 0%, ${accent} 45%, ${shade(accent, -8)} 100%)
            `,
            zIndex: 2,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(61,41,20,0.08)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: "16px 18px 18px",
            color: ink,
            pointerEvents: "none",
            // subtle fiber
            backgroundImage: `
              linear-gradient(165deg, ${shade(accent, 12)} 0%, ${accent} 50%, ${shade(accent, -10)} 100%),
              repeating-linear-gradient(
                18deg,
                transparent,
                transparent 3px,
                rgba(61,41,20,0.025) 3px,
                rgba(61,41,20,0.025) 4px
              )
            `,
          }}
          animate={{
            height: flipped ? "18%" : open ? "42%" : "62%",
            y: open ? 6 : 0,
            opacity: flipped ? 0.92 : 1,
          }}
          transition={spring}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.4,
              textTransform: "uppercase",
              opacity: 0.7,
            }}
          >
            {folderLabel}
          </div>
          {!flipped && (
            <>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 650,
                  lineHeight: 1.25,
                  marginTop: 4,
                  display: "-webkit-box",
                  WebkitLineClamp: open ? 1 : 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {title}
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
                {open ? "Document open" : "Peer-reviewed · MEDLINE"}
              </div>
            </>
          )}
        </motion.div>

        <AnimatePresence>
          {!open && (
            <motion.div
              aria-hidden
              initial={{ opacity: 0, scale: 0.85, rotate: -8 }}
              animate={{ opacity: 1, scale: 1, rotate: -6 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25 }}
              style={{
                position: "absolute",
                right: "8%",
                top: "22%",
                zIndex: 4,
                background: "rgba(255, 250, 240, 0.96)",
                color: ink,
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                padding: "6px 8px",
                borderRadius: 6,
                boxShadow: "0 4px 10px rgba(61,41,20,0.16)",
                transform: "rotate(-6deg)",
                pointerEvents: "none",
                border: "1px solid rgba(61,41,20,0.1)",
              }}
            >
              Open me
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/** Darken/lighten a hex color by approx delta (-100..100). */
function shade(hex: string, delta: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  const to = (s: string) => clamp(parseInt(s, 16) + Math.round(delta * 1.4));
  const r = to(m[1]);
  const g = to(m[2]);
  const b = to(m[3]);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
