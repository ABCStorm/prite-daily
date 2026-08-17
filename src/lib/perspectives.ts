/* Chairs that re-read the same PRITE item from another theoretical seat.

   Dog (psychodynamic) and Cat (sourced evidence) ship today. Adding a later
   psychotherapy chair — CBT, IPT, DBT — is: load its JSON, push a card in
   `perspectivesForQuestion`, and give it a palette + mascot. The folder UI
   fans whatever this function returns. */

import type { DynPearl } from "./dynPerspectives";
import type { OwlStat } from "./owlStats";

export type PerspectiveKind = "psychodynamic" | "evidence" | "cbt" | "ipt" | "dbt";

export type PerspectivePalette = {
  paper: string;
  paperEdge: string;
  ink: string;
  accent: string;
  accentSoft: string;
  mark: string;
};

export type PerspectiveCard = {
  id: string;
  kind: PerspectiveKind;
  title: string;
  school: string;
  body: string;
  source?: { label: string; url: string; year?: number | null };
  mascot: { idle: string; blink: string; alt: string };
  palette: PerspectivePalette;
};

const PALETTES: Record<PerspectiveKind, PerspectivePalette> = {
  psychodynamic: {
    paper: "#fff6ee",
    paperEdge: "#ead9cc",
    ink: "#2a211c",
    accent: "#8a4b2f",
    accentSoft: "#f3e4d8",
    mark: "D",
  },
  evidence: {
    paper: "#fff8ee",
    paperEdge: "#ecd9b8",
    ink: "#2a2318",
    accent: "#c56a14",
    accentSoft: "#f6e6c8",
    mark: "S",
  },
  cbt: {
    paper: "#eef6f4",
    paperEdge: "#c9ddd7",
    ink: "#1b2a27",
    accent: "#0b5d52",
    accentSoft: "#dceee9",
    mark: "C",
  },
  ipt: {
    paper: "#f3f0f7",
    paperEdge: "#d5cde0",
    ink: "#241f2c",
    accent: "#5a4570",
    accentSoft: "#e8e2ef",
    mark: "I",
  },
  dbt: {
    paper: "#eef3f8",
    paperEdge: "#c9d6e3",
    ink: "#1c2430",
    accent: "#3a5a78",
    accentSoft: "#dde7f0",
    mark: "B",
  },
};

/** Stable display order — new chairs append here so the fan stays predictable. */
const KIND_ORDER: PerspectiveKind[] = ["psychodynamic", "evidence", "cbt", "ipt", "dbt"];

export function perspectivesForQuestion(
  qid: string,
  extras: { dyn?: DynPearl; owl?: OwlStat } = {},
): PerspectiveCard[] {
  const cards: PerspectiveCard[] = [];

  if (extras.dyn?.sentence) {
    cards.push({
      id: `${qid}-psychodynamic`,
      kind: "psychodynamic",
      title: "Dynamic Dawg",
      school: "Psychodynamic",
      body: extras.dyn.sentence.trim(),
      mascot: {
        idle: "/dyn/dawg-idle.webp",
        blink: "/dyn/dawg-blink.webp",
        alt: "Dynamic Dawg",
      },
      palette: PALETTES.psychodynamic,
    });
  }

  if (extras.owl?.sentence) {
    cards.push({
      id: `${qid}-evidence`,
      kind: "evidence",
      title: "Stat Cat",
      school: "Evidence",
      body: extras.owl.sentence.trim(),
      source: extras.owl.source_url
        ? {
            label: extras.owl.source_label,
            url: extras.owl.source_url,
            year: extras.owl.source_year,
          }
        : undefined,
      mascot: {
        idle: "/owl/cat-idle.webp",
        blink: "/owl/cat-blink.webp",
        alt: "Stat Cat",
      },
      palette: PALETTES.evidence,
    });
  }

  return cards.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
