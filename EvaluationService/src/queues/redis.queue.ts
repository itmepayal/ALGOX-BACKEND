import IORedis from "ioredis";
import { serverConfig } from "../config";
import logger from "../config/logger.config";

/**
 * BullMQ connection. Prefer QUEUE_REDIS_URL (dedicated noeviction Redis);
 * fall back to REDIS_URL for backwards compatibility.
 */
export const createQueueRedisConnection = () => {
  const url = serverConfig.QUEUE_REDIS_URL;
  const useTls = url.startsWith("rediss://");
  const connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 15000,
    retryStrategy: (times) => Math.min(times * 500, 5000),
    ...(useTls ? { tls: {} } : {}),
  });

  connection.on("error", (error) => {
    logger.error("Redis queue connection error", { error: error.message });
  });

  return connection;
};
