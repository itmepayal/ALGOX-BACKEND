/**
 * Daily challenge streak rules (server SoT).
 *
 * Qualifying activity:
 *   Completing the canonical Daily Challenge for a calendar day — recorded only after
 *   the server verifies an ACCEPTED official submission for that day's problem.
 *   Client timestamps / client-supplied dateKeys are never authoritative.
 *
 * Timezone:
 *   User IANA TZ on UserStreakState. "Today" = dateKeyInTimeZone(serverNow, tz).
 *
 * Missed day:
 *   If yesterday is neither completed nor frozen, current streak resets on next evaluate.
 *
 * Freeze:
 *   Premium (premium.streak_freeze). Consuming a freeze marks a missed day as frozen
 *   and preserves the consecutive run. Free users have freezeBalance 0.
 *
 * Timezone changes:
 *   Affect only future todayKey mapping. Past completions keep their dateKeys.
 *   Cannot invent past completions by shifting TZ.
 */

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateKey(key: string): boolean {
  if (!DATE_KEY_RE.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string" || tz.length > 64) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** YYYY-MM-DD in the given IANA timezone for an instant (server clock). */
export function dateKeyInTimeZone(instant: Date, timeZone: string): string {
  const tz = isValidIanaTimeZone(timeZone) ? timeZone : "UTC";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.round((tb - ta) / 86400000);
}

/** Deterministic catalog pick seed — same dateKey → same index for all users. */
export function hashDateKey(dateKey: string): number {
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) {
    h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return h;
}

export type QualifyResult = {
  currentStreak: number;
  longestStreak: number;
  resetReason?: "missed_day" | "first" | "continue" | "same_day";
};

/**
 * Apply a newly qualified day (completed or frozen) given prior lastQualifiedDateKey.
 * `todayKey` must already be the server-derived date for the user.
 */
export function applyQualifiedDay(args: {
  todayKey: string;
  lastQualifiedDateKey: string | null;
  currentStreak: number;
  longestStreak: number;
}): QualifyResult {
  const { todayKey, lastQualifiedDateKey, currentStreak, longestStreak } = args;

  if (lastQualifiedDateKey === todayKey) {
    return {
      currentStreak,
      longestStreak: Math.max(longestStreak, currentStreak),
      resetReason: "same_day",
    };
  }

  const yesterday = shiftDateKey(todayKey, -1);
  let next = 1;
  let reason: QualifyResult["resetReason"] = "first";

  if (lastQualifiedDateKey === yesterday) {
    next = currentStreak + 1;
    reason = "continue";
  } else if (lastQualifiedDateKey && daysBetween(lastQualifiedDateKey, todayKey) === 0) {
    next = currentStreak;
    reason = "same_day";
  } else if (!lastQualifiedDateKey) {
    next = 1;
    reason = "first";
  } else {
    // Gap > 1 day → missed day(s); streak restarts
    next = 1;
    reason = "missed_day";
  }

  return {
    currentStreak: next,
    longestStreak: Math.max(longestStreak, next),
    resetReason: reason,
  };
}

/**
 * Recompute current streak from a sorted unique set of qualified dateKeys
 * relative to todayKey (inclusive if present, else yesterday).
 */
export function computeCurrentStreakFromDays(
  qualifiedDateKeys: string[],
  todayKey: string
): number {
  const set = new Set(qualifiedDateKeys);
  const yesterday = shiftDateKey(todayKey, -1);
  let cursor = set.has(todayKey)
    ? todayKey
    : set.has(yesterday)
      ? yesterday
      : null;
  let n = 0;
  while (cursor && set.has(cursor)) {
    n += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return n;
}

export function computeLongestStreakFromDays(qualifiedDateKeys: string[]): number {
  const days = [...new Set(qualifiedDateKeys)].sort();
  if (!days.length) return 0;
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (daysBetween(days[i - 1], days[i]) === 1) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }
  return longest;
}

export const BADGE_DEFS: Record<string, string> = {
  first_challenge: "First Daily Challenge",
  streak_3: "3-Day Streak",
  streak_7: "7-Day Streak",
  streak_30: "30-Day Streak",
  weekly_goal: "Weekly Goal Met",
  monthly_goal: "Monthly Goal Met",
};

export function badgesForStreak(currentStreak: number): string[] {
  const out: string[] = [];
  if (currentStreak >= 1) out.push("first_challenge");
  if (currentStreak >= 3) out.push("streak_3");
  if (currentStreak >= 7) out.push("streak_7");
  if (currentStreak >= 30) out.push("streak_30");
  return out;
}

/** Free users may view history within this many days (inclusive of today). */
export const FREE_HISTORY_DAYS = 7;
