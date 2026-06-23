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

// Host → everyone: which question is live right now.
export type PollState = {
  qid: string;
  year: string;
  qIndex: number;
  nOptions: number;
  index: number;   // 0-based position in the host's set
  total: number;   // size of the host's set
  revealed: boolean;
  correct: string[]; // populated only once revealed
};

// Participant → host.
export type PollVote = { qid: string; choice: string; voter: string };
// Participant → host on join, so the host re-broadcasts the current state.
export type PollHello = { voter: string };

export const POLL_EVENTS = { state: "state", vote: "vote", hello: "hello" } as const;

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
