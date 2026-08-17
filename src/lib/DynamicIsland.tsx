/**
 * iOS-style island — beui.dev/components/blocks/dynamic-island
 *
 * The shell springs to the natural size of the active slot. Compact pill when
 * `view` is null; DynamicIslandView children expand it.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type IslandContextValue = { view: string | null };
const IslandContext = createContext<IslandContextValue | null>(null);

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const SHELL_SPRING = { type: "spring" as const, duration: 0.8, bounce: 0.2 };
const CONTENT_SPRING = { type: "spring" as const, duration: 0.8, bounce: 0.35 };
const RADIUS = 32;
const PILL_WIDTH = 126;
const PILL_HEIGHT = 37;

function useContentSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setSize({ width: el.offsetWidth, height: el.offsetHeight });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setSize({ width: el.offsetWidth, height: el.offsetHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

function Slot({
  keyId,
  children,
  style,
}: {
  keyId: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={keyId}
      initial={
        reduce
          ? { opacity: 0, filter: "blur(0px)" }
          : { opacity: 0, scale: 0.9, y: -8, filter: "blur(5px)" }
      }
      animate={
        reduce
          ? { opacity: 1, filter: "blur(0px)" }
          : { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }
      }
      exit={
        reduce
          ? { opacity: 0, filter: "blur(0px)", transition: { duration: 0.1 } }
          : {
              opacity: 0,
              scale: 0.9,
              y: -6,
              filter: "blur(0px)",
              transition: { duration: 0.08, ease: EASE_OUT },
            }
      }
      transition={reduce ? { duration: 0.15 } : CONTENT_SPRING}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transformOrigin: "top center",
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}

export function DynamicIsland({
  view,
  compact,
  children,
  className,
  style,
}: {
  view: string | null;
  compact?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const reduce = useReducedMotion();
  const expanded = view !== null;
  const [sizerRef, size] = useContentSize();
  const contextValue = useMemo(() => ({ view }), [view]);

  return (
    <IslandContext.Provider value={contextValue}>
      <motion.div
        role="status"
        aria-live="polite"
        initial={false}
        animate={
          size
            ? { width: size.width, height: size.height }
            : { width: PILL_WIDTH, height: PILL_HEIGHT }
        }
        transition={reduce ? { duration: 0 } : SHELL_SPRING}
        className={className}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "flex-start",
          justifyContent: "center",
          overflow: "hidden",
          borderRadius: RADIUS,
          background: "#111318",
          color: "#f4f1ea",
          boxShadow: "0 18px 40px -18px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.06)",
          ...style,
        }}
      >
        <div ref={sizerRef} style={{ width: "max-content" }}>
          <AnimatePresence mode="popLayout" initial={false}>
            {!expanded && compact ? (
              <Slot
                keyId="compact"
                style={{ minHeight: 37, minWidth: 126, gap: 8, padding: "6px 16px", fontSize: 12, fontWeight: 650 }}
              >
                {compact}
              </Slot>
            ) : null}
          </AnimatePresence>
          {children}
        </div>
      </motion.div>
    </IslandContext.Provider>
  );
}

export function DynamicIslandView({
  id,
  children,
  style,
}: {
  id: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const ctx = useContext(IslandContext);
  if (!ctx) throw new Error("DynamicIslandView must be used inside <DynamicIsland>");
  const active = ctx.view === id;

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {active ? (
        <Slot keyId={id} style={{ padding: "16px 22px", ...style }}>
          {children}
        </Slot>
      ) : null}
    </AnimatePresence>
  );
}
