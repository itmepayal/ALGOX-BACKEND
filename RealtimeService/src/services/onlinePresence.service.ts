import logger from "../config/logger.config";
import { getPresenceRedis, isPresenceRedisReady } from "../config/presenceRedis";
import { listOnlineUsers } from "../socket/presence";

/** Unique authenticated users currently online. */
export const ONLINE_USERS_KEY = "presence:online_users";

/** Per-user set of active socket ids (multi-tab). */
export function userSocketsKey(userId: string): string {
  return `presence:user_sockets:${userId}`;
}

/** Heartbeat / stale-socket TTL (seconds). */
export const PRESENCE_SOCKET_TTL_SEC = 90;

/**
 * Redis-backed unique-user presence with in-memory fallback.
 * Multi-tab: user stays online until their last socket is removed.
 */
export class OnlinePresenceService {
  /** Register a socket for a user. Returns current unique online count. */
  async addSocket(userId: string, socketId: string): Promise<number> {
    const redis = getPresenceRedis();
    if (redis && isPresenceRedisReady()) {
      try {
        const key = userSocketsKey(userId);
        await redis.sadd(key, socketId);
        await redis.expire(key, PRESENCE_SOCKET_TTL_SEC);
        await redis.sadd(ONLINE_USERS_KEY, userId);
        return await redis.scard(ONLINE_USERS_KEY);
      } catch (err: any) {
        logger.warn("presence.addSocket redis failed — memory fallback", {
          error: err?.message || err,
        });
      }
    }
    return listOnlineUsers().length;
  }

  /** Remove a socket. Drops user from online set only when last tab closes. */
  async removeSocket(userId: string, socketId: string): Promise<number> {
    const redis = getPresenceRedis();
    if (redis && isPresenceRedisReady()) {
      try {
        const key = userSocketsKey(userId);
        await redis.srem(key, socketId);
        const remaining = await redis.scard(key);
        if (remaining <= 0) {
          await redis.del(key);
          await redis.srem(ONLINE_USERS_KEY, userId);
        }
        return await redis.scard(ONLINE_USERS_KEY);
      } catch (err: any) {
        logger.warn("presence.removeSocket redis failed — memory fallback", {
          error: err?.message || err,
        });
      }
    }
    return listOnlineUsers().length;
  }

  /** Refresh TTL so ghost sockets expire if disconnect is missed. */
  async heartbeat(userId: string): Promise<void> {
    const redis = getPresenceRedis();
    if (!redis || !isPresenceRedisReady()) return;
    try {
      await redis.expire(userSocketsKey(userId), PRESENCE_SOCKET_TTL_SEC);
    } catch (err: any) {
      logger.warn("presence.heartbeat failed", { error: err?.message || err });
    }
  }

  /**
   * Unique online user count.
   * Returns null only when Redis is configured but currently unreachable
   * AND memory has no connections (hard unavailable).
   */
  async getOnlineCount(): Promise<number> {
    const redis = getPresenceRedis();
    if (redis && isPresenceRedisReady()) {
      try {
        // Opportunistic cleanup of users whose socket sets expired
        await this.cleanupStaleUsers();
        return await redis.scard(ONLINE_USERS_KEY);
      } catch (err: any) {
        logger.warn("presence.getOnlineCount redis failed — memory fallback", {
          error: err?.message || err,
        });
      }
    }
    return listOnlineUsers().length;
  }

  /** Remove userIds from the online set when their socket SET is gone. */
  async cleanupStaleUsers(): Promise<void> {
    const redis = getPresenceRedis();
    if (!redis || !isPresenceRedisReady()) return;
    try {
      const members = await redis.smembers(ONLINE_USERS_KEY);
      if (!members.length) return;
      for (const userId of members) {
        const exists = await redis.exists(userSocketsKey(userId));
        if (!exists) {
          await redis.srem(ONLINE_USERS_KEY, userId);
        }
      }
    } catch (err: any) {
      logger.warn("presence.cleanupStaleUsers failed", {
        error: err?.message || err,
      });
    }
  }
}

export const onlinePresenceService = new OnlinePresenceService();
