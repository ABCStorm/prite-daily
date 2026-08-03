import React, { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw, X } from "lucide-react";

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;
const STEP = 0.25;

/** Full-screen image lightbox: page fills most of the viewport, with +/- zoom. */
export function ZoomLightbox({
  src,
  alt = "Enlarged",
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, +v.toFixed(2)));

  const zoomBy = useCallback((delta: number) => {
    setScale((s) => {
      const next = clampScale(s + delta);
      if (next <= 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Escape closes; +/- keys zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomBy(STEP); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomBy(-STEP); }
      else if (e.key === "0") { e.preventDefault(); reset(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, zoomBy, reset]);

  // Wheel zooms toward cursor area (keeps offset when already panned).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? STEP : -STEP);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  const pct = Math.round(scale * 100);
  const canZoomOut = scale > MIN_SCALE;
  const canZoomIn = scale < MAX_SCALE;

  const btnStyle: React.CSSProperties = {
    display: "grid",
    placeItems: "center",
    width: 40,
    height: 40,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(22,26,36,.88)",
    color: "#eef0f5",
    cursor: "pointer",
    boxShadow: "0 8px 24px -10px rgba(0,0,0,.55)",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(8,10,16,.92)",
        display: "flex",
        flexDirection: "column",
        animation: "scrimIn .18s ease both",
      }}
      onClick={onClose}
    >
      {/* Top bar: zoom controls + close */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "14px 18px",
          position: "relative",
          zIndex: 2,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          style={{ ...btnStyle, opacity: canZoomOut ? 1 : 0.35 }}
          disabled={!canZoomOut}
          onClick={() => zoomBy(-STEP)}
          title="Zoom out (−)"
          aria-label="Zoom out"
        >
          <Minus size={18} strokeWidth={2.4} />
        </button>
        <span
          style={{
            minWidth: 52,
            textAlign: "center",
            fontSize: 13.5,
            fontWeight: 600,
            color: "#d7dbe4",
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            userSelect: "none",
          }}
          title="Current zoom"
        >
          {pct}%
        </span>
        <button
          type="button"
          style={{ ...btnStyle, opacity: canZoomIn ? 1 : 0.35 }}
          disabled={!canZoomIn}
          onClick={() => zoomBy(STEP)}
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          <Plus size={18} strokeWidth={2.4} />
        </button>
        <button
          type="button"
          style={{ ...btnStyle, opacity: scale === 1 && offset.x === 0 && offset.y === 0 ? 0.35 : 1 }}
          disabled={scale === 1 && offset.x === 0 && offset.y === 0}
          onClick={reset}
          title="Reset zoom (0)"
          aria-label="Reset zoom"
        >
          <RotateCcw size={16} strokeWidth={2.3} />
        </button>
        <button
          type="button"
          style={{ ...btnStyle, position: "absolute", right: 16, top: 14 }}
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close"
        >
          <X size={18} strokeWidth={2.4} />
        </button>
      </div>

      {/* Stage: image fills most of the screen; drag when zoomed */}
      <div
        ref={stageRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          padding: "0 12px 18px",
          cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-out",
          touchAction: "none",
        }}
        onClick={(e) => {
          // Click empty stage to close only when not zoomed / not dragging.
          if (scale <= 1 && e.target === e.currentTarget) onClose();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onClick={(e) => {
            e.stopPropagation();
            // Single click on image when at fit-zoom closes (same as before).
            if (scale <= 1) onClose();
          }}
          style={{
            display: "block",
            maxWidth: "96vw",
            maxHeight: "calc(100dvh - 88px)",
            width: "auto",
            height: "auto",
            objectFit: "contain",
            borderRadius: 10,
            background: "#fff",
            boxShadow: "0 28px 80px -28px rgba(0,0,0,.75)",
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: "center center",
            transition: dragging ? "none" : "transform .12s ease-out",
            userSelect: "none",
            pointerEvents: "auto",
            cursor: scale > 1 ? "inherit" : "zoom-out",
          }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 12,
          color: "rgba(231,234,240,.55)",
          pointerEvents: "none",
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
      >
        Scroll or + / − to zoom{scale > 1 ? " · drag to pan" : ""} · Esc to close
      </div>
    </div>
  );
}
