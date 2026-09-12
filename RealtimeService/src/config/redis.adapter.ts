import type { Server as SocketIOServer } from "socket.io";
import logger from "./logger.config";
import { serverConfig } from ".";

export type RedisAdapterStatus = {
  enabled: boolean;
  reason?: string;
};

/**
 * Attach Socket.IO Redis adapter when REDIS_URL + ioredis are available.
 * Degrades gracefully to in-memory (single-node) otherwise.
 */
export async function tryAttachRedisAdapter(
  io: SocketIOServer
): Promise<RedisAdapterStatus> {
  if (!serverConfig.REDIS_URL) {
    logger.info("REDIS_URL unset — Socket.IO using in-memory adapter");
    return { enabled: false, reason: "REDIS_URL unset" };
  }

  try {
    // Dynamic require so missing optional deps don't crash cold start
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require("ioredis") as typeof import("ioredis");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAdapter } = require("@socket.io/redis-adapter") as typeof import("@socket.io/redis-adapter");

    const pubClient = new Redis(serverConfig.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    const subClient = pubClient.duplicate();

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));

    logger.info("Socket.IO Redis adapter attached");
    return { enabled: true };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "redis adapter init failed";
    logger.warn("Redis adapter unavailable — degrading to in-memory", {
      reason,
    });
    return { enabled: false, reason };
  }
}
