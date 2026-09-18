import {
  EvaluationJobPayload,
  EvaluationResult,
  StatusUpdater,
} from "../types/evaluation.type";
import { runCodeInDocker } from "../utils/containers/codeRunner.util";
import {
  DEFAULT_LIMITS,
  EVALUATION_STATUS,
  EVALUATION_MESSAGES,
} from "../utils/constants";
import logger from "../config/logger.config";
import { outputsMatch } from "../execution/compareOutputs";
import type { JudgeMeta } from "../execution/types";

function extractJudgeMeta(job: EvaluationJobPayload): JudgeMeta {
  const p = job.problem || {};
  const functionName = job.functionName || p.functionName || undefined;
  // LeetCode-style problems set functionName → function harness.
  // Stdin/stdout problems leave it unset → adapters detect "program" mode.
  return {
    functionName,
    className: job.className || p.className || "Solution",
    returnType: job.returnType || p.returnType,
    parameters: (job.parameters || p.parameters) as JudgeMeta["parameters"],
    executionMode: functionName ? "function" : undefined,
  };
}

export class EvaluationService {
  /**
   * Full-judge path for SUBMIT only.
   * Expects official public+hidden testcases loaded by SubmissionService from ProblemService internal API.
   */
  async evaluateSubmission(
    job: EvaluationJobPayload,
    onProgress?: StatusUpdater
  ): Promise<EvaluationResult> {
    const {
      submissionId,
      code,
      language,
      testcases,
      timeLimitMs = DEFAULT_LIMITS.TIME_LIMIT_MS,
      memoryLimitMb = DEFAULT_LIMITS.MEMORY_LIMIT_MB,
    } = job;

    const meta = extractJudgeMeta(job);

    logger.info(`[Execution] submission received`, {
      submissionId,
      language,
      mode: "submit",
      functionName: meta.functionName,
      testcasesCount: testcases?.length || 0,
      hiddenCount: (testcases || []).filter((t) => t.isHidden).length,
    });

    let totalExecutionTimeMs = 0;
    let maxMemoryMb = 0;
    let testCasesPassed = 0;

    if (!testcases || testcases.length === 0) {
      return {
        submissionId,
        mode: "submit",
        status: EVALUATION_STATUS.WRONG_ANSWER,
        error: EVALUATION_MESSAGES.NO_TEST_CASES_PROVIDED,
        executionTimeMs: 0,
        memoryMb: 0,
        testCasesPassed: 0,
        totalTestCases: 0,
      };
    }

    const total = testcases.length;

    for (let i = 0; i < testcases.length; i++) {
      const tc = testcases[i] as {
        input: unknown;
        expectedOutput?: string;
        output?: string;
        isHidden?: boolean;
      };
      const isHidden = Boolean(tc.isHidden);
      const stdin = formatJudgeInput(tc.input);
      const expected = String(tc.expectedOutput ?? tc.output ?? "");

      if (onProgress) {
        try {
          await onProgress({
            testCasesPassed,
            totalTestCases: total,
            currentIndex: i,
          });
        } catch {
          // progress updates are best-effort
        }
      }

      try {
        logger.info(`[Execution] executing testcase=${i + 1}/${total}`, {
          submissionId,
          isHidden,
        });

        const result = await runCodeInDocker({
          code,
          language,
          input: stdin,
          timeLimitMs,
          memoryLimitMb,
          meta,
        });

        totalExecutionTimeMs = Math.max(totalExecutionTimeMs, result.timeMs);
        maxMemoryMb = Math.max(maxMemoryMb, result.memoryMb);

        const fail = (
          status: EvaluationResult["status"],
          error: string,
          actualOutput: string
        ): EvaluationResult => ({
          submissionId,
          mode: "submit",
          status,
          error: isHidden
            ? status === EVALUATION_STATUS.WRONG_ANSWER
              ? "One or more hidden test cases failed."
              : error
            : error,
          executionTimeMs:
            status === EVALUATION_STATUS.TIME_LIMIT_EXCEEDED
              ? timeLimitMs
              : totalExecutionTimeMs,
          memoryMb: maxMemoryMb || memoryLimitMb,
          testCasesPassed,
          totalTestCases: total,
          failedIsHidden: isHidden,
          ...(isHidden
            ? {}
            : {
                failedTestCase: {
                  input: stdin,
                  expectedOutput: expected,
                  actualOutput,
                },
                output: actualOutput,
              }),
        });

        if (result.timedOut) {
          return fail(
            EVALUATION_STATUS.TIME_LIMIT_EXCEEDED,
            EVALUATION_MESSAGES.TIME_LIMIT_EXCEEDED_MSG,
            EVALUATION_MESSAGES.TIME_LIMIT_EXCEEDED_MSG
          );
        }

        if (result.exitCode !== 0) {
          if (result.exitCode === 137) {
            return fail(
              EVALUATION_STATUS.MEMORY_LIMIT_EXCEEDED,
              result.stderr || "Memory Limit Exceeded",
              result.stderr || "Memory Limit Exceeded"
            );
          }

          const isCompilation =
            result.exitCode === 99 ||
            result.stderr.includes("error:") ||
            result.stderr.includes("SyntaxError") ||
            result.stderr.includes("Compilation failed") ||
            /cannot find symbol|error: /.test(result.stderr);

          const errorMessage =
            result.stderr ||
            result.stdout ||
            EVALUATION_MESSAGES.RUNTIME_EXECUTION_ERROR;

          return fail(
            isCompilation
              ? EVALUATION_STATUS.COMPILATION_ERROR
              : EVALUATION_STATUS.RUNTIME_ERROR,
            errorMessage,
            errorMessage
          );
        }

        if (!outputsMatch(result.stdout, expected)) {
          logger.info(`[Execution] testcase_failed`, { index: i + 1, isHidden });
          return fail(
            EVALUATION_STATUS.WRONG_ANSWER,
            isHidden
              ? "One or more hidden test cases failed."
              : "Wrong Answer",
            result.stdout
          );
        }

        logger.info(`[Execution] testcase_passed`, { index: i + 1 });
        testCasesPassed++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Error executing testcase ${i + 1}`, {
          error: message,
          isHidden,
        });

        return {
          submissionId,
          mode: "submit",
          status: EVALUATION_STATUS.RUNTIME_ERROR,
          error: isHidden
            ? "Runtime error on a hidden test case."
            : message,
          executionTimeMs: totalExecutionTimeMs,
          memoryMb: maxMemoryMb,
          testCasesPassed,
          totalTestCases: total,
          failedIsHidden: isHidden,
        };
      }
    }

    logger.info(`[Execution] execution_complete ACCEPTED`, {
      submissionId,
      testCasesPassed,
      total,
    });

    return {
      submissionId,
      mode: "submit",
      status: EVALUATION_STATUS.ACCEPTED,
      executionTimeMs: totalExecutionTimeMs,
      memoryMb: maxMemoryMb,
      testCasesPassed,
      totalTestCases: total,
    };
  }
}

/** Convert DB/API testcase input into stdin for language runners. */
export function formatJudgeInput(input: unknown): string {
  if (input === null || input === undefined) return "";

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return "";
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return formatJudgeInput(parsed);
      }
    } catch {
      // legacy raw stdin
    }
    return trimmed;
  }

  if (Array.isArray(input)) {
    return JSON.stringify(input);
  }

  if (typeof input === "object") {
    return Object.values(input as Record<string, unknown>)
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .join("\n");
  }

  return String(input);
}
