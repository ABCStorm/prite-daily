import React from "react";

/** Tiny folder-tab in a question-card corner. Toggles Stat Cat or Dynamic Dawg. */
export function MascotTab({
  side,
  tone,
  label,
  on,
  onToggle,
  showTitle,
  hideTitle,
}: {
  side: "left" | "right";
  tone: "brown" | "orange";
  label: string;
  on: boolean;
  onToggle: () => void;
  showTitle: string;
  hideTitle: string;
}) {
  return (
    <button
      type="button"
      className={`mascotTab mascotTab-${side} mascotTab-${tone}${on ? " mascotTabOn" : ""}`}
      onClick={onToggle}
      title={on ? hideTitle : showTitle}
      aria-pressed={on}
      aria-label={on ? hideTitle : showTitle}
    >
      <span className="mascotTabLbl">{label}</span>
      <style>{TAB_CSS}</style>
    </button>
  );
}

const TAB_CSS = `
.mascotTab {
  position: absolute;
  top: 0;
  z-index: 8;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 58px;
  height: 18px;
  padding: 0 8px 1px;
  border: 1px solid transparent;
  border-top: 0;
  font: 700 10px/1 "Helvetica Neue", Helvetica, Arial, sans-serif;
  letter-spacing: .06em;
  text-transform: uppercase;
  cursor: pointer;
  pointer-events: auto;
}
.mascotTab-left {
  left: 12px;
  border-radius: 0 0 8px 8px;
}
.mascotTab-right {
  right: 22px;
  border-radius: 0 0 8px 8px;
}
.mascotTab-brown {
  background: #ead9cc;
  color: #6b341c;
  border-color: #d7c0ad;
}
.mascotTab-orange {
  background: #f3ddb8;
  color: #8a5410;
  border-color: #e4c48a;
}
.mascotTab-brown.mascotTabOn {
  background: #8a4b2f;
  color: #fff8f2;
  border-color: #6b341c;
}
.mascotTab-orange.mascotTabOn {
  background: #d4832a;
  color: #fffaf2;
  border-color: #a86416;
}
.mascotTab:hover { filter: brightness(1.06); }
.mascotTab:focus-visible { outline: 2px solid #0e7a6b; outline-offset: 2px; }
.mascotTabLbl { transform: translateY(0.5px); }
@media (max-width: 640px) {
  .mascotTab { min-width: 52px; height: 17px; padding: 0 7px 1px; font-size: 9.5px; }
  .mascotTab-left { left: 8px; }
  .mascotTab-right { right: 18px; }
}
`;
