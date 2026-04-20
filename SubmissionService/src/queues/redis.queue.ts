import IORedis from "ioredis";
import { serverConfig } from "../config";

export const createQueueRedisConnection = () => {
  return new IORedis(serverConfig.REDIS_URL);
};
