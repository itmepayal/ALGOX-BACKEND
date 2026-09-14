import type Redis from "ioredis";
import logger from "./logger.config";
import { serverConfig } from ".";

/**
 * Dedicated Redis client for presence SETs.
 * Separate from Socket.IO adapter clients so presence works even when adapter fails.
 */
let presenceRedis: Redis | null = null;
let presenceRedisReady = false;

export function isPresenceRedisReady(): boolean {
  return presenceRedisReady && Boolean(presenceRedis);
}

export function getPresenceRedis(): Redis | null {
  return presenceRedisReady ? presenceRedis : null;
}

export async function initPresenceRedis(): Promise<{
  enabled: boolean;
  reason?: string;
}> {
  if (!serverConfig.REDIS_URL) {
    logger.info(
      "Presence Redis disabled — REDIS_URL unset (using in-memory unique users)"
    );
    return { enabled: false, reason: "REDIS_URL unset" };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis: RedisCtor } = require("ioredis") as typeof import("ioredis");
    const useTls = serverConfig.REDIS_URL.startsWith("rediss://");

    const client = new RedisCtor(serverConfig.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      connectTimeout: 15000,
      retryStrategy: (times: number) => Math.min(times * 500, 5000),
      ...(useTls ? { tls: {} } : {}),
    });

    client.on("error", (err) => {
      presenceRedisReady = false;
      logger.warn("Presence Redis error", { error: err.message });
    });
    client.on("ready", () => {
      presenceRedisReady = true;
      logger.info("Presence Redis ready");
    });
    client.on("end", () => {
      presenceRedisReady = false;
    });

    // Wait until ready or timeout
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Presence Redis ready timeout")),
        15000
      );
      if (client.status === "ready") {
        clearTimeout(timer);
        resolve();
        return;
      }
      client.once("ready", () => {
        clearTimeout(timer);
        resolve();
      });
      client.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    await client.ping();
    presenceRedis = client;
    presenceRedisReady = true;
    return { enabled: true };
  } catch (error) {
    presenceRedis = null;
    presenceRedisReady = false;
    const reason =
      error instanceof Error ? error.message : "presence redis init failed";
    logger.warn("Presence Redis unavailable — in-memory unique-user fallback", {
      reason,
    });
    return { enabled: false, reason };
  }
}
