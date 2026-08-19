/**
 * "In practice" scenario media: photoreal still and optional short video.
 *
 * Media lives in the PUBLIC `inpractice-illustrations` R2 bucket, served through
 * workers/inpractice-images:
 *   still  /i/<year>-<qindex>.webp
 *   video  /v/<year>-<qindex>.mp4
 *
 * Public on purpose: AI-generated from our own clinical_application text (no
 * PRITE stems, answers, or third-party copyright). Plain <img>/<video src>.
 *
 * Videos autoplay muted + looped. Sound stays off until the resident taps the
 * speaker control — autoplay-with-audio is blocked by browsers and also
 * annoying in a study hall.
 *
 * Loop seam: a short Gaussian-ish opacity fade (and matching volume dip when
 * unmuted) softens the restart so the hard cut is not noticeable.
 */
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, Maximize2 } from "lucide-react";
import { hasScenarioVideo } from "./scenarioVideos";

const BASE =
  (import.meta as any).env?.VITE_ILLUSTRATION_BASE ||
  "https://inpractice-images.correllsoftware.workers.dev";

/**
 * Cache-bust query: objects are served with max-age=1y immutable, so when a
 * subset is replaced in place, bump this so browsers re-fetch.
 */
const ILLUSTRATION_CACHE_VER = "g2p-mem4";
const VIDEO_CACHE_VER = "v3";

/** Half-width of the loop fade window at each end of the clip (seconds). */
const LOOP_FADE_SEC = 0.55;

/**
 * Opacity near the loop seam. `d` is seconds from the nearest end (0 or duration).
 * At the seam (d=0) → 0; by d≈LOOP_FADE_SEC → ~1, with a Gaussian rise so the
 * fade eases rather than ramping linearly.
 */
function loopSeamOpacity(currentTime: number, duration: number): number {
  if (!duration || !Number.isFinite(duration) || duration <= 0) return 1;
  // Cap fade window so short clips still have a visible middle.
  const fade = Math.min(LOOP_FADE_SEC, duration * 0.22);
  if (fade <= 0) return 1;
  const d = Math.min(currentTime, duration - currentTime);
  if (d >= fade) return 1;
  const x = Math.max(0, d / fade); // 0 at seam → 1 at full opacity
  // 1 - e^(-4.5 x²) is 0 at x=0 and ≈0.99 at x=1 (soft Gaussian envelope).
  return 1 - Math.exp(-4.5 * x * x);
}

/** Key format: 4-digit year, 4-digit zero-padded q_index.
    Child (CPRITE) items use cYYYY so they never collide with PRITE YYYY. */
export function illustrationKey(year?: string, qIndex?: number): string | null {
  if (!year || qIndex == null || !Number.isFinite(qIndex)) return null;
  const child = /^cprite\s+(\d{4})$/i.exec(String(year).trim());
  const prefix = child ? `c${child[1]}` : year;
  return `${prefix}-${String(qIndex).padStart(4, "0")}`;
}

export function illustrationUrl(year?: string, qIndex?: number): string | null {
  const key = illustrationKey(year, qIndex);
  if (!key) return null;
  return `${BASE}/i/${key}.webp?v=${ILLUSTRATION_CACHE_VER}`;
}

export function scenarioVideoUrl(year?: string, qIndex?: number): string | null {
  const key = illustrationKey(year, qIndex);
  if (!key) return null;
  if (!hasScenarioVideo(year, qIndex)) return null;
  return `${BASE}/v/${key}.mp4?v=${VIDEO_CACHE_VER}`;
}

export function ScenarioIllustration({
  year,
  qIndex,
  alt,
  onZoom,
  maxWidth = 420,
}: {
  year?: string;
  qIndex?: number;
  alt?: string;
  onZoom?: (src: string) => void;
  maxWidth?: number;
}) {
  const videoSrc = scenarioVideoUrl(year, qIndex);
  const imgSrc = illustrationUrl(year, qIndex);
  const [imgFailed, setImgFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [loopOpacity, setLoopOpacity] = useState(1);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // Keep the DOM muted flag in sync (some browsers ignore the prop on resume).
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  // Drive Gaussian loop-seam fade from rAF so it stays smooth even when
  // timeupdate is sparse near the ends of short clips.
  useEffect(() => {
    if (!videoSrc || videoFailed) return;
    const tick = () => {
      const v = videoRef.current;
      if (v && v.duration && Number.isFinite(v.duration)) {
        const op = loopSeamOpacity(v.currentTime, v.duration);
        setLoopOpacity(op);
        // Dip volume with the same envelope when sound is on so the loop
        // restart is soft audibly as well as visually.
        if (!mutedRef.current) {
          v.volume = Math.max(0, Math.min(1, op));
        } else {
          v.volume = 1; // irrelevant while muted, but keep a sane default
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [videoSrc, videoFailed]);

  // Prefer video when we have one; fall back to still on error or missing.
  if (videoSrc && !videoFailed) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth,
          margin: "0 0 14px",
          borderRadius: 12,
          overflow: "hidden",
          background: "rgba(127,127,127,0.08)",
          aspectRatio: "1 / 1",
        }}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          poster={imgSrc || undefined}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => setVideoFailed(true)}
          // Click toggles mute — large hit target, obvious for study mode.
          onClick={() => setMuted((m) => !m)}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            cursor: "pointer",
            opacity: loopOpacity,
            // No CSS transition: opacity is already sampled every frame from a
            // Gaussian curve; a transition would lag and look mushy at the seam.
            willChange: "opacity",
          }}
          aria-label={
            muted
              ? "Scenario video (muted). Click to unmute."
              : "Scenario video (sound on). Click to mute."
          }
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMuted((m) => !m);
          }}
          title={muted ? "Turn sound on" : "Turn sound off"}
          aria-label={muted ? "Unmute scenario video" : "Mute scenario video"}
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            border: "none",
            borderRadius: 999,
            padding: 0,
            // Lighter pill so it sits quietly in the corner until hovered.
            background: "rgba(15, 23, 32, 0.42)",
            color: "rgba(255,255,255,0.92)",
            cursor: "pointer",
            backdropFilter: "blur(5px)",
            WebkitBackdropFilter: "blur(5px)",
            opacity: 0.85,
          }}
        >
          {muted ? <VolumeX size={13} strokeWidth={2} /> : <Volume2 size={13} strokeWidth={2} />}
        </button>
        {imgSrc && onZoom && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onZoom(imgSrc);
            }}
            title="View still image"
            aria-label="View still image full size"
            style={{
              position: "absolute",
              left: 8,
              bottom: 8,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              border: "none",
              borderRadius: 999,
              background: "rgba(15, 23, 32, 0.42)",
              color: "rgba(255,255,255,0.92)",
              cursor: "pointer",
              opacity: 0.85,
            }}
          >
            <Maximize2 size={12} strokeWidth={2} />
          </button>
        )}
      </div>
    );
  }

  // Still image path (majority of the bank).
  if (!imgSrc || imgFailed) return null;

  return (
    <img
      src={imgSrc}
      alt={alt || "Illustration of the clinical scenario described here."}
      loading="lazy"
      decoding="async"
      onError={() => setImgFailed(true)}
      onClick={onZoom ? () => onZoom(imgSrc) : undefined}
      style={{
        display: "block",
        width: "100%",
        maxWidth,
        aspectRatio: "1 / 1",
        objectFit: "cover",
        borderRadius: 12,
        margin: "0 0 14px",
        cursor: onZoom ? "zoom-in" : "default",
        background: "rgba(127,127,127,0.08)",
      }}
    />
  );
}
