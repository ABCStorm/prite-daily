/** Default ranking for Today's set: newest exam year first.
    Anyone who never rearranged "What comes first" should land here. */
export const DEFAULT_DAILY_ORDER = ["year", "missed", "weak", "highyield", "unseen"] as const;

/** The ranking that shipped first (missed questions, then year). Stored copies
    of this exact list are treated as "never customized" so the new default
    applies; a different arrangement is left alone. */
export const LEGACY_DEFAULT_DAILY_ORDER = ["missed", "year", "weak", "highyield", "unseen"] as const;

export function isUnspecifiedDailyOrder(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length === 0) return true;
  return raw.join() === LEGACY_DEFAULT_DAILY_ORDER.join();
}

/** Account copy wins when it is a real rearrangement. Stock / missing /
    legacy-default lists become the current year-first default. */
export function pickDailyOrder(local: unknown, remote: unknown): string[] {
  if (!isUnspecifiedDailyOrder(remote) && Array.isArray(remote)) return remote.filter((v): v is string => typeof v === "string");
  if (!isUnspecifiedDailyOrder(local) && Array.isArray(local)) return local.filter((v): v is string => typeof v === "string");
  return [...DEFAULT_DAILY_ORDER];
}
