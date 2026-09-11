export type ProgrammingLanguage = "python" | "javascript" | "cpp" | "java";

export type EvaluationStatus =
  | "PENDING"
  | "RUNNING"
  | "ACCEPTED"
  | "WRONG_ANSWER"
  | "TIME_LIMIT_EXCEEDED"
  | "MEMORY_LIMIT_EXCEEDED"
  | "RUNTIME_ERROR"
  | "COMPILATION_ERROR";

export interface ITestcase {
  input: any;
  output?: string;
  expectedOutput?: string;
  isHidden?: boolean;
}

export interface EvaluationJobPayload {
  submissionId: string;
  problemId: string;
  code: string;
  language: ProgrammingLanguage;
  /** Official suite loaded server-side (public + hidden). Never trust client-supplied hidden cases. */
  testcases: ITestcase[];
  timeLimitMs?: number;
  memoryLimitMb?: number;
  userId?: string;
  userName?: string;
  userEmail?: string;
  mode?: "submit";
  problem?: {
    difficulty?: string;
    tags?: string[];
  };
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timeMs: number;
  memoryMb: number;
  timedOut: boolean;
}

export interface EvaluationProgress {
  testCasesPassed: number;
  totalTestCases: number;
  currentIndex: number;
}

export type StatusUpdater = (progress: EvaluationProgress) => Promise<void>;

export interface EvaluationResult {
  submissionId: string;
  status: EvaluationStatus;
  mode?: "submit";
  output?: string;
  error?: string;
  executionTimeMs: number;
  memoryMb: number;
  testCasesPassed: number;
  totalTestCases: number;
  /** True when the failing case was hidden — UI must not show I/O. */
  failedIsHidden?: boolean;
  failedTestCase?: {
    input: string;
    expectedOutput: string;
    actualOutput: string;
  };
}
