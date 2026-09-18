import { Queue } from "bullmq";
import { createQueueRedisConnection } from "../queues/redis.queue";
import logger from "../config/logger.config";
import {
  assertQueueRedisSafety,
  type QueueRedisSafety,
} from "./queueRedisSafety";

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

let cachedSafety: QueueRedisSafety | null = null;

export async function ensureQueueRedisSafety(): Promise<QueueRedisSafety> {
  cachedSafety = await assertQueueRedisSafety(connection, "SubmissionService");
  return cachedSafety;
}

export function getCachedQueueRedisSafety(): QueueRedisSafety | null {
  return cachedSafety;
}
