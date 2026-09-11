import IORedis from "ioredis";
import { serverConfig } from "../config";
import logger from "../config/logger.config";

export const createQueueRedisConnection = () => {
  const useTls = serverConfig.REDIS_URL.startsWith("rediss://");
  const connection = new IORedis(serverConfig.REDIS_URL, {
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
