/**
 * Mock interview report scoring — real judge/session signals only.
 * Never invent AI / soft scores. Mark dimensions unavailable when no signal exists.
 */
import type {
  IMockInterviewProblemAttempt,
  IMockInterviewReport,
  IMockScoreCell,
  MockInterviewStatus,
} from "../models/mockInterviewSession.model";

function cell(
  score: number | null,
  available: boolean,
  signal: string,
  detail?: string
): IMockScoreCell {
  return {
    score: available && score != null ? Math.round(Math.min(100, Math.max(0, score))) : null,
    available,
    signal,
    detail,
  };
}

export function buildMockInterviewReport(args: {
  status: MockInterviewStatus;
  durationMinutes: number;
  startedAt: Date;
  endsAt: Date;
  completedAt: Date;
  attempts: IMockInterviewProblemAttempt[];
  problemIds: string[];
}): IMockInterviewReport {
  const {
    status,
    durationMinutes,
    startedAt,
    endsAt,
    completedAt,
    attempts,
    problemIds,
  } = args;

  const durationMs = Math.max(1, durationMinutes * 60_000);
  const timeUsedMs = Math.max(
    0,
    Math.min(completedAt.getTime() - startedAt.getTime(), durationMs)
  );
  const remainingMsAtEnd = Math.max(0, endsAt.getTime() - completedAt.getTime());
  const completedBeforeTimeout = status === "completed";

  const problemsTotal = problemIds.length;
  const withSubmit = attempts.filter(
    (a) => a.submissionId && a.source !== "run"
  );
  const problemsAttempted = new Set(withSubmit.map((a) => a.problemId)).size;
  const problemsAccepted = withSubmit.filter(
    (a) => String(a.status).toUpperCase() === "ACCEPTED"
  ).length;

  // Prefer latest attempt per problem
  const latestByProblem = new Map<string, IMockInterviewProblemAttempt>();
  for (const a of withSubmit) {
    const prev = latestByProblem.get(a.problemId);
    if (!prev || (a.submittedAt && prev.submittedAt && a.submittedAt > prev.submittedAt)) {
      latestByProblem.set(a.problemId, a);
    } else if (!prev) {
      latestByProblem.set(a.problemId, a);
    }
  }
  const latest = [...latestByProblem.values()];

  const problemSolving = cell(
    problemsTotal > 0 ? (problemsAccepted / problemsTotal) * 100 : 0,
    problemsTotal > 0,
    "accepted_problems / total_problems",
    `${problemsAccepted}/${problemsTotal} ACCEPTED`
  );

  let passed = 0;
  let total = 0;
  for (const a of latest) {
    if (typeof a.testCasesPassed === "number" && typeof a.totalTestCases === "number") {
      passed += a.testCasesPassed;
      total += a.totalTestCases;
    }
  }
  const correctness =
    total > 0
      ? cell((passed / total) * 100, true, "test_cases_passed / total_test_cases", `${passed}/${total}`)
      : cell(null, false, "test_cases_passed / total_test_cases", "No judged testcase totals yet");

  // No asymptotic analyzer in product — explicitly unavailable
  const complexity = cell(
    null,
    false,
    "unavailable",
    "No complexity analysis system; score not invented"
  );

  // Time management: finish before server endsAt + efficient use of allotted window
  let timeScore: number | null = null;
  if (completedBeforeTimeout) {
    const ratio = timeUsedMs / durationMs;
    // Sweet spot: used some time but finished early → high; used almost all → lower but still ok
    timeScore = Math.round(100 - Math.min(40, ratio * 40));
  } else if (status === "timed_out") {
    // Timed out: score from how much was attempted before window closed
    timeScore = problemsAttempted > 0 ? Math.round((problemsAttempted / problemsTotal) * 50) : 0;
  }
  const timeManagement = cell(
    timeScore,
    timeScore != null,
    "server_window_completion + time_used_ms / duration_ms",
    completedBeforeTimeout
      ? `Finished with ${remainingMsAtEnd}ms remaining`
      : `Timed out after ${timeUsedMs}ms`
  );

  // Code quality proxy: compilation success among judged submits (real CE signal)
  const judged = latest.filter((a) => a.status && a.status !== "PENDING" && a.status !== "RUNNING");
  const ce = judged.filter((a) => String(a.status).toUpperCase() === "COMPILATION_ERROR").length;
  const codeQuality =
    judged.length > 0
      ? cell(
          ((judged.length - ce) / judged.length) * 100,
          true,
          "1 - compilation_error_rate among judged submits",
          `${judged.length - ce}/${judged.length} compiled`
        )
      : cell(null, false, "compilation_error_rate", "No judged submissions");

  // Performance: fraction without TLE/MLE among judged; plus avg runtime when ACCEPTED
  const perfBad = judged.filter((a) => {
    const s = String(a.status).toUpperCase();
    return s === "TIME_LIMIT_EXCEEDED" || s === "MEMORY_LIMIT_EXCEEDED";
  }).length;
  const accepted = latest.filter((a) => String(a.status).toUpperCase() === "ACCEPTED");
  let performance: IMockScoreCell;
  if (judged.length === 0) {
    performance = cell(null, false, "tle_mle_rate + accepted_runtime", "No judged submissions");
  } else {
    const cleanRate = ((judged.length - perfBad) / judged.length) * 100;
    const runtimes = accepted
      .map((a) => a.executionTimeMs)
      .filter((n): n is number => typeof n === "number" && n >= 0);
    const detail =
      runtimes.length > 0
        ? `avg runtime ${Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length)}ms among ACCEPTED`
        : `${perfBad} TLE/MLE of ${judged.length} judged`;
    performance = cell(cleanRate, true, "1 - (TLE+MLE)/judged_submits", detail);
  }

  const completion = cell(
    problemsTotal > 0 ? (problemsAttempted / problemsTotal) * 100 : 0,
    problemsTotal > 0,
    "problems_with_official_submit / total_problems",
    `${problemsAttempted}/${problemsTotal} attempted`
  );

  return {
    generatedAt: new Date(),
    sessionStatus: status,
    durationMinutes,
    timeUsedMs,
    remainingMsAtEnd,
    completedBeforeTimeout,
    problemsTotal,
    problemsAttempted,
    problemsAccepted,
    scores: {
      problemSolving,
      correctness,
      complexity,
      timeManagement,
      codeQuality,
      performance,
      completion,
    },
    attempts: attempts.map((a) => ({ ...a })),
  };
}
