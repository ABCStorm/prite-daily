// Live crowd-polling over Supabase Realtime "broadcast" channels.
//
// Broadcast is ephemeral pub/sub — no database tables, no schema migration. A
// host (big screen) and any number of participants (phones) join the same
// channel keyed by a short room code. The host owns the question pointer and
// tallies votes; participants just send taps. Nothing is persisted: a poll is a
// transient group-study activity, separate from each resident's answer history.

export const POLL_PARAM = "poll";

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
// correct answers per person who actually answered (not raw point total),
// so a team with more members — or more members who happened to vote —
// doesn't win just by having more bodies. `correct`/`answerers` are the raw
// counts behind that average, for display.
export type TeamStanding = { team: string; score: number; members: number; correct: number; answerers: number };

// How the host wants teams formed for this poll session.
// "self" — everyone types their own team name.
// "auto" — reshuffled fresh into balanced teams each time the host runs it.
// "stable" — everyone uses the season-long roster (see stableTeamLevel below).
export type TeamMode = "self" | "auto" | "stable";
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
  index: number;   // 0-based position in the host's set
  total: number;   // size of the host's set
  revealed: boolean;
  correct: string[]; // populated only once revealed
  standings: TeamStanding[]; // cumulative team leaderboard (highest first)
  teamMode: TeamMode;
  voted?: number;    // votes cast on the live question
  joined?: number;   // participants the host knows about
  finished?: boolean; // host ended the session — show final standings
};

// Participant → host. `team` is optional — a voter may compete solo. `level`
// is the voter's PGY year (R1–R4), if known, so the host can auto-balance teams.
export type PollVote = { qid: string; choice: string; voter: string; team?: string; level?: string };
// Participant → host on join (and whenever they pick/change a team), so the host
// re-broadcasts the current state and learns the voter's team.
export type PollHello = { voter: string; team?: string; level?: string };
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

/**
 * Randomly group participants into teams with at most one resident per PGY
 * year (R1–R4) apiece, so a team is never four R1s — instead each team gets a
 * spread of experience levels. Anyone with no known year (not signed in, or
 * hasn't set one) is spread round-robin across the same teams.
 */
export function assignBalancedTeams(entries: { voter: string; level?: string | null }[]): Record<string, string> {
  const order = [...TRAINING_LEVELS, "other"];
  const buckets = new Map<string, string[]>(order.map((k) => [k, []]));
  for (const { voter, level } of entries) {
    const key = level && (TRAINING_LEVELS as readonly string[]).includes(level) ? level : "other";
    buckets.get(key)!.push(voter);
  }
  for (const [key, list] of buckets) buckets.set(key, shuffle(list));

  const teamCount = Math.max(0, ...order.map((k) => buckets.get(k)!.length));
  const assignments: Record<string, string> = {};
  for (let i = 0; i < teamCount; i++) {
    const teamName = `Team ${i + 1}`;
    for (const key of order) {
      const voter = buckets.get(key)![i];
      if (voter) assignments[voter] = teamName;
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
