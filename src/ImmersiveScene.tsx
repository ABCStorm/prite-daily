// Immersive feature transitions: fly the camera INTO a clay-diorama room when a
// feature opens, settle that room as a dimmed/blurred backdrop behind the
// feature's UI ("you are here"), and pull the camera back out when it closes.
//
// Pure overlay + backdrop — it wraps a feature without touching the feature's
// own logic. Assets live in /public/immersive (arena = polls, observatory =
// flashcards): <key>-in.mp4 (fly-in), <key>-out.mp4 (pull-out, a reversed
// fly-in), <key>-bg.webp (the settled interior frame).
//
// Guardrails: honors prefers-reduced-motion (skips straight to the settled
// room), tap-to-skip the fly-in, muted + playsInline (+ a stall timeout so a
// blocked autoplay never traps the user), and lazy — nothing loads until the
// feature is opened.

import { useEffect, useRef, useState, type ReactNode } from "react";

export type SceneKey = "arena" | "observatory" | "desk" | "summit";
const BASE = "/immersive";

const prefersReduced = () => {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

export function ImmersiveScene({
  sceneKey,
  closing,
  onExited,
  showBackdrop = true,
  backdropZ = 89,
  children,
}: {
  sceneKey: SceneKey;
  closing: boolean;          // parent flips this true to request the pull-out
  onExited: () => void;      // called once the pull-out finishes (parent then unmounts)
  showBackdrop?: boolean;    // keep the settled room behind the UI (off for the projected poll host)
  backdropZ?: number;        // sit just below the wrapped feature's z-index
  children: ReactNode;
}) {
  const reduce = prefersReduced();
  const [phase, setPhase] = useState<"enter" | "in" | "exit">(reduce ? "in" : "enter");
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const exitedRef = useRef(false);

  const finish = () => { if (exitedRef.current) return; exitedRef.current = true; onExited(); };
  const settle = () => setPhase((p) => (p === "enter" ? "in" : p));

  // Fly-in on mount.
  useEffect(() => {
    if (reduce) return;
    const v = vidRef.current;
    if (!v) { settle(); return; }
    v.src = `${BASE}/${sceneKey}-in.mp4`;
    try { v.currentTime = 0; } catch { /* not seekable yet */ }
    const done = () => settle();
    v.addEventListener("ended", done, { once: true });
    const stall = window.setTimeout(done, 2400); // autoplay blocked / slow decode → don't trap the user
    const p = v.play();
    if (p && p.catch) p.catch(done);
    return () => { window.clearTimeout(stall); v.removeEventListener("ended", done); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause the fly-in once we've settled (it's faded out; no need to keep decoding).
  useEffect(() => { if (phase === "in") { try { vidRef.current?.pause(); } catch { /* no-op */ } } }, [phase]);

  // Pull-out when the parent requests close.
  useEffect(() => {
    if (!closing) return;
    if (reduce) { finish(); return; }
    setPhase("exit");
    const v = vidRef.current;
    if (!v) { finish(); return; }
    v.src = `${BASE}/${sceneKey}-out.mp4`;
    try { v.currentTime = 0; } catch { /* no-op */ }
    const done = () => finish();
    v.addEventListener("ended", done, { once: true });
    const stall = window.setTimeout(done, 2400);
    const p = v.play();
    if (p && p.catch) p.catch(done);
    return () => { window.clearTimeout(stall); v.removeEventListener("ended", done); };
  }, [closing]); // eslint-disable-line react-hooks/exhaustive-deps

  const overlayVisible = !reduce && (phase === "enter" || phase === "exit");
  const settled = phase === "in";

  return (
    <>
      {showBackdrop && (
        <div
          aria-hidden
          style={{
            position: "fixed", inset: 0, zIndex: backdropZ, overflow: "hidden",
            opacity: settled ? 1 : 0, transition: "opacity .55s ease", pointerEvents: "none",
          }}
        >
          <div
            className="imm-drift"
            style={{
              position: "absolute", inset: "-5%",
              backgroundImage: `url(${BASE}/${sceneKey}-bg.webp)`,
              backgroundSize: "cover", backgroundPosition: "center",
              filter: "blur(9px) brightness(.42) saturate(1.05)", transform: "scale(1.06)",
            }}
          />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 80% at 50% 30%, rgba(13,15,22,.12), rgba(13,15,22,.72))" }} />
        </div>
      )}

      {children}

      {!reduce && (
        <video
          ref={vidRef}
          muted
          playsInline
          preload="auto"
          aria-hidden
          onClick={settle}
          style={{
            position: "fixed", inset: 0, width: "100%", height: "100%", objectFit: "cover",
            zIndex: 200, background: "#0d0f16",
            opacity: overlayVisible ? 1 : 0,
            transition: overlayVisible ? "none" : "opacity .5s ease",
            pointerEvents: overlayVisible ? "auto" : "none",
            cursor: phase === "enter" ? "pointer" : "default",
          }}
        />
      )}

      <style>{`@keyframes immDrift{from{transform:scale(1.045) translate(-1%,-.5%)}to{transform:scale(1.11) translate(1.5%,1%)}} .imm-drift{animation:immDrift 26s ease-in-out infinite alternate}`}</style>
    </>
  );
}

/**
 * One-shot fly-in / pull-out flash for a persistent view (no wrapping, no
 * backdrop) — e.g. entering/leaving exam "focus" mode. Bump `token` (and set
 * `dir`) to play; it plays the clip full-screen then fades away. Skipped under
 * prefers-reduced-motion. Tap to dismiss early.
 */
export function ImmersiveFlash({ sceneKey, dir, token }: { sceneKey: SceneKey; dir: "in" | "out"; token: number }) {
  const reduce = prefersReduced();
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (token <= 0 || reduce) return;
    const v = vidRef.current;
    if (!v) return;
    setVisible(true);
    v.src = `${BASE}/${sceneKey}-${dir}.mp4`;
    try { v.currentTime = 0; } catch { /* no-op */ }
    const done = () => setVisible(false);
    v.addEventListener("ended", done, { once: true });
    const stall = window.setTimeout(done, 2400);
    const p = v.play();
    if (p && p.catch) p.catch(done);
    return () => { window.clearTimeout(stall); v.removeEventListener("ended", done); };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (reduce) return null;
  return (
    <video
      ref={vidRef}
      muted
      playsInline
      aria-hidden
      onClick={() => setVisible(false)}
      style={{
        position: "fixed", inset: 0, width: "100%", height: "100%", objectFit: "cover",
        zIndex: 200, background: "#0d0f16",
        opacity: visible ? 1 : 0,
        transition: visible ? "none" : "opacity .5s ease",
        pointerEvents: visible ? "auto" : "none",
        cursor: visible ? "pointer" : "default",
      }}
    />
  );
}
