/**
 * Central Mock Interview configuration (server SoT).
 * Client reads via GET /interviews/config — do not hardcode elsewhere.
 */

export const MOCK_INTERVIEW_FEATURE = "premium.mock_interview" as const;

export const MOCK_INTERVIEW_COMPANIES = [
  "Amazon",
  "Google",
  "Microsoft",
  "Meta",
  "TCS",
  "Infosys",
  "Generic",
] as const;

export const MOCK_INTERVIEW_ROLES = [
  "SDE",
  "Backend Developer",
  "Frontend Developer",
  "Full Stack Developer",
] as const;

export const MOCK_INTERVIEW_DIFFICULTIES = [
  "easy",
  "medium",
  "hard",
  "mixed",
] as const;

export const MOCK_INTERVIEW_LANGUAGES = [
  "python",
  "javascript",
  "cpp",
  "java",
] as const;

export const MOCK_INTERVIEW_DURATIONS_MINUTES = [30, 45, 60, 90] as const;

export const MOCK_INTERVIEW_PROBLEM_COUNTS = [1, 2, 3, 4, 5] as const;

export const MOCK_INTERVIEW_TYPES = ["coding", "dsa", "mixed"] as const;

/**
 * Overall score weights — only available dimensions are renormalized.
 * Complexity is intentionally excluded (no analyzer in product).
 */
export const MOCK_INTERVIEW_SCORE_WEIGHTS = {
  correctness: 0.35,
  problemSolving: 0.25,
  timeManagement: 0.15,
  performance: 0.1,
  codeQuality: 0.1,
  completion: 0.05,
} as const;

export type MockInterviewScoreWeightKey = keyof typeof MOCK_INTERVIEW_SCORE_WEIGHTS;

export function getMockInterviewPublicConfig() {
  return {
    feature: MOCK_INTERVIEW_FEATURE,
    companies: [...MOCK_INTERVIEW_COMPANIES],
    roles: [...MOCK_INTERVIEW_ROLES],
    difficulties: [...MOCK_INTERVIEW_DIFFICULTIES],
    languages: [...MOCK_INTERVIEW_LANGUAGES],
    durationMinutes: [...MOCK_INTERVIEW_DURATIONS_MINUTES],
    problemCounts: [...MOCK_INTERVIEW_PROBLEM_COUNTS],
    interviewTypes: [...MOCK_INTERVIEW_TYPES],
    scoreWeights: { ...MOCK_INTERVIEW_SCORE_WEIGHTS },
    notes: {
      timer: "Server endsAt is authoritative; client countdown is display-only",
      scoring: "Scores use real judge signals only; complexity is unavailable",
      companySelection:
        "Company prefers published problems tagged with that company name",
    },
  };
}
