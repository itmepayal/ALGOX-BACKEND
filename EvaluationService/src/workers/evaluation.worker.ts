import { Worker, Job } from "bullmq";
import axios from "axios";
import logger from "../config/logger.config";
import { SUBMISSION_QUEUE } from "../utils/constants";
import { createQueueRedisConnection } from "../queues/redis.queue";
import { serverConfig } from "../config";
import { EvaluationService } from "../services/evaluation.service";
import {
  EvaluationJobPayload,
  EvaluationResult,
} from "../types/evaluation.type";
import {
  classifyDownstreamError,
  postDownstreamBestEffort,
} from "../utils/downstreamFanout.util";

const evaluationService = new EvaluationService();

async function updateSubmissionResult(
  submissionId: string,
  result: Partial<EvaluationResult> & {
    status: string;
    testCasesPassed?: number;
    totalTestCases?: number;
  }
) {
  const payload: Record<string, unknown> = {
    status: result.status,
  };

  if (result.executionTimeMs !== undefined) {
    payload.executionTime = result.executionTimeMs;
  }
  if (result.memoryMb !== undefined) {
    payload.memory = result.memoryMb;
  }
  if (result.testCasesPassed !== undefined) {
    payload.testCasesPassed = result.testCasesPassed;
  }
  if (result.totalTestCases !== undefined) {
    payload.totalTestCases = result.totalTestCases;
  }

  if (result.error) payload.error = result.error;

  // Never leak hidden testcase I/O into the stored submission
  if (result.failedIsHidden) {
    payload.output = undefined;
    if (!payload.error) {
      payload.error = "One or more hidden test cases failed.";
    }
  } else if (result.failedTestCase) {
    payload.output = [
      `Input: ${result.failedTestCase.input}`,
      `Expected: ${result.failedTestCase.expectedOutput}`,
      `Output: ${result.failedTestCase.actualOutput}`,
    ].join("\n");
  } else if (result.output !== undefined) {
    payload.output = result.output;
  }

  const url = `${serverConfig.SUBMISSION_SERVICE}/submissions/internal/${submissionId}`;
  await axios.put(url, payload, {
    timeout: 10000,
    headers: {
      "x-internal-secret": serverConfig.INTERNAL_SERVICE_SECRET,
    },
  });
}

/**
 * Post-verdict fan-out. Must never throw into the job lifecycle —
 * SubmissionService already holds the final verdict.
 */
async function fanOutAfterJudgement(
  job: Job<EvaluationJobPayload>,
  result: EvaluationResult
): Promise<void> {
  const jobData = job.data;
  const submissionId = jobData.submissionId;
  const jobId = job.id;

  const tasks: Promise<void>[] = [
    postDownstreamBestEffort({
      service: "AnalyticsService",
      operation: "record-submission",
      url: `${serverConfig.ANALYTICS_SERVICE}/analytics/record-submission`,
      submissionId,
      jobId,
      body: {
        userId: jobData.userId || "anonymous",
        status: result.status,
        difficulty: jobData.problem?.difficulty?.toLowerCase() || "easy",
        topics: jobData.problem?.tags || [],
        problemId: jobData.problemId || undefined,
      },
    }),
  ];

  if (result.status === "ACCEPTED" && jobData.userId) {
    tasks.push(
      postDownstreamBestEffort({
        service: "LeaderboardService",
        operation: "record-solved",
        url: `${serverConfig.LEADERBOARD_SERVICE}/leaderboard/record-solved`,
        submissionId,
        jobId,
        body: {
          userId: jobData.userId,
          userName: jobData.userName || "User",
          userEmail: jobData.userEmail || "user@leetcode.com",
          difficulty: jobData.problem?.difficulty?.toLowerCase() || "easy",
          problemId: jobData.problemId || undefined,
        },
      })
    );

    if (jobData.contestId && jobData.submissionId && jobData.problemId) {
      tasks.push(
        postDownstreamBestEffort({
          service: "ProblemService",
          operation: "contest-record-submission",
          url: `${serverConfig.PROBLEM_SERVICE}/contests/internal/${jobData.contestId}/record-submission`,
          submissionId,
          jobId,
          body: {
            submissionId: jobData.submissionId,
            userId: jobData.userId,
            problemId: jobData.problemId,
          },
        })
      );
    }

    // Spaced repetition: seed/update card on official ACCEPTED (idempotent)
    if (jobData.problemId) {
      tasks.push(
        postDownstreamBestEffort({
          service: "ProblemService",
          operation: "srs-seed-on-solve",
          url: `${serverConfig.PROBLEM_SERVICE}/internal/srs/seed-on-solve`,
          submissionId,
          jobId,
          body: {
            userId: jobData.userId,
            problemId: jobData.problemId,
            difficulty: jobData.problem?.difficulty?.toLowerCase() || undefined,
          },
        })
      );
    }

    // Daily challenge: reuse ProblemService qualifyInternal (idempotent; problem must match today)
    if (jobData.problemId && jobData.submissionId) {
      tasks.push(
        postDownstreamBestEffort({
          service: "ProblemService",
          operation: "challenge-qualify",
          url: `${serverConfig.PROBLEM_SERVICE}/internal/challenges/qualify`,
          submissionId,
          jobId,
          body: {
            userId: jobData.userId,
            problemId: jobData.problemId,
            submissionId: jobData.submissionId,
          },
        })
      );
    }
  }

  // Study session: any official submit counts as attempted; ACCEPTED also marks solved.
  // No-op when the user has no active session. Idempotent on problemId sets.
  if (jobData.userId && jobData.problemId) {
    tasks.push(
      postDownstreamBestEffort({
        service: "ProblemService",
        operation: "learning-session-activity",
        url: `${serverConfig.PROBLEM_SERVICE}/internal/learning/session-activity`,
        submissionId,
        jobId,
        body: {
          userId: jobData.userId,
          problemId: jobData.problemId,
          solved: result.status === "ACCEPTED",
        },
      })
    );
  }

  // Mock interview: record every final verdict (real judge signals) — not only ACCEPTED
  if (
    jobData.mockInterviewSessionId &&
    jobData.submissionId &&
    jobData.problemId &&
    jobData.userId
  ) {
    tasks.push(
      postDownstreamBestEffort({
        service: "ProblemService",
        operation: "interview-record-submission",
        url: `${serverConfig.PROBLEM_SERVICE}/internal/interviews/${jobData.mockInterviewSessionId}/record-submission`,
        submissionId,
        jobId,
        body: {
          submissionId: jobData.submissionId,
          userId: jobData.userId,
          problemId: jobData.problemId,
          status: result.status,
          testCasesPassed: result.testCasesPassed,
          totalTestCases: result.totalTestCases,
          executionTimeMs: result.executionTimeMs,
          memoryMb: result.memoryMb,
          language: jobData.language,
          source: "submit",
        },
      })
    );
  }

  // Virtual contest: record every final verdict (no rating impact)
  if (
    jobData.virtualContestSessionId &&
    jobData.submissionId &&
    jobData.problemId &&
    jobData.userId
  ) {
    tasks.push(
      postDownstreamBestEffort({
        service: "ProblemService",
        operation: "virtual-contest-record-submission",
        url: `${serverConfig.PROBLEM_SERVICE}/internal/virtual-contests/${jobData.virtualContestSessionId}/record-submission`,
        submissionId,
        jobId,
        body: {
          submissionId: jobData.submissionId,
          userId: jobData.userId,
          problemId: jobData.problemId,
          status: result.status,
          testCasesPassed: result.testCasesPassed,
          totalTestCases: result.totalTestCases,
        },
      })
    );
  }

  await Promise.allSettled(tasks);
}

async function setupEvaluationWorker() {
  const worker = new Worker<EvaluationJobPayload>(
    SUBMISSION_QUEUE,
    async (job) => {
      const { submissionId } = job.data;
      logger.info(
        `SUBMIT job ${job.id} — judging submission ${submissionId} with ${job.data.testcases?.length || 0} official testcases`
      );

      // Mark running — best-effort; do not abort judging if this fails
      try {
        await updateSubmissionResult(submissionId, {
          status: "RUNNING",
          testCasesPassed: 0,
          totalTestCases: job.data.testcases?.length || 0,
        });
      } catch (err: unknown) {
        const classified = classifyDownstreamError(err);
        logger.warn("Failed to mark submission RUNNING", {
          downstreamService: "SubmissionService",
          operation: "mark-running",
          submissionId,
          jobId: job.id,
          errorClassification: classified.classification,
          errorMessage: classified.message,
          statusCode: classified.statusCode,
        });
      }

      const result = await evaluationService.evaluateSubmission(
        { ...job.data, mode: "submit" },
        async (progress) => {
          try {
            await updateSubmissionResult(submissionId, {
              status: "RUNNING",
              testCasesPassed: progress.testCasesPassed,
              totalTestCases: progress.totalTestCases,
            });
          } catch (err: unknown) {
            const classified = classifyDownstreamError(err);
            logger.warn("Failed to update submission progress", {
              downstreamService: "SubmissionService",
              operation: "progress-update",
              submissionId,
              jobId: job.id,
              errorClassification: classified.classification,
              errorMessage: classified.message,
              statusCode: classified.statusCode,
            });
          }
        }
      );

      try {
        await updateSubmissionResult(submissionId, result);
      } catch (err: unknown) {
        const classified = classifyDownstreamError(err);
        logger.error("Failed to persist final verdict in SubmissionService", {
          downstreamService: "SubmissionService",
          operation: "persist-verdict",
          submissionId,
          jobId: job.id,
          errorClassification: classified.classification,
          errorMessage: classified.message,
          statusCode: classified.statusCode,
        });
        throw err;
      }

      logger.info(
        `Submit judged ${submissionId}: ${result.status} (${result.testCasesPassed}/${result.totalTestCases})`
      );

      return result;
    },
    {
      connection: createQueueRedisConnection(),
      concurrency: 5,
    }
  );

  worker.on("completed", (job, result) => {
    logger.info(`Job ${job.id} completed. Result: ${result.status}`);

    // Fan-out is observational + best-effort; never re-throw into BullMQ.
    void fanOutAfterJudgement(job, result).catch((err: unknown) => {
      const classified = classifyDownstreamError(err);
      logger.error("Downstream fan-out unexpected failure", {
        operation: "fan-out-orchestrator",
        submissionId: job.data?.submissionId,
        jobId: job.id,
        errorClassification: classified.classification,
        errorMessage: classified.message,
      });
    });
  });

  worker.on("failed", async (job, err) => {
    logger.error(`Job ${job?.id} failed: ${err.message}`);
    const submissionId = job?.data?.submissionId;
    if (!submissionId) return;
    try {
      await updateSubmissionResult(submissionId, {
        status: "RUNTIME_ERROR",
        error: err.message || "Evaluation worker failed",
      });
    } catch (updateErr: unknown) {
      const classified = classifyDownstreamError(updateErr);
      logger.error("Failed to mark submission as failed", {
        downstreamService: "SubmissionService",
        operation: "mark-failed",
        submissionId,
        jobId: job?.id,
        errorClassification: classified.classification,
        errorMessage: classified.message,
        statusCode: classified.statusCode,
      });
    }
  });

  worker.on("error", (err) => {
    logger.error(`Worker error: ${err.message}`);
  });

  logger.info("Evaluation Worker started successfully with concurrency 5.");
}

export async function startWorkers() {
  await setupEvaluationWorker();
}
