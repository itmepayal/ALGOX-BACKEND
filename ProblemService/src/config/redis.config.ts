import Redis from "ioredis";
import logger from "./logger.config";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let redisClient: Redis | null = null;
let isRedisAvailable = false;

const inMemoryQueue = new Map<string, { entry: any; expiresAt: number }>();

export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;
  try {
    const client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: (times) => (times > 3 ? null : 200),
    });

    client.on("connect", () => {
      isRedisAvailable = true;
      logger.info("Redis connected in ProblemService for Quick Matchmaking");
    });

    client.on("error", (err) => {
      isRedisAvailable = false;
      logger.warn("Redis unavailable in ProblemService — using in-memory queue fallback", {
        message: err.message,
      });
    });

    client.connect().catch(() => {
      isRedisAvailable = false;
    });

    redisClient = client;
    return client;
  } catch {
    isRedisAvailable = false;
    return null;
  }
}

export function isRedisConnected(): boolean {
  return isRedisAvailable && redisClient?.status === "ready";
}

export const memoryQueueStore = inMemoryQueue;
