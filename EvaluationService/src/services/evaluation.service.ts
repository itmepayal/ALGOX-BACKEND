import {
  EvaluationJobPayload,
  EvaluationResult,
} from "../types/evaluation.type";
import { runCodeInDocker } from "../utils/containers/codeRunner.util";
import {
  DEFAULT_LIMITS,
  EVALUATION_STATUS,
  EVALUATION_MESSAGES,
} from "../utils/constants";
import logger from "../config/logger.config";

export class EvaluationService {
  async evaluateSubmission(
    job: EvaluationJobPayload
  ): Promise<EvaluationResult> {
    const {
      submissionId,
      code,
      language,
      testcases,
      timeLimitMs = DEFAULT_LIMITS.TIME_LIMIT_MS,
      memoryLimitMb = DEFAULT_LIMITS.MEMORY_LIMIT_MB,
    } = job;

    logger.info(`Starting evaluation for submission ${submissionId}`, {
      language,
      testcasesCount: testcases?.length || 0,
    });

    let totalExecutionTimeMs = 0;
    let maxMemoryMb = 0;
    let testCasesPassed = 0;

    if (!testcases || testcases.length === 0) {
      return {
        submissionId,
        status: EVALUATION_STATUS.WRONG_ANSWER,
        error: EVALUATION_MESSAGES.NO_TEST_CASES_PROVIDED,
        executionTimeMs: 0,
        memoryMb: 0,
        testCasesPassed: 0,
        totalTestCases: 0,
      };
    }

    for (let i = 0; i < testcases.length; i++) {
      const tc = testcases[i];

      try {
        const result = await runCodeInDocker({
          code,
          language,
          input: tc.input,
          timeLimitMs,
          memoryLimitMb,
        });

        totalExecutionTimeMs = Math.max(totalExecutionTimeMs, result.timeMs);
        maxMemoryMb = Math.max(maxMemoryMb, result.memoryMb);

        if (result.timedOut) {
          return {
            submissionId,
            status: EVALUATION_STATUS.TIME_LIMIT_EXCEEDED,
            error: EVALUATION_MESSAGES.TIME_LIMIT_EXCEEDED_MSG,
            executionTimeMs: timeLimitMs,
            memoryMb: maxMemoryMb,
            testCasesPassed,
            totalTestCases: testcases.length,
            failedTestCase: {
              input: tc.input,
              expectedOutput: tc.output,
              actualOutput: EVALUATION_MESSAGES.TIME_LIMIT_EXCEEDED_MSG,
            },
          };
        }

        if (result.exitCode !== 0) {
          const isCompilation =
            result.stderr.includes("error:") ||
            result.stderr.includes("SyntaxError") ||
            result.stderr.includes("Compilation failed") ||
            result.stderr.includes("g++") ||
            result.stderr.includes("javac");

          const errorMessage = result.stderr || result.stdout || EVALUATION_MESSAGES.RUNTIME_EXECUTION_ERROR;

          return {
            submissionId,
            status: isCompilation
              ? EVALUATION_STATUS.COMPILATION_ERROR
              : EVALUATION_STATUS.RUNTIME_ERROR,
            error: errorMessage,
            executionTimeMs: totalExecutionTimeMs,
            memoryMb: maxMemoryMb,
            testCasesPassed,
            totalTestCases: testcases.length,
          };
        }

        const normalizedActual = normalizeString(result.stdout);
        const normalizedExpected = normalizeString(tc.output);

        if (normalizedActual !== normalizedExpected) {
          return {
            submissionId,
            status: EVALUATION_STATUS.WRONG_ANSWER,
            output: result.stdout,
            executionTimeMs: totalExecutionTimeMs,
            memoryMb: maxMemoryMb,
            testCasesPassed,
            totalTestCases: testcases.length,
            failedTestCase: {
              input: tc.input,
              expectedOutput: tc.output,
              actualOutput: result.stdout,
            },
          };
        }

        testCasesPassed++;
      } catch (err: any) {
        logger.error(`Error executing testcase ${i + 1}`, {
          error: err.message,
        });

        return {
          submissionId,
          status: EVALUATION_STATUS.RUNTIME_ERROR,
          error: err.message,
          executionTimeMs: totalExecutionTimeMs,
          memoryMb: maxMemoryMb,
          testCasesPassed,
          totalTestCases: testcases.length,
        };
      }
    }

    return {
      submissionId,
      status: EVALUATION_STATUS.ACCEPTED,
      executionTimeMs: totalExecutionTimeMs,
      memoryMb: maxMemoryMb,
      testCasesPassed,
      totalTestCases: testcases.length,
    };
  }
}

function normalizeString(str: string): string {
  return str
    .replace(/\r\n/g, "\n")
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}
