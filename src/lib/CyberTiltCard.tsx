/**
 * 3D hover-tilt frame adapted from Uiverse.io (00Kubi "cyber card").
 * The media fills the hoverable shell edge-to-edge (thin frame only).
 */
import React from "react";

const TRACKERS = Array.from({ length: 25 }, (_, i) => i + 1);

type Props = {
  children: React.ReactNode;
  /** Prefer a wide layout (First Aid / landscape AnKing pages). */
  wide?: boolean;
  className?: string;
  onActivate?: () => void;
};

export function CyberTiltCard({
  children,
  wide = false,
  className,
  onActivate,
}: Props) {
  return (
    <div
      className={`rtilt-container noselect${wide ? " rtilt-wide" : ""}${className ? ` ${className}` : ""}`}
      onClick={onActivate}
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : undefined}
      onKeyDown={
        onActivate
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onActivate();
              }
            }
          : undefined
      }
    >
      {/* Image-sized card first so the shell matches media dimensions */}
      <div className="rtilt-card">
        <div className="rtilt-media">{children}</div>
        <div className="rtilt-card-glare" aria-hidden />
        <div className="rtilt-cyber-lines" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="rtilt-glowing-elements" aria-hidden>
          <div className="rtilt-glow-1" />
          <div className="rtilt-glow-2" />
          <div className="rtilt-glow-3" />
        </div>
        <div className="rtilt-card-particles" aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="rtilt-corner-elements" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="rtilt-scan-line" aria-hidden />
      </div>
      {/* Hover grid sits on top of the card and drives the tilt */}
      <div className="rtilt-canvas" aria-hidden>
        {TRACKERS.map((n) => (
          <div key={n} className={`rtilt-tracker rtilt-tr-${n}`} />
        ))}
      </div>
    </div>
  );
}

/** Injected once — class-scoped rewrite of the Uiverse cyber-card CSS. */
export const cyberTiltStyles = `
.rtilt-container {
  position: relative;
  width: 100%;
  transition: transform 200ms ease;
  perspective: 900px;
  /* Room so 3D tilt isn't clipped by neighbors */
  padding: 4px;
  box-sizing: border-box;
}
.rtilt-container:active {
  transform: scale(0.99);
}
.rtilt-card {
  position: relative;
  z-index: 0;
  width: 100%;
  border-radius: 16px;
  transition: 300ms transform ease, 300ms filter ease, 300ms box-shadow ease;
  background: linear-gradient(45deg, #141416, #1e1e24);
  border: 2px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  box-shadow:
    0 0 18px rgba(0, 0, 0, 0.28),
    inset 0 0 16px rgba(0, 0, 0, 0.18);
  transform-style: preserve-3d;
}
/* Media fills the hoverable card almost completely */
.rtilt-media {
  position: relative;
  z-index: 5;
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  line-height: 0;
  background: #fff;
}
.rtilt-media img {
  display: block !important;
  width: 100% !important;
  height: auto !important;
  max-height: none !important;
  object-fit: contain !important;
  border: none !important;
  border-radius: 0 !important;
  background: #fff !important;
  cursor: inherit !important;
  vertical-align: top;
}

.rtilt-glowing-elements {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.rtilt-glow-1,
.rtilt-glow-2,
.rtilt-glow-3 {
  position: absolute;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: radial-gradient(
    circle at center,
    rgba(0, 255, 170, 0.28) 0%,
    rgba(0, 255, 170, 0) 70%
  );
  filter: blur(15px);
  opacity: 0;
  transition: opacity 0.3s ease;
}
.rtilt-glow-1 { top: -20px; left: -20px; }
.rtilt-glow-2 { top: 50%; right: -30px; transform: translateY(-50%); }
.rtilt-glow-3 { bottom: -20px; left: 30%; }

.rtilt-card-particles span {
  position: absolute;
  width: 3px;
  height: 3px;
  background: #00ffaa;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 15;
  pointer-events: none;
}

/* Canvas overlays the card for pointer tracking */
.rtilt-canvas {
  perspective: 800px;
  inset: 4px;
  z-index: 200;
  position: absolute;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
  grid-template-rows: 1fr 1fr 1fr 1fr 1fr;
  border-radius: 16px;
  overflow: hidden;
}
.rtilt-tracker {
  position: relative;
  z-index: 200;
  width: 100%;
  height: 100%;
  cursor: zoom-in;
}

.rtilt-container:hover .rtilt-card,
.rtilt-tracker:hover ~ .rtilt-card {
  /* sibling selectors need trackers before card; we use container:hover fallback */
}
.rtilt-container:hover .rtilt-card {
  filter: brightness(1.06);
  box-shadow:
    0 8px 28px rgba(0, 0, 0, 0.35),
    inset 0 0 16px rgba(0, 0, 0, 0.18);
}
.rtilt-container:hover .rtilt-glowing-elements div { opacity: 1; }
.rtilt-container:hover .rtilt-card-particles span {
  animation: rtiltParticleFloat 2s infinite;
}
.rtilt-container:hover .rtilt-card-glare { opacity: 1; }
.rtilt-container:hover .rtilt-corner-elements span {
  border-color: rgba(92, 103, 255, 0.85);
  box-shadow: 0 0 10px rgba(92, 103, 255, 0.45);
}
.rtilt-container:hover .rtilt-card::before { opacity: 1; }

@keyframes rtiltParticleFloat {
  0% { transform: translate(0, 0); opacity: 0; }
  50% { opacity: 1; }
  100% {
    transform: translate(calc(var(--x, 0) * 30px), calc(var(--y, 0) * 30px));
    opacity: 0;
  }
}
.rtilt-card-particles span:nth-child(1) { --x: 1; --y: -1; top: 40%; left: 20%; }
.rtilt-card-particles span:nth-child(2) { --x: -1; --y: -1; top: 60%; right: 20%; }
.rtilt-card-particles span:nth-child(3) { --x: 0.5; --y: 1; top: 20%; left: 40%; }
.rtilt-card-particles span:nth-child(4) { --x: -0.5; --y: 1; top: 80%; right: 40%; }
.rtilt-card-particles span:nth-child(5) { --x: 1; --y: 0.5; top: 30%; left: 60%; }
.rtilt-card-particles span:nth-child(6) { --x: -1; --y: 0.5; top: 70%; right: 60%; }

.rtilt-card::before {
  content: "";
  background: radial-gradient(
    circle at center,
    rgba(0, 255, 170, 0.1) 0%,
    rgba(0, 162, 255, 0.05) 50%,
    transparent 100%
  );
  filter: blur(20px);
  opacity: 0;
  width: 150%;
  height: 150%;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  transition: opacity 0.3s ease;
  z-index: 1;
  pointer-events: none;
}

/* Tilt zones — apply to .rtilt-card via :has() so structure can put canvas on top */
.rtilt-container:has(.rtilt-tr-1:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(16deg) rotateY(-9deg); }
.rtilt-container:has(.rtilt-tr-2:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(16deg) rotateY(-4.5deg); }
.rtilt-container:has(.rtilt-tr-3:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(16deg) rotateY(0deg); }
.rtilt-container:has(.rtilt-tr-4:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(16deg) rotateY(4.5deg); }
.rtilt-container:has(.rtilt-tr-5:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(16deg) rotateY(9deg); }
.rtilt-container:has(.rtilt-tr-6:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(8deg) rotateY(-9deg); }
.rtilt-container:has(.rtilt-tr-7:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(8deg) rotateY(-4.5deg); }
.rtilt-container:has(.rtilt-tr-8:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(8deg) rotateY(0deg); }
.rtilt-container:has(.rtilt-tr-9:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(8deg) rotateY(4.5deg); }
.rtilt-container:has(.rtilt-tr-10:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(8deg) rotateY(9deg); }
.rtilt-container:has(.rtilt-tr-11:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(0deg) rotateY(-9deg); }
.rtilt-container:has(.rtilt-tr-12:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(0deg) rotateY(-4.5deg); }
.rtilt-container:has(.rtilt-tr-13:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(0deg) rotateY(0deg); }
.rtilt-container:has(.rtilt-tr-14:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(0deg) rotateY(4.5deg); }
.rtilt-container:has(.rtilt-tr-15:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(0deg) rotateY(9deg); }
.rtilt-container:has(.rtilt-tr-16:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(-8deg) rotateY(-9deg); }
.rtilt-container:has(.rtilt-tr-17:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(-8deg) rotateY(-4.5deg); }
.rtilt-container:has(.rtilt-tr-18:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(-8deg) rotateY(0deg); }
.rtilt-container:has(.rtilt-tr-19:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(-8deg) rotateY(4.5deg); }
.rtilt-container:has(.rtilt-tr-20:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(-8deg) rotateY(9deg); }
.rtilt-container:has(.rtilt-tr-21:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(-16deg) rotateY(-9deg); }
.rtilt-container:has(.rtilt-tr-22:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(-16deg) rotateY(-4.5deg); }
.rtilt-container:has(.rtilt-tr-23:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(-16deg) rotateY(0deg); }
.rtilt-container:has(.rtilt-tr-24:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(-16deg) rotateY(4.5deg); }
.rtilt-container:has(.rtilt-tr-25:hover) .rtilt-card { transition: 125ms ease-in-out; transform: rotateX(-16deg) rotateY(9deg); }

.rtilt-tr-1 { grid-area: 1 / 1; } .rtilt-tr-2 { grid-area: 1 / 2; } .rtilt-tr-3 { grid-area: 1 / 3; }
.rtilt-tr-4 { grid-area: 1 / 4; } .rtilt-tr-5 { grid-area: 1 / 5; }
.rtilt-tr-6 { grid-area: 2 / 1; } .rtilt-tr-7 { grid-area: 2 / 2; } .rtilt-tr-8 { grid-area: 2 / 3; }
.rtilt-tr-9 { grid-area: 2 / 4; } .rtilt-tr-10 { grid-area: 2 / 5; }
.rtilt-tr-11 { grid-area: 3 / 1; } .rtilt-tr-12 { grid-area: 3 / 2; } .rtilt-tr-13 { grid-area: 3 / 3; }
.rtilt-tr-14 { grid-area: 3 / 4; } .rtilt-tr-15 { grid-area: 3 / 5; }
.rtilt-tr-16 { grid-area: 4 / 1; } .rtilt-tr-17 { grid-area: 4 / 2; } .rtilt-tr-18 { grid-area: 4 / 3; }
.rtilt-tr-19 { grid-area: 4 / 4; } .rtilt-tr-20 { grid-area: 4 / 5; }
.rtilt-tr-21 { grid-area: 5 / 1; } .rtilt-tr-22 { grid-area: 5 / 2; } .rtilt-tr-23 { grid-area: 5 / 3; }
.rtilt-tr-24 { grid-area: 5 / 4; } .rtilt-tr-25 { grid-area: 5 / 5; }

.rtilt-container.noselect {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
.rtilt-card-glare {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    125deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.04) 45%,
    rgba(255, 255, 255, 0.1) 50%,
    rgba(255, 255, 255, 0.04) 55%,
    rgba(255, 255, 255, 0) 100%
  );
  opacity: 0;
  transition: opacity 300ms;
  z-index: 12;
  pointer-events: none;
}
.rtilt-cyber-lines span {
  position: absolute;
  background: linear-gradient(90deg, transparent, rgba(92, 103, 255, 0.22), transparent);
  z-index: 8;
  pointer-events: none;
}
.rtilt-cyber-lines span:nth-child(1) {
  top: 20%; left: 0; width: 100%; height: 1px;
  transform: scaleX(0); transform-origin: left;
  animation: rtiltLineGrow 3s linear infinite;
}
.rtilt-cyber-lines span:nth-child(2) {
  top: 40%; right: 0; width: 100%; height: 1px;
  transform: scaleX(0); transform-origin: right;
  animation: rtiltLineGrow 3s linear infinite 1s;
}
.rtilt-cyber-lines span:nth-child(3) {
  top: 60%; left: 0; width: 100%; height: 1px;
  transform: scaleX(0); transform-origin: left;
  animation: rtiltLineGrow 3s linear infinite 2s;
}
.rtilt-cyber-lines span:nth-child(4) {
  top: 80%; right: 0; width: 100%; height: 1px;
  transform: scaleX(0); transform-origin: right;
  animation: rtiltLineGrow 3s linear infinite 1.5s;
}
.rtilt-corner-elements span {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(92, 103, 255, 0.35);
  transition: all 0.3s ease;
  z-index: 14;
  pointer-events: none;
}
.rtilt-corner-elements span:nth-child(1) { top: 8px; left: 8px; border-right: 0; border-bottom: 0; }
.rtilt-corner-elements span:nth-child(2) { top: 8px; right: 8px; border-left: 0; border-bottom: 0; }
.rtilt-corner-elements span:nth-child(3) { bottom: 8px; left: 8px; border-right: 0; border-top: 0; }
.rtilt-corner-elements span:nth-child(4) { bottom: 8px; right: 8px; border-left: 0; border-top: 0; }
.rtilt-scan-line {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, transparent, rgba(92, 103, 255, 0.1), transparent);
  transform: translateY(-100%);
  animation: rtiltScanMove 2.4s linear infinite;
  z-index: 9;
  pointer-events: none;
}
@keyframes rtiltLineGrow {
  0% { transform: scaleX(0); opacity: 0; }
  50% { transform: scaleX(1); opacity: 1; }
  100% { transform: scaleX(0); opacity: 0; }
}
@keyframes rtiltScanMove {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(100%); }
}

/* Wide AnKing / First Aid: full panel width, image-driven height */
.rtilt-wide {
  max-width: 100%;
}
.rtilt-wide .rtilt-media img {
  width: 100% !important;
  max-width: 100% !important;
}
`;
