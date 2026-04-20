import { Queue } from "bullmq";
import { createQueueRedisConnection } from "../queues/redis.queue";
import logger from "../config/logger.config";

const connection = createQueueRedisConnection();

export const submissionQueue = new Queue("submission", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

submissionQueue.on("error", (error) => {
  logger.error("Submission queue error", { error: error.message });
});

submissionQueue.on("waiting", (jobId) => {
  logger.info(`Job is waiting in queue: ${jobId}`);
});
