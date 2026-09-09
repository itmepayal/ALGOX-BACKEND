import IORedis from "ioredis";
import { serverConfig } from "../config";

export const createQueueRedisConnection = () => {
  const useTls = serverConfig.REDIS_URL.startsWith("rediss://");
  return new IORedis(serverConfig.REDIS_URL, {
    maxRetriesPerRequest: null,
    ...(useTls ? { tls: {} } : {}),
  });
};
