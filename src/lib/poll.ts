// Live crowd-polling over Supabase Realtime "broadcast" channels.
//
// Broadcast is ephemeral pub/sub — no database tables, no schema migration. A
// host (big screen) and any number of participants (phones) join the same
// channel keyed by a short room code. The host owns the question pointer and
// tallies votes; participants just send taps. Nothing is persisted: a poll is a
// transient group-study activity, separate from each resident's answer history.

export const POLL_PARAM = "poll";

// How long the "revealing the answer" countdown holds on phones before the
// correct answer actually locks in, so a question that just advanced doesn't
// cut someone off mid-tap.
export const REVEAL_DELAY_MS = 3000;

// Unambiguous alphabet (no 0/O/1/I) for a code that's easy to read off a screen.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function makePollCode(len = 4): string {
  let out = "";
  const rnd = crypto.getRandomValues(new Uint32Array(len));
  for (let i = 0; i < len; i++) out += ALPHABET[rnd[i] % ALPHABET.length];
  return out;
}

export const channelName = (code: string) => `poll-${code.toUpperCase()}`;

// A team's standing across all revealed questions in the poll. Ranked by
// team accuracy — the share of ALL answers the team submitted that were
// correct (`correct`/`answered`) — so a bigger team can't win just by
// fielding more bodies. The host can toggle the ranking to raw total
// correct instead (see PollState.rankBy). `score` is always the total
// correct count; `answered` is total votes cast; `answerers` is unique
// members who voted — all kept raw so either ranking can be displayed.
export type TeamStanding = { team: string; score: number; members: number; correct: number; answerers: number; answered: number };

// A single participant's standing across all revealed questions — for the
// individual leaderboard (both the "individual" team mode and the host's
// optional individual view of a team poll). `score` is correct answers.
export type IndividualStanding = { voter: string; name: string; score: number; answered: number };

// How the host wants teams formed for this poll session.
// "self" — everyone types their own team name.
// "auto" — reshuffled fresh into balanced teams each time the host runs it.
// "stable" — everyone uses the season-long roster (see stableTeamLevel below).
// "weekly" — everyone uses the admin-randomized pairing for this week's
//            didactics (weekly_teams table); persists until re-randomized.
// "individual" — no teams; everyone competes solo, ranked as individuals.
export type TeamMode = "self" | "auto" | "stable" | "weekly" | "individual";
export const TRAINING_LEVELS = ["R1", "R2", "R3", "R4"] as const;

/**
 * Maps a training level to the bucket used for season-long ("stable") team
 * assignment: R1–R4 each get their own slot, and both child-fellow levels
 * (F1/F2) share the R4 slot, since a fellow is that team's senior member just
 * like an R4 would be. Faculty, alumni, and anyone with no level set yet are
 * excluded from the stable-team pool entirely (returns null).
 */
export function stableTeamLevel(level?: string | null): string | null {
  if (level === "R1" || level === "R2" || level === "R3" || level === "R4") return level;
  if (level === "F1" || level === "F2") return "R4";
  return null;
}

// Host → everyone: which question is live right now.
export type PollState = {
  qid: string;
  year: string;
  qIndex: number;
  nOptions: number;
  options: { letter: string; text: string }[]; // full choice text, so phones can show it even when the host hides choices on the big screen
  // The question text, broadcast for the same reason as `options`. Participants
  // who aren't signed in can't download the (private) question bank at all, so
  // without this they see answer choices with nothing to answer. Optional so an
  // older host that doesn't send it still works — the phone just falls back to
  // its local copy of the bank when it has one.
  stem?: string;
  index: number;   // 0-based position in the host's set
  total: number;   // size of the host's set
  multiSelect: boolean; // this question wants "select all that apply" — phones show a Submit step instead of tap-to-vote
  requiredSelections?: number; // exact number of choices expected; optional so participants remain compatible with an older host
  revealed: boolean;
  // Set the moment the host starts revealing (button click or the per-question
  // timer running out), to the epoch ms when the answer will actually lock in
  // — a few seconds out, not immediately. Phones use it to show a countdown so
  // nobody gets cut off mid-tap; voting stays open the whole time (`revealed`
  // itself doesn't flip until it elapses). Cleared once revealed is true.
  revealAt?: number;
  correct: string[]; // populated only once revealed
  standings: TeamStanding[]; // cumulative team leaderboard (highest first)
  rankBy?: "pct" | "total"; // how standings are ranked: team accuracy % (default) or raw total correct — phones show the matching metric
  individuals?: IndividualStanding[]; // cumulative individual leaderboard (highest first)
  teamMode: TeamMode;
  started?: boolean; // false while the host hasn't hit "Start" yet — phones show a lobby
  voted?: number;    // votes cast on the live question
  joined?: number;   // participants the host knows about
  finished?: boolean; // host ended the session — show final standings
};

/** Exact-match grading — same rule as the personal practice quiz: a
    multi-select question is only "correct" when the pick set is exactly the
    correct set, no more and no fewer. Also the right comparison for
    single-select, where both arrays are always length 1. */
export function pickIsCorrect(pick: string[], correct: string[]): boolean {
  return pick.length > 0 && pick.length === correct.length && pick.every((l) => correct.includes(l));
}

// Participant → host. `team` is optional — a voter may compete solo. `level`
// is the voter's PGY year (R1–R4), if known, so the host can auto-balance teams.
// `choice` is always an array — a single-select vote is just a length-1 array.
export type PollVote = { qid: string; choice: string[]; voter: string; team?: string; level?: string; name?: string };
// Participant → host on join (and whenever they pick/change a team), so the host
// re-broadcasts the current state and learns the voter's team. `name` is the
// participant's display name, for the individual leaderboard.
export type PollHello = { voter: string; team?: string; level?: string; name?: string };
// Host → everyone, after running the auto-assign shuffle: voter id -> team name.
export type PollAssign = { assignments: Record<string, string> };

export const POLL_EVENTS = { state: "state", vote: "vote", hello: "hello", assign: "assign" } as const;

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Aim for teams of this size; actual sizes stay within ±1 of each other. */
const TARGET_TEAM_SIZE = 4;

/**
 * Randomly group participants into evenly sized teams (target 4, sizes never
 * differing by more than 1) with the PGY years spread across teams: each
 * year's shuffled list is dealt round-robin, so a team is never four R1s.
 * The team count comes from the TOTAL headcount — NOT the largest class —
 * which is what previously produced trailing one-person teams once the
 * smaller classes ran out. Anyone with no known year (not signed in, or
 * hasn't set one) is dealt into the same rotation.
 */
export function assignBalancedTeams(entries: { voter: string; level?: string | null }[]): Record<string, string> {
  const order = [...TRAINING_LEVELS, "other"];
  const buckets = new Map<string, string[]>(order.map((k) => [k, []]));
  for (const { voter, level } of entries) {
    const key = level && (TRAINING_LEVELS as readonly string[]).includes(level) ? level : "other";
    buckets.get(key)!.push(voter);
  }
  for (const [key, list] of buckets) buckets.set(key, shuffle(list));

  const teamCount = Math.max(1, Math.floor(entries.length / TARGET_TEAM_SIZE));
  const assignments: Record<string, string> = {};
  // One continuous deal across all year buckets: consecutive members of the
  // same year land on different teams, and the running index keeps every
  // team's size within 1 of the others.
  let seat = Math.floor(Math.random() * teamCount); // random starting team
  for (const key of order) {
    for (const voter of buckets.get(key)!) {
      assignments[voter] = `Team ${(seat % teamCount) + 1}`;
      seat++;
    }
  }
  return assignments;
}

/** Build the shareable join URL for a room code. */
export function pollJoinUrl(code: string): string {
  const u = new URL(window.location.origin);
  u.searchParams.set(POLL_PARAM, code.toUpperCase());
  return u.toString();
}

/** Read a poll code from the current URL (?poll=ABCD), if any. */
export function pollCodeFromUrl(): string | null {
  try {
    const c = new URLSearchParams(window.location.search).get(POLL_PARAM);
    return c ? c.toUpperCase() : null;
  } catch {
    return null;
  }
}

/** Remove ?poll=… from the address bar without reloading. */
export function clearPollParam() {
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete(POLL_PARAM);
    window.history.replaceState({}, "", u.toString());
  } catch {
    /* no-op */
  }
}
