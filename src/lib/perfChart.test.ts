import assert from "node:assert/strict";
import { buildPerfChart, firstAttemptAt, PERF_CHART_MIN_N } from "./perfChart.ts";

// A question missed on day 1 and reviewed (correct) on day 2 must stay on
// day 1. The old updated_at grouping painted day 2 red from first_correct.
const day1 = "2026-03-01T16:00:00.000Z";
const day2 = "2026-03-02T16:00:00.000Z";
const reviewed = {
  first_correct: false,
  created_at: day1,
  updated_at: day2,
  attempts: 2,
};
assert.equal(firstAttemptAt(reviewed), Date.parse(day1));

// Five first-tries on day 1 at 80%, then a 20-item review day that would have
// shown ~10% if we keyed off updated_at + first_correct.
const answers = [
  ...Array.from({ length: 4 }, (_, i) => ({
    first_correct: true,
    created_at: day1,
    updated_at: day1,
    attempts: 1,
    id: `ok-${i}`,
  })),
  { first_correct: false, created_at: day1, updated_at: day2, attempts: 2 },
  ...Array.from({ length: 19 }, (_, i) => ({
    first_correct: false,
    created_at: "2026-02-01T16:00:00.000Z",
    updated_at: day2,
    attempts: 2,
    id: `old-${i}`,
  })),
];

const chart = buildPerfChart(answers);
assert.equal(chart.totalQ, 24);
// Review day must not appear: those 19 were first answered in February, and
// February has 19 (>= min n) at 0% first-try; March 1 has 5 at 80%.
assert.ok(chart.points.some((p) => p.n === 5 && Math.round(p.y) === 80));
assert.ok(!chart.points.some((p) => p.n === 20), "review-day pile must not plot");

// One-question 100% days are omitted so they don't cluster at the top.
const noisy = [
  { first_correct: true, created_at: day1, updated_at: day1, attempts: 1 },
  { first_correct: true, created_at: day2, updated_at: day2, attempts: 1 },
];
const hidden = buildPerfChart(noisy);
assert.equal(hidden.points.length, 0);
assert.equal(hidden.totalQ, 2);
assert.ok(PERF_CHART_MIN_N >= 5);

console.log("perfChart tests ok");
