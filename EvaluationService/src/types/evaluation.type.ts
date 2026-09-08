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
  input: string;
  output: string;
  isHidden?: boolean;
}

export interface EvaluationJobPayload {
  submissionId: string;
  problemId: string;
  code: string;
  language: ProgrammingLanguage;
  testcases: ITestcase[];
  timeLimitMs?: number;
  memoryLimitMb?: number;
  userId?: string;
  userName?: string;
  userEmail?: string;
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

export interface EvaluationResult {
  submissionId: string;
  status: EvaluationStatus;
  output?: string;
  error?: string;
  executionTimeMs: number;
  memoryMb: number;
  testCasesPassed: number;
  totalTestCases: number;
  failedTestCase?: {
    input: string;
    expectedOutput: string;
    actualOutput: string;
  };
}
