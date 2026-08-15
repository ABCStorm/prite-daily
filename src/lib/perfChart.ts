/* Daily first-try accuracy for the Statistics "Performance over time" chart.

   Each question is pinned to the day it was first answered (`created_at`).
   Using `updated_at` + `first_correct` made review days look like a crash
   (missed items come back red) and left leftover never-reviewed correct
   items as a cluster of 100% dots on older days. */

export type ChartPoint = { x: number; y: number; n: number };
export type ChartData = {
  points: ChartPoint[];
  N: number;
  totalQ: number;
  fit: { m: number; b: number; r: number } | null;
  improving: boolean;
};

export const PERF_CHART_MIN_N = 5;

type AnswerLike = {
  first_correct?: boolean;
  created_at?: string;
  updated_at: string;
  attempts?: number;
};

function dayKey(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** First-attempt timestamp. Fall back to updated_at only for a one-shot row
    that predates created_at in the payload. */
export function firstAttemptAt(a: AnswerLike): number {
  const created = a.created_at ? Date.parse(a.created_at) : NaN;
  if (Number.isFinite(created)) return created;
  if ((a.attempts ?? 1) === 1) {
    const updated = Date.parse(a.updated_at);
    if (Number.isFinite(updated)) return updated;
  }
  return NaN;
}

export function buildPerfChart(
  answers: Iterable<AnswerLike>,
  minN = PERF_CHART_MIN_N,
): ChartData {
  const recs = [...answers]
    .map((a) => ({ t: firstAttemptAt(a), ok: !!a.first_correct }))
    .filter((r) => Number.isFinite(r.t))
    .sort((a, b) => a.t - b.t);

  const byDay = new Map<string, { first: number; n: number; ok: number }>();
  for (const r of recs) {
    const k = dayKey(r.t);
    const g = byDay.get(k) ?? { first: r.t, n: 0, ok: 0 };
    g.n++;
    if (r.ok) g.ok++;
    byDay.set(k, g);
  }

  const days = [...byDay.values()].sort((a, b) => a.first - b.first);
  let cum = 0;
  const points: ChartPoint[] = [];
  for (const d of days) {
    cum += d.n;
    if (d.n >= minN) points.push({ x: cum, y: (d.ok / d.n) * 100, n: d.n });
  }

  const N = points.length;
  const base: ChartData = { points, N, totalQ: recs.length, fit: null, improving: false };
  if (N < 2) return base;

  const sx = points.reduce((s, p) => s + p.x, 0);
  const sy = points.reduce((s, p) => s + p.y, 0);
  const sxx = points.reduce((s, p) => s + p.x * p.x, 0);
  const syy = points.reduce((s, p) => s + p.y * p.y, 0);
  const sxy = points.reduce((s, p) => s + p.x * p.y, 0);
  const denom = N * sxx - sx * sx;
  const slope = denom ? (N * sxy - sx * sy) / denom : 0;
  const b = (sy - slope * sx) / N;
  const rDen = Math.sqrt(denom * (N * syy - sy * sy));
  const r = rDen ? (N * sxy - sx * sy) / rDen : 0;
  const improving = N >= 4 && slope > 0 && r >= 0.15;
  return { ...base, fit: { m: slope, b, r }, improving };
}
