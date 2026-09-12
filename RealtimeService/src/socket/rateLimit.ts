import type { Socket } from "socket.io";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Max events in the window */
  max: number;
  /** Window length in ms */
  windowMs: number;
}

const DEFAULTS: RateLimitOptions = { max: 60, windowMs: 10_000 };

/**
 * Per-socket sliding window rate limit for inbound events.
 * Returns true if allowed; false if limited.
 */
export function checkSocketRateLimit(
  socket: Socket,
  eventName: string,
  opts: RateLimitOptions = DEFAULTS
): boolean {
  const key = `${socket.id}:${eventName}`;
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 1, resetAt: now + opts.windowMs };
    buckets.set(key, bucket);
    return true;
  }

  if (bucket.count >= opts.max) {
    return false;
  }

  bucket.count += 1;
  return true;
}

/** Clear buckets for a disconnected socket. */
export function clearSocketRateLimits(socketId: string): void {
  for (const key of buckets.keys()) {
    if (key.startsWith(`${socketId}:`)) buckets.delete(key);
  }
}

/** Wrap a handler with rate limiting. */
export function withRateLimit<T extends unknown[]>(
  socket: Socket,
  eventName: string,
  handler: (...args: T) => void | Promise<void>,
  opts?: RateLimitOptions
) {
  return async (...args: T) => {
    if (!checkSocketRateLimit(socket, eventName, opts)) {
      socket.emit("security.rate_limit", {
        event: eventName,
        message: "Too many events; slow down",
      });
      return;
    }
    await handler(...args);
  };
}
