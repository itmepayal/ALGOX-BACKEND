/**
 * Deterministic spaced-repetition schedule (integer intervals only).
 * Feedback: Hard | Okay | Easy → next interval days → nextReviewAt.
 *
 * Free (standard):
 *   Hard → 1d; Okay → prev×3 (cap 30); Easy → prev×5 (cap 90)
 * Premium advanced:
 *   Hard → 1d (or half prev if prev≥4, min 1); Okay → prev×3 (cap 60); Easy → prev×7 (cap 180)
 */

export type SrsFeedback = "hard" | "okay" | "easy";

export const SRS_FEEDBACK = ["hard", "okay", "easy"] as const;

export function confidenceScore(feedback: SrsFeedback): number {
  switch (feedback) {
    case "hard":
      return 1;
    case "okay":
      return 3;
    case "easy":
      return 5;
  }
}

export function isSrsFeedback(v: unknown): v is SrsFeedback {
  return v === "hard" || v === "okay" || v === "easy";
}

/** First review after a solve — always 1 calendar day. */
export const FIRST_INTERVAL_DAYS = 1;

export function nextIntervalDays(
  previousIntervalDays: number,
  feedback: SrsFeedback,
  advanced: boolean
): number {
  const prev = Math.max(1, Math.floor(Number(previousIntervalDays) || 1));

  if (feedback === "hard") {
    if (advanced && prev >= 4) {
      return Math.max(1, Math.floor(prev / 2));
    }
    return 1;
  }

  if (feedback === "okay") {
    const next = prev * 3;
    return Math.min(next, advanced ? 60 : 30);
  }

  // easy
  const next = prev * (advanced ? 7 : 5);
  return Math.min(next, advanced ? 180 : 90);
}

export function addDaysUtc(from: Date, days: number): Date {
  const d = Math.max(0, Math.floor(days));
  return new Date(from.getTime() + d * 86_400_000);
}

export function computeNextReviewAt(
  from: Date,
  previousIntervalDays: number,
  feedback: SrsFeedback,
  advanced: boolean
): { intervalDays: number; nextReviewAt: Date; confidenceScore: number } {
  const intervalDays = nextIntervalDays(
    previousIntervalDays,
    feedback,
    advanced
  );
  return {
    intervalDays,
    nextReviewAt: addDaysUtc(from, intervalDays),
    confidenceScore: confidenceScore(feedback),
  };
}

/** Start of calendar day in IANA TZ as UTC Date (for range queries). */
export function startOfDayInTimeZone(instant: Date, timeZone: string): Date {
  const key = dateKeySafe(instant, timeZone);
  const [y, m, d] = key.split("-").map(Number);
  // Approximate: use noon UTC for key construction elsewhere; for bounds use
  // iterative search — prefer exporting dateKey and comparing keys in service.
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function dateKeySafe(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  }
}

export { dateKeySafe as dateKeyForSrs };
