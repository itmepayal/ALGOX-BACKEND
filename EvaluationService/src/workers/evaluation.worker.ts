import { Worker } from "bullmq";
import logger from "../config/logger.config";
import { SUBMISSION_QUEUE } from "../utils/constants";
import { createQueueRedisConnection } from "../queues/redis.queue";
import { serverConfig } from "../config";
import { EvaluationService } from "../services/evaluation.service";
import { EvaluationJobPayload } from "../types/evaluation.type";

const evaluationService = new EvaluationService();

async function setupEvaluationWorker() {
  const worker = new Worker<EvaluationJobPayload>(
    SUBMISSION_QUEUE,
    async (job) => {
      logger.info(`Processing evaluation job ${job.id} for submission ${job.data.submissionId}`);

      const result = await evaluationService.evaluateSubmission(job.data);

      logger.info(`Evaluation completed for submission ${job.data.submissionId}: Status ${result.status}`, {
        result,
      });

      return result;
    },
    {
      connection: createQueueRedisConnection(),
      concurrency: 5,
    }
  );

  worker.on("completed", async (job, result) => {
    logger.info(`Job ${job.id} completed successfully. Result: ${result.status}`);

    try {
      const axios = require("axios");
      const jobData = job.data as any;

      axios.post("http://localhost:3007/api/v1/analytics/record-submission", {
        userId: jobData.userId || "anonymous",
        status: result.status,
        difficulty: jobData.problem?.difficulty?.toLowerCase() || "easy",
        topics: jobData.problem?.tags || [],
      }).catch(() => { });

      if (result.status === "ACCEPTED" && jobData.userId) {
        axios.post("http://localhost:3005/api/v1/leaderboard/record-solved", {
          userId: jobData.userId,
          userName: jobData.userName || "User",
          userEmail: jobData.userEmail || "user@leetcode.com",
          difficulty: jobData.problem?.difficulty?.toLowerCase() || "easy",
        }).catch(() => { });
      }

      axios.put(`${serverConfig.SUBMISSION_SERVICE}/submissions/${jobData.submissionId}`, {
        status: result.status,
        executionTime: result.executionTimeMs,
        memory: result.memoryMb,
        error: result.error || null,
      }).catch((err: any) => {
        logger.error("Failed to update submission status in SubmissionService", { error: err.message });
      });
    } catch {
    }
  });

  worker.on("failed", (job, err) => {
    logger.error(`Job ${job?.id} failed: ${err.message}`);
  });

  worker.on("error", (err) => {
    logger.error(`Worker error: ${err.message}`);
  });

  logger.info("Evaluation Worker started successfully with concurrency 5.");
}

export async function startWorkers() {
  await setupEvaluationWorker();
}
