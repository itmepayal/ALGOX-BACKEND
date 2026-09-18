/**
 * BullMQ requires Redis maxmemory-policy=noeviction.
 * Detect and report — never silently suppress BullMQ's warning.
 * Does not mutate Redis CONFIG (managed providers often forbid CONFIG SET).
 */
import type IORedis from "ioredis";
import logger from "../config/logger.config";

export type QueueRedisSafety = {
  policy: string | null;
  maxmemoryBytes: number | null;
  usedMemoryHuman: string | null;
  evictedKeys: number | null;
  ok: boolean;
  hostHint: string | null;
};

export async function inspectQueueRedisSafety(
  client: IORedis
): Promise<QueueRedisSafety> {
  const info = await client.info();
  const lines = info.split(/\r?\n/);
  const get = (prefix: string) => {
    const line = lines.find((l) => l.startsWith(prefix));
    return line ? line.slice(prefix.length) : null;
  };

  const policy = get("maxmemory_policy:");
  const maxmemoryBytes = Number(get("maxmemory:") || "") || null;
  const usedMemoryHuman = get("used_memory_human:");
  const evictedKeysRaw = get("evicted_keys:");
  const evictedKeys =
    evictedKeysRaw != null && evictedKeysRaw !== ""
      ? Number(evictedKeysRaw)
      : null;

  let hostHint: string | null = null;
  try {
    const opts = (client as any).options;
    hostHint = opts?.host || null;
  } catch {
    hostHint = null;
  }

  return {
    policy,
    maxmemoryBytes,
    usedMemoryHuman,
    evictedKeys,
    ok: policy === "noeviction",
    hostHint,
  };
}

export async function assertQueueRedisSafety(
  client: IORedis,
  serviceName: string
): Promise<QueueRedisSafety> {
  let safety: QueueRedisSafety;
  try {
    safety = await inspectQueueRedisSafety(client);
  } catch (err: any) {
    logger.warn(`[${serviceName}] Could not inspect Redis eviction policy`, {
      error: err?.message || String(err),
    });
    return {
      policy: null,
      maxmemoryBytes: null,
      usedMemoryHuman: null,
      evictedKeys: null,
      ok: false,
      hostHint: null,
    };
  }

  if (safety.ok) {
    logger.info(`[${serviceName}] Redis queue eviction policy OK (noeviction)`, {
      maxmemoryBytes: safety.maxmemoryBytes,
      usedMemoryHuman: safety.usedMemoryHuman,
    });
    return safety;
  }

  logger.error(
    `[${serviceName}] PRODUCTION RISK: Redis maxmemory_policy=${safety.policy || "unknown"} — BullMQ requires noeviction. Waiting/active/failed jobs (and locks) can be evicted under memory pressure, causing silent job loss or Missing lock errors.`,
    {
      policy: safety.policy,
      maxmemoryBytes: safety.maxmemoryBytes,
      usedMemoryHuman: safety.usedMemoryHuman,
      evictedKeys: safety.evictedKeys,
      hostHint: safety.hostHint,
      remediation: [
        "Use a dedicated Redis instance for BullMQ queues (not a cache DB).",
        "Set QUEUE_REDIS_URL to that instance (maxmemory-policy=noeviction).",
        "Set maxmemory-policy to noeviction (Upstash: create DB with Eviction disabled).",
        "Keep Upstash REST / cache Redis separate for rate-limit counters if needed.",
        "Do not suppress the BullMQ eviction warning.",
      ],
    }
  );

  const requireSafe =
    process.env.REQUIRE_REDIS_NOEVICTION === "true" ||
    (process.env.NODE_ENV === "production" &&
      process.env.ABORT_ON_UNSAFE_REDIS === "true");

  if (requireSafe) {
    throw new Error(
      `${serviceName}: Redis eviction policy must be noeviction for BullMQ (got ${safety.policy}). Set REQUIRE_REDIS_NOEVICTION=false only for non-production diagnostics.`
    );
  }

  return safety;
}
