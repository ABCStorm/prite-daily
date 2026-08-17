/**
 * iOS-style picker wheel — beui.dev/components/motion/wheel-picker
 *
 * 3D drum on momentum scroll that snaps to a notch. No Tailwind: this app
 * paints with inline styles.
 */
import React, {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useReducedMotion } from "framer-motion";
import { capturePointer, createTickPlayer, releasePointer } from "./tickSound";

export type WheelPickerOption = string | { label: string; value: string };

export type WheelPickerProps = {
  options: WheelPickerOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  visibleCount?: number;
  itemHeight?: number;
  disabled?: boolean;
  sound?: boolean;
  style?: CSSProperties;
  "aria-label"?: string;
};

const DEG = Math.PI / 180;
const DECELERATION = 0.00042;
const MAX_VELOCITY = 0.18;
const VELOCITY_WINDOW = 90;
const WHEEL_SENS = 0.012;
const WHEEL_SETTLE = 110;
const BACK = 1.35;
const easeOutCubic = (p: number) => 1 - (1 - p) ** 3;
const easeOutBack = (p: number) => 1 + (BACK + 1) * (p - 1) ** 3 + BACK * (p - 1) ** 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

function optionValue(option: WheelPickerOption) {
  return typeof option === "string" ? option : option.value;
}
function optionLabel(option: WheelPickerOption) {
  return typeof option === "string" ? option : option.label;
}

const MASK: CSSProperties = {
  WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)",
  maskImage: "linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)",
};

export function WheelPicker({
  options,
  value,
  defaultValue,
  onValueChange,
  visibleCount = 5,
  itemHeight = 36,
  disabled = false,
  sound = false,
  style,
  "aria-label": ariaLabel,
}: WheelPickerProps) {
  const reduce = useReducedMotion() ?? false;
  const controlled = value !== undefined;
  const last = Math.max(0, options.length - 1);

  const indexOf = useCallback((v: string | undefined) => {
    const i = options.findIndex((o) => optionValue(o) === v);
    return i < 0 ? 0 : i;
  }, [options]);

  const [internal, setInternal] = useState(() => defaultValue ?? value);
  const currentValue = controlled ? value : internal;
  const [grabbing, setGrabbing] = useState(false);

  const { itemAngle, radius, height, hideBeyond } = useMemo(() => {
    const rowsEachSide = Math.max(1, Math.floor(visibleCount / 2));
    const cutoff = rowsEachSide + 1;
    const angle = 90 / cutoff;
    const r = itemHeight / Math.tan(angle * DEG);
    return {
      itemAngle: angle,
      radius: r,
      hideBeyond: cutoff,
      height: Math.round(2 * r * Math.sin(rowsEachSide * angle * DEG) + itemHeight),
    };
  }, [visibleCount, itemHeight]);

  const container = useRef<HTMLDivElement>(null);
  const drumRef = useRef<HTMLUListElement>(null);
  const bandRef = useRef<HTMLUListElement>(null);
  const scroll = useRef(indexOf(currentValue));
  const raf = useRef(0);
  const emitted = useRef(currentValue);
  const tickPlayer = useRef<ReturnType<typeof createTickPlayer> | null>(null);
  const lastTick = useRef(indexOf(currentValue));

  const paint = useCallback((s: number) => {
    const apply = (list: HTMLUListElement | null) => {
      if (!list) return;
      list.style.transform = `translateZ(${-radius}px) rotateX(${itemAngle * s}deg)`;
      for (const node of Array.from(list.children)) {
        const li = node as HTMLLIElement;
        const i = Number(li.dataset.index);
        const want = Math.abs(i - s) > hideBeyond ? "hidden" : "visible";
        if (li.style.visibility !== want) li.style.visibility = want;
      }
    };
    apply(drumRef.current);
    apply(bandRef.current);
  }, [radius, itemAngle, hideBeyond]);

  const getPlayer = useCallback(() => {
    if (!tickPlayer.current) tickPlayer.current = createTickPlayer();
    return tickPlayer.current;
  }, []);

  const emit = useCallback((i: number) => {
    if (!options.length) return;
    const v = optionValue(options[clamp(i, 0, last)]);
    if (v === emitted.current) return;
    emitted.current = v;
    if (sound && reduce) getPlayer().play();
    if (!controlled) setInternal(v);
    onValueChange?.(v);
  }, [options, last, controlled, onValueChange, sound, reduce, getPlayer]);

  const maybeTick = useCallback((pos: number) => {
    const row = clamp(Math.round(pos), 0, last);
    if (!sound || reduce) {
      lastTick.current = row;
      return;
    }
    if (row === lastTick.current) return;
    lastTick.current = row;
    getPlayer().play();
  }, [sound, reduce, last, getPlayer]);

  const stop = useCallback(() => cancelAnimationFrame(raf.current), []);

  const glide = useCallback((
    to: number,
    duration: number,
    ease: (p: number) => number = easeOutCubic,
  ) => {
    stop();
    const from = scroll.current;
    const dist = to - from;
    if (!dist || duration <= 0) {
      scroll.current = to;
      paint(to);
      maybeTick(to);
      emit(to);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = (now - start) / duration;
      if (p >= 1) {
        scroll.current = to;
        paint(to);
        maybeTick(to);
        emit(to);
        return;
      }
      scroll.current = from + dist * ease(p);
      paint(scroll.current);
      maybeTick(scroll.current);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  }, [stop, paint, emit, maybeTick]);

  const fling = useCallback((velocity: number) => {
    const from = scroll.current;
    if (from < 0 || from > last) {
      glide(clamp(Math.round(from), 0, last), 260);
      return;
    }
    const dir = Math.sign(velocity);
    const coast = ((velocity * velocity) / (2 * DECELERATION)) * dir;
    const to = clamp(Math.round(from + coast), 0, last);
    const duration = clamp(Math.sqrt(Math.abs(to - from)) * 300 + 240, 280, 1700);
    glide(to, duration, easeOutBack);
  }, [glide, last]);

  const step = useCallback((by: number) => {
    glide(clamp(Math.round(scroll.current) + by, 0, last), 300, easeOutBack);
  }, [glide, last]);

  const drag = useRef<{ y: number; scroll: number; pts: [number, number][] } | null>(null);
  const dragFrame = useRef(0);
  const latestY = useRef(0);

  const beginDrag = useCallback((y: number) => {
    stop();
    if (sound) getPlayer().prepare();
    setGrabbing(true);
    drag.current = { y, scroll: scroll.current, pts: [[y, performance.now()]] };
  }, [stop, sound, getPlayer]);

  const moveDrag = useCallback((y: number) => {
    const d = drag.current;
    if (!d) return;
    latestY.current = y;
    d.pts.push([y, performance.now()]);
    if (d.pts.length > 8) d.pts.shift();
    if (dragFrame.current) return;
    dragFrame.current = requestAnimationFrame(() => {
      dragFrame.current = 0;
      const dd = drag.current;
      if (!dd) return;
      let next = dd.scroll + (dd.y - latestY.current) / itemHeight;
      if (next < 0) next *= 0.3;
      else if (next > last) next = last + (next - last) * 0.3;
      scroll.current = next;
      paint(next);
      maybeTick(next);
      emit(Math.round(clamp(next, 0, last)));
    });
  }, [itemHeight, last, paint, emit, maybeTick]);

  const endDrag = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    if (dragFrame.current) {
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = 0;
    }
    drag.current = null;
    setGrabbing(false);
    const pts = d.pts;
    let v = 0;
    if (pts.length > 1) {
      const latest = pts[pts.length - 1];
      let ref = pts[0];
      for (const p of pts) {
        if (latest[1] - p[1] <= VELOCITY_WINDOW) {
          ref = p;
          break;
        }
      }
      const dt = latest[1] - ref[1];
      if (dt > 0) {
        const raw = (ref[0] - latest[0]) / itemHeight / dt;
        v = clamp(raw, -MAX_VELOCITY, MAX_VELOCITY);
      }
    }
    fling(v);
  }, [itemHeight, fling]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (disabled || reduce || event.pointerType === "touch") return;
    beginDrag(event.clientY);
    capturePointer(event.currentTarget, event.pointerId);
  }, [disabled, reduce, beginDrag]);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    moveDrag(event.clientY);
  }, [moveDrag]);

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    releasePointer(event.currentTarget, event.pointerId);
    endDrag();
  }, [endDrag]);

  const wheelSnap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWheel = useCallback((event: WheelEvent) => {
    if (disabled || reduce) return;
    event.preventDefault();
    if (sound) getPlayer().prepare();
    stop();
    const px = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    const next = clamp(scroll.current + px * WHEEL_SENS, 0, last);
    scroll.current = next;
    paint(next);
    maybeTick(next);
    emit(Math.round(next));
    if (wheelSnap.current) clearTimeout(wheelSnap.current);
    wheelSnap.current = setTimeout(() => {
      glide(clamp(Math.round(scroll.current), 0, last), 240, easeOutBack);
    }, WHEEL_SETTLE);
  }, [disabled, reduce, sound, last, paint, emit, stop, glide, maybeTick, getPlayer]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const at = Math.round(scroll.current);
    const map: Record<string, number> = {
      ArrowUp: -1,
      ArrowDown: 1,
      Home: -at,
      End: last - at,
    };
    if (event.key in map) {
      event.preventDefault();
      if (sound) getPlayer().prepare();
      step(map[event.key]);
    }
  }, [disabled, sound, last, step, getPlayer]);

  useEffect(() => {
    if (drag.current) return;
    const target = indexOf(currentValue);
    emitted.current = currentValue;
    if (Math.abs(Math.round(scroll.current) - target) < 0.001) {
      paint(scroll.current);
      return;
    }
    glide(target, 260);
  }, [currentValue, indexOf, paint, glide]);

  useEffect(() => () => {
    cancelAnimationFrame(raf.current);
    cancelAnimationFrame(dragFrame.current);
    if (wheelSnap.current) clearTimeout(wheelSnap.current);
    tickPlayer.current?.dispose();
  }, []);

  useEffect(() => {
    const el = container.current;
    if (!el || reduce || disabled) return;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) beginDrag(t.clientY);
    };
    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || !drag.current) return;
      e.preventDefault();
      moveDrag(t.clientY);
    };
    const onEnd = () => endDrag();
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("wheel", onWheel);
    };
  }, [reduce, disabled, beginDrag, moveDrag, endDrag, onWheel]);

  const shell: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    borderRadius: 16,
    height,
    userSelect: "none",
    WebkitUserSelect: "none",
    WebkitTouchCallout: "none",
    outline: "none",
    opacity: disabled ? 0.5 : 1,
    pointerEvents: disabled ? "none" : "auto",
    ...MASK,
    ...style,
  };

  const rowStyle = (i: number): CSSProperties => ({
    position: "absolute",
    left: 0,
    right: 0,
    top: -itemHeight / 2,
    height: itemHeight,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: 14,
    transform: `rotateX(${-itemAngle * i}deg) translateZ(${radius}px)`,
  });

  if (reduce) {
    const pad = (height - itemHeight) / 2;
    return (
      <div style={{ ...shell, background: "transparent" }}>
        <div
          aria-hidden
          style={{
            pointerEvents: "none",
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            transform: "translateY(-50%)",
            height: itemHeight,
            borderTop: "1px solid rgba(35,38,47,.08)",
            borderBottom: "1px solid rgba(35,38,47,.08)",
            background: "rgba(35,38,47,.04)",
            zIndex: 1,
          }}
        />
        <ul
          style={{
            height: "100%",
            overflowY: "auto",
            scrollSnapType: "y mandatory",
            paddingTop: pad,
            paddingBottom: pad,
            margin: 0,
            listStyle: "none",
            scrollbarWidth: "none",
          }}
        >
          {options.map((option) => {
            const v = optionValue(option);
            const on = v === currentValue;
            return (
              <li key={v} style={{ scrollSnapAlign: "center" }}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => emit(options.indexOf(option))}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    justifyContent: "center",
                    height: itemHeight,
                    border: 0,
                    background: "transparent",
                    fontWeight: 600,
                    fontSize: 14,
                    color: on ? "#23262f" : "#9aa0ab",
                    cursor: "pointer",
                  }}
                >
                  {optionLabel(option)}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div
      ref={container}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        ...shell,
        touchAction: "none",
        cursor: grabbing ? "grabbing" : "grab",
        perspective: 1000,
      }}
    >
      <ul
        ref={drumRef}
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          margin: 0,
          height: 0,
          listStyle: "none",
          padding: 0,
          backfaceVisibility: "hidden",
          transformStyle: "preserve-3d",
          willChange: "transform",
        }}
      >
        {options.map((option, i) => (
          <li key={optionValue(option)} data-index={i} style={{ ...rowStyle(i), color: "#9aa0ab" }}>
            {optionLabel(option)}
          </li>
        ))}
      </ul>
      <div
        style={{
          pointerEvents: "none",
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          transform: "translateY(-50%)",
          overflow: "hidden",
          borderRadius: 8,
          background: "rgba(14,122,107,.08)",
          height: itemHeight,
          perspective: 1000,
          zIndex: 2,
        }}
      >
        <ul
          ref={bandRef}
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            margin: 0,
            height: 0,
            listStyle: "none",
            padding: 0,
            backfaceVisibility: "hidden",
            transformStyle: "preserve-3d",
            willChange: "transform",
          }}
        >
          {options.map((option, i) => (
            <li key={optionValue(option)} data-index={i} style={{ ...rowStyle(i), color: "#0b5d52" }}>
              {optionLabel(option)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
