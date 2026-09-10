export const SUBMISSION_QUEUE = "submission";

export const DOCKER_IMAGES = {
  python: "python:3.10-slim",
  javascript: "node:18-alpine",
  cpp: "gcc:latest",
  java: "eclipse-temurin:17-alpine",
} as const;

export const DEFAULT_LIMITS = {
  TIME_LIMIT_MS: 2000,
  MEMORY_LIMIT_MB: 256,
  CONCURRENCY_WORKERS: 5,
  COMPILE_TIMEOUT_MS: 5000,
} as const;

export const DOCKER_CONTAINER_CONFIG = {
  PIDS_LIMIT: 100,
  CPU_QUOTA: 50000,
  CPU_PERIOD: 100000,
  SECURITY_OPT: ["no-new-privileges"],
  NETWORK_MODE: "none",
} as const;

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const EVALUATION_STATUS = {
  ACCEPTED: "ACCEPTED",
  WRONG_ANSWER: "WRONG_ANSWER",
  TIME_LIMIT_EXCEEDED: "TIME_LIMIT_EXCEEDED",
  MEMORY_LIMIT_EXCEEDED: "MEMORY_LIMIT_EXCEEDED",
  RUNTIME_ERROR: "RUNTIME_ERROR",
  COMPILATION_ERROR: "COMPILATION_ERROR",
} as const;

export const EVALUATION_MESSAGES = {
  CODE_EXECUTED_SUCCESS: "Code executed successfully",
  SUBMISSION_EVALUATED_SUCCESS: "Submission evaluated successfully",
  SERVICE_HEALTHY: "EvaluationService is healthy",
  NO_TEST_CASES_PROVIDED: "No test cases provided for problem",
  TIME_LIMIT_EXCEEDED_MSG: "Time Limit Exceeded",
  RUNTIME_EXECUTION_ERROR: "Runtime Execution Error",
  UNSUPPORTED_LANGUAGE: "Unsupported programming language",
} as const;

