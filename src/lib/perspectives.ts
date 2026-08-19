/* Chairs that re-read the same PRITE item from another theoretical seat.

   Dog (psychodynamic), Cat (sourced evidence), and eight named psychotherapy
   modalities (CBT first, falling back to IPT/DBT/ACT/existential/supportive/
   CPT/exposure — see scripts/therapy-perspectives/) ship today. Adding a new
   chair is: load its JSON, push a card in `perspectivesForQuestion`, and give
   it a palette + mascot. The folder UI fans whatever this function returns. */

import type { DynPearl } from "./dynPerspectives";
import type { OwlStat } from "./owlStats";
import type { TherapyPearl, TherapyPerspectiveKind } from "./therapyPerspectives";

export type PerspectiveKind = "psychodynamic" | "evidence" | TherapyPerspectiveKind;

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
  /** Illustrated mascot sprite; when absent the UI falls back to a lettered badge. */
  mascot?: { idle: string; blink: string; alt: string };
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
  act: {
    paper: "#f4f7ee",
    paperEdge: "#dbe4c8",
    ink: "#232b1c",
    accent: "#5c7a2e",
    accentSoft: "#e6edd7",
    mark: "A",
  },
  existential: {
    paper: "#f0f2f4",
    paperEdge: "#d2d8dd",
    ink: "#20262b",
    accent: "#3f4a52",
    accentSoft: "#dde3e6",
    mark: "E",
  },
  supportive: {
    paper: "#fdf2f3",
    paperEdge: "#f0d6d9",
    ink: "#2c1e20",
    accent: "#a8465a",
    accentSoft: "#f6dde1",
    mark: "U",
  },
  cpt: {
    paper: "#eef3f7",
    paperEdge: "#c9d9e6",
    ink: "#1c2733",
    accent: "#2d5f8a",
    accentSoft: "#dbe6f0",
    mark: "P",
  },
  exposure: {
    paper: "#fff7ec",
    paperEdge: "#f0dcb8",
    ink: "#2c2013",
    accent: "#b85c1f",
    accentSoft: "#f7e6c6",
    mark: "X",
  },
};

const MODALITY_TITLES: Record<TherapyPerspectiveKind, { title: string; school: string }> = {
  cbt: { title: "CBT", school: "Cognitive Behavioral Therapy" },
  ipt: { title: "IPT", school: "Interpersonal Therapy" },
  dbt: { title: "DBT", school: "Dialectical Behavior Therapy" },
  act: { title: "ACT", school: "Acceptance & Commitment Therapy" },
  existential: { title: "Existential", school: "Existential Therapy" },
  supportive: { title: "Supportive", school: "Supportive Therapy" },
  cpt: { title: "CPT", school: "Cognitive Processing Therapy" },
  exposure: { title: "Exposure", school: "Exposure Therapy" },
};

/** Stable display order — new chairs append here so the fan stays predictable. */
const KIND_ORDER: PerspectiveKind[] = [
  "psychodynamic",
  "evidence",
  "cbt",
  "ipt",
  "dbt",
  "act",
  "existential",
  "supportive",
  "cpt",
  "exposure",
];

export function perspectivesForQuestion(
  qid: string,
  extras: { dyn?: DynPearl; owl?: OwlStat; therapy?: TherapyPearl } = {},
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

  if (extras.therapy?.sentence) {
    const { modality } = extras.therapy;
    const meta = MODALITY_TITLES[modality];
    cards.push({
      id: `${qid}-${modality}`,
      kind: modality,
      title: meta.title,
      school: meta.school,
      body: extras.therapy.sentence.trim(),
      // No illustrated mascot yet for the therapy-modality chairs; the folder
      // UI falls back to a lettered badge in this palette.
      palette: PALETTES[modality],
    });
  }

  return cards.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
