import { Worker } from "bullmq";
import axios from "axios";
import logger from "../config/logger.config";
import { SUBMISSION_QUEUE } from "../utils/constants";
import { createQueueRedisConnection } from "../queues/redis.queue";
import { serverConfig } from "../config";
import { EvaluationService } from "../services/evaluation.service";
import { EvaluationJobPayload, EvaluationResult } from "../types/evaluation.type";

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

  const url = `${serverConfig.SUBMISSION_SERVICE}/submissions/${submissionId}`;
  await axios.put(url, payload, { timeout: 10000 });
}

async function setupEvaluationWorker() {
  const worker = new Worker<EvaluationJobPayload>(
    SUBMISSION_QUEUE,
    async (job) => {
      const { submissionId } = job.data;
      logger.info(
        `SUBMIT job ${job.id} — judging submission ${submissionId} with ${job.data.testcases?.length || 0} official testcases`
      );

      // Mark running
      try {
        await updateSubmissionResult(submissionId, {
          status: "RUNNING",
          testCasesPassed: 0,
          totalTestCases: job.data.testcases?.length || 0,
        });
      } catch {
        // ignore
      }

      const result = await evaluationService.evaluateSubmission(
        { ...job.data, mode: "submit" },
        async (progress) => {
          await updateSubmissionResult(submissionId, {
            status: "RUNNING",
            testCasesPassed: progress.testCasesPassed,
            totalTestCases: progress.totalTestCases,
          });
        }
      );

      try {
        await updateSubmissionResult(submissionId, result);
      } catch (err: any) {
        logger.error("Failed to update submission status in SubmissionService", {
          error: err.message,
          submissionId,
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

  worker.on("completed", async (job, result) => {
    logger.info(`Job ${job.id} completed. Result: ${result.status}`);

    try {
      const jobData = job.data as any;

      axios
        .post("http://localhost:3007/api/v1/analytics/record-submission", {
          userId: jobData.userId || "anonymous",
          status: result.status,
          difficulty: jobData.problem?.difficulty?.toLowerCase() || "easy",
          topics: jobData.problem?.tags || [],
        })
        .catch(() => {});

      if (result.status === "ACCEPTED" && jobData.userId) {
        axios
          .post("http://localhost:3005/api/v1/leaderboard/record-solved", {
            userId: jobData.userId,
            userName: jobData.userName || "User",
            userEmail: jobData.userEmail || "user@leetcode.com",
            difficulty: jobData.problem?.difficulty?.toLowerCase() || "easy",
          })
          .catch(() => {});
      }
    } catch {
      // analytics/leaderboard are best-effort
    }
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
    } catch (updateErr: any) {
      logger.error("Failed to mark submission as failed", {
        error: updateErr.message,
        submissionId,
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
