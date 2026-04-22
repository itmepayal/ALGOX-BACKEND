import { Worker } from "bullmq";
import logger from "../config/logger.config";
import { SUBMISSION_QUEUE } from "../utils/constants";
import { createQueueRedisConnection } from "../queues/redis.queue";

async function setupEvaluationWorker() {
  const worker = new Worker(
    SUBMISSION_QUEUE,
    async (job) => {
      logger.info(`Processing job ${job.id}`);

      return true;
    },
    {
      connection: createQueueRedisConnection(),
    },
  );

  worker.on("completed", (job) => {
    logger.info(`Job ${job.id} completed successfully`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`Job ${job?.id} failed: ${err.message}`);
  });

  worker.on("error", (err) => {
    logger.error(`Worker error: ${err.message}`);
  });

  logger.info("Worker started successfully.");
}

export async function startWorkers() {
  await setupEvaluationWorker();
}
