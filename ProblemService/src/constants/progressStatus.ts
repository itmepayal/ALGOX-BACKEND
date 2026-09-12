/** Centralized problem progress statuses for import/sync. */
export const PROBLEM_PROGRESS_STATUS = {
  NOT_STARTED: "NOT_STARTED",
  ATTEMPTED: "ATTEMPTED",
  SOLVED: "SOLVED",
} as const;

export type ProblemProgressStatus =
  (typeof PROBLEM_PROGRESS_STATUS)[keyof typeof PROBLEM_PROGRESS_STATUS];

/** Official solved = ACCEPTED from a submit (not a run). */
export function isOfficialAcceptedSubmission(s: {
  status?: string;
  source?: string;
}): boolean {
  if (s.status !== "ACCEPTED") return false;
  return s.source !== "run";
}

export function deriveProblemProgressStatus(
  submissions: Array<{ status?: string; source?: string }>
): ProblemProgressStatus {
  if (!submissions.length) return PROBLEM_PROGRESS_STATUS.NOT_STARTED;
  if (submissions.some(isOfficialAcceptedSubmission)) {
    return PROBLEM_PROGRESS_STATUS.SOLVED;
  }
  return PROBLEM_PROGRESS_STATUS.ATTEMPTED;
}
