/**
 * Project-folder motion block — beui.dev/components/blocks/project-folder
 *
 * Hover/focus fans the files; click expands a focus-managed overlay. Overlay
 * cards stay the same covers, with the selected file's reading surface below
 * so a long formulation is actually readable.
 */
import React, {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, type Transition } from "framer-motion";
import { X } from "lucide-react";

export type ProjectFolderPreview = {
  id: string;
  label?: string;
  content: ReactNode;
  /** Full reading surface shown under the overlay covers. */
  expanded?: ReactNode;
};

export type ProjectFolderProps = {
  title: string;
  description?: string;
  previews?: ProjectFolderPreview[];
  count?: number;
  itemLabel?: string;
  ariaLabel?: string;
  className?: string;
};

const MAX_PREVIEWS = 5;
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const SPRING_LAYOUT: Transition = { type: "spring", stiffness: 360, damping: 32, mass: 0.6 };
const SPRING_PRESS: Transition = { type: "spring", stiffness: 500, damping: 30, mass: 0.6 };

const INK = "#23262f";
const MUTED = "#6c7280";
const EDGE = "rgba(35, 38, 47, 0.10)";

function useHoverCapable() {
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHover(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return canHover;
}

function getPreviewTransform(index: number, count: number) {
  const offset = index - (count - 1) / 2;
  const distance = Math.abs(offset);
  const centerLift = Math.max(0, 2 - distance) * 8;
  return {
    x: offset * 58,
    y: 6 - centerLift,
    rotate: offset * 8,
    scale: distance === 0 ? 1.06 : distance === 1 ? 0.94 : 0.86,
    opacity: distance === 0 ? 1 : distance === 1 ? 0.88 : 0.7,
    zIndex: 10 - distance,
  };
}

export function ProjectFolder({
  title,
  description = "Updated recently",
  previews = [],
  count = previews.length,
  itemLabel = "file",
  ariaLabel,
  className,
}: ProjectFolderProps) {
  const reduce = useReducedMotion();
  const canHover = useHoverCapable();
  const layoutGroupId = useId();
  const dialogTitleId = `${layoutGroupId}-title`;
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const restoringFocusRef = useRef(false);
  const folderButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [selectedId, setSelectedId] = useState(previews[0]?.id ?? "");
  const previewItems = previews.slice(0, MAX_PREVIEWS);
  const transition: Transition = reduce ? { duration: 0 } : SPRING_LAYOUT;
  const countText = `${count} ${itemLabel}${count === 1 ? "" : "s"}`;
  const fanOpen = isOpen || isExpanded;
  const selected = previewItems.find((p) => p.id === selectedId) ?? previewItems[0];

  useEffect(() => setMounted(true), []);

  const previewKey = previewItems.map((p) => p.id).join("|");
  useEffect(() => {
    const ids = previewKey ? previewKey.split("|") : [];
    if (!ids.includes(selectedId)) setSelectedId(ids[0] ?? "");
  }, [previewKey, selectedId]);

  const finishClose = useCallback(() => {
    setIsClosing(false);
    restoringFocusRef.current = true;
    requestAnimationFrame(() => folderButtonRef.current?.focus());
  }, []);

  const closeOverlay = useCallback(() => {
    setIsClosing(true);
    setIsOpen(false);
    setIsExpanded(false);
  }, []);

  useEffect(() => {
    if (reduce && isClosing) finishClose();
  }, [finishClose, isClosing, reduce]);

  useEffect(() => {
    if (!isExpanded) return;
    const previousOverflow = document.body.style.overflow;
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeOverlay();
        return;
      }
      if ((event.key === "ArrowRight" || event.key === "ArrowLeft") && previewItems.length > 1) {
        event.preventDefault();
        const ids = previewItems.map((p) => p.id);
        const i = Math.max(0, ids.indexOf(selectedId));
        const next = event.key === "ArrowRight"
          ? ids[(i + 1) % ids.length]
          : ids[(i - 1 + ids.length) % ids.length];
        setSelectedId(next);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.tabIndex >= 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeOverlay, isExpanded, previewItems, selectedId]);

  const handleFolderClick = () => {
    setIsClosing(false);
    setIsExpanded(true);
    setIsOpen(true);
  };

  const coverStyle = (z: number): CSSProperties => ({
    position: "absolute",
    left: 0,
    top: 0,
    marginLeft: -48,
    display: "block",
    width: 96,
    height: 160,
    overflow: "hidden",
    borderRadius: 10,
    border: `1px solid ${EDGE}`,
    background: "rgba(255,255,255,0.45)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    zIndex: z,
  });

  const overlay = isExpanded || isClosing ? (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={dialogTitleId}
      aria-hidden={isExpanded ? undefined : true}
      className="pdFolderOverlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        pointerEvents: isClosing ? "none" : "auto",
      }}
    >
      <AnimatePresence initial={false}>
        {isExpanded ? (
          <motion.button
            key="project-files-backdrop"
            type="button"
            tabIndex={-1}
            aria-label="Close perspectives overlay"
            onClick={closeOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.18 }}
            style={{
              position: "absolute",
              inset: 0,
              cursor: "default",
              border: 0,
              background: "rgba(250, 247, 241, 0.82)",
              backdropFilter: "blur(18px)",
              WebkitBackdropFilter: "blur(18px)",
            }}
          />
        ) : null}
      </AnimatePresence>

      <div style={{ position: "relative", zIndex: 10, width: "100%", maxWidth: 920, padding: "32px 22px 48px" }}>
        <AnimatePresence initial={false}>
          {isExpanded ? (
            <motion.div
              key="project-files-header"
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -8 }}
              transition={reduce ? { duration: 0 } : { duration: 0.18 }}
              style={{ marginBottom: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}
            >
              <div>
                <h2 id={dialogTitleId} style={{ margin: 0, fontSize: 22, fontWeight: 650, color: INK, letterSpacing: "-0.02em" }}>
                  {title}
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: 13.5, color: MUTED }}>{countText}</p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeOverlay}
                aria-label={`Close ${title}`}
                style={{
                  width: 40,
                  height: 40,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 999,
                  border: `1px solid ${EDGE}`,
                  background: "rgba(255,255,255,0.55)",
                  color: MUTED,
                  cursor: "pointer",
                  backdropFilter: "blur(16px)",
                }}
              >
                <X size={16} aria-hidden />
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${Math.min(previewItems.length, 5)}, minmax(0, 112px))`,
            justifyContent: "center",
            gap: 12,
            marginBottom: selected?.expanded ? 22 : 0,
          }}
        >
          {isExpanded
            ? previewItems.map((preview) => {
                const active = preview.id === selected?.id;
                return (
                  <motion.div
                    key={preview.id}
                    layoutId={`file-${layoutGroupId}-${preview.id}`}
                    transition={transition}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(preview.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(preview.id);
                      }
                    }}
                    aria-pressed={active}
                    aria-label={preview.label ? `Read ${preview.label}` : "Read this perspective"}
                    style={{
                      aspectRatio: "3 / 4",
                      width: "100%",
                      maxWidth: 112,
                      overflow: "hidden",
                      borderRadius: 12,
                      border: active ? "1.5px solid rgba(14,122,107,0.55)" : `1px solid ${EDGE}`,
                      background: "rgba(255,255,255,0.55)",
                      backdropFilter: "blur(16px)",
                      padding: 0,
                      cursor: "pointer",
                      boxShadow: active ? "0 10px 24px -16px rgba(14,122,107,.7)" : "none",
                    }}
                  >
                    {preview.content}
                  </motion.div>
                );
              })
            : null}
        </div>

        <AnimatePresence mode="wait">
          {isExpanded && selected?.expanded ? (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : -6 }}
              transition={reduce ? { duration: 0 } : { duration: 0.18 }}
            >
              {selected.expanded}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  ) : null;

  return (
    <LayoutGroup id={layoutGroupId}>
      <motion.button
        ref={folderButtonRef}
        type="button"
        aria-label={ariaLabel ?? `${title}. ${countText}. Hover to fan, activate to open.`}
        aria-haspopup="dialog"
        aria-expanded={isExpanded}
        data-open={fanOpen ? "true" : "false"}
        data-expanded={isExpanded ? "true" : "false"}
        tabIndex={isExpanded ? -1 : undefined}
        onPointerEnter={() => {
          if (!canHover) return;
          hoveredRef.current = true;
          setIsOpen(true);
        }}
        onPointerLeave={() => {
          if (!canHover) return;
          hoveredRef.current = false;
          if (!isExpanded && !isClosing) setIsOpen(focusedRef.current);
        }}
        onFocus={() => {
          if (restoringFocusRef.current) {
            restoringFocusRef.current = false;
            focusedRef.current = false;
            return;
          }
          focusedRef.current = true;
          setIsOpen(true);
        }}
        onBlur={() => {
          focusedRef.current = false;
          if (!isExpanded && !isClosing) setIsOpen(hoveredRef.current);
        }}
        onClick={handleFolderClick}
        whileTap={reduce ? undefined : { scale: 0.98 }}
        transition={reduce ? { duration: 0 } : SPRING_PRESS}
        className={["pdProjectFolder", className].filter(Boolean).join(" ")}
        style={{
          position: "relative",
          display: "block",
          height: 224,
          width: 288,
          maxWidth: "100%",
          userSelect: "none",
          borderRadius: 16,
          textAlign: "left",
          border: 0,
          padding: 0,
          background: "transparent",
          cursor: "pointer",
          outline: "none",
          perspective: 1200,
        }}
      >
        <motion.span
          aria-hidden
          animate={{ rotateX: fanOpen && !reduce ? 15 : 0 }}
          transition={transition}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 16,
            border: `1px solid ${EDGE}`,
            background: "rgba(255,255,255,0.28)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            transformOrigin: "center bottom",
          }}
        />

        <span aria-hidden style={{ pointerEvents: "none", position: "absolute", inset: 0 }}>
          <span style={{ position: "absolute", left: "50%", top: 0, display: "block", height: 0, width: 0 }}>
            <AnimatePresence initial={false}>
              {!isExpanded
                ? previewItems.map((preview, index) => {
                    const opened = getPreviewTransform(index, previewItems.length);
                    return (
                      <motion.span
                        key={preview.id}
                        layoutId={`file-${layoutGroupId}-${preview.id}`}
                        initial={false}
                        animate={
                          fanOpen && !reduce
                            ? {
                                x: opened.x * 1.65,
                                y: opened.y - 18,
                                rotate: opened.rotate * 1.35,
                                scale: opened.scale * 1.04,
                                opacity: Math.min(1, opened.opacity + 0.18),
                              }
                            : {
                                x: opened.x,
                                y: opened.y,
                                rotate: opened.rotate,
                                scale: opened.scale,
                                opacity: opened.opacity,
                              }
                        }
                        transition={transition}
                        onLayoutAnimationComplete={() => {
                          if (isClosing && index === 0) finishClose();
                        }}
                        style={coverStyle(opened.zIndex)}
                      >
                        {preview.content}
                      </motion.span>
                    );
                  })
                : null}
            </AnimatePresence>
          </span>
        </span>

        <motion.span
          initial={false}
          animate={{ rotateX: fanOpen && !reduce ? -25 : 0 }}
          transition={transition}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 20,
            overflow: "hidden",
            borderRadius: 16,
            border: `1px solid ${EDGE}`,
            background: "rgba(250, 247, 241, 0.72)",
            backdropFilter: "blur(22px)",
            WebkitBackdropFilter: "blur(22px)",
            backfaceVisibility: "hidden",
            transformOrigin: "center bottom",
          }}
        >
          <span style={{ display: "flex", height: 64, alignItems: "center", padding: "0 16px" }}>
            <span style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              fontSize: 20,
              fontWeight: 650,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              color: INK,
            }}>
              {title}
            </span>
          </span>
          <span style={{
            display: "flex",
            height: 48,
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            borderTop: `1px solid ${EDGE}`,
            padding: "0 16px",
          }}>
            <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 650, color: "rgba(35,38,47,0.7)" }}>
              {countText}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13, color: MUTED }}>
              {description}
            </span>
          </span>
        </motion.span>
      </motion.button>

      {mounted ? createPortal(overlay, document.body) : null}
      <style>{`
        .pdProjectFolder:focus-visible {
          box-shadow: 0 0 0 2px #faf7f1, 0 0 0 4px #0e7a6b;
        }
        @media (max-width: 640px) {
          .pdProjectFolder { width: 260px !important; height: 210px !important; }
        }
      `}</style>
    </LayoutGroup>
  );
}
