import { Worker } from "bullmq";
import logger from "../config/logger.config";
import { SUBMISSION_QUEUE } from "../utils/constants";
import { createQueueRedisConnection } from "../queues/redis.queue";
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

  worker.on("completed", (job, result) => {
    logger.info(`Job ${job.id} completed successfully. Result: ${result.status}`);
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

