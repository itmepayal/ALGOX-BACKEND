/**
 * Focused rate-limit middleware checks (memory + Redis).
 * Run: npx ts-node src/middlewares/rateLimit.selftest.ts
 */
import redis from "../config/redis.config";
import {
  adminMutationRateLimit,
  authSensitiveRateLimit,
  checkRateLimit,
  checkRateLimitAsync,
  clearRateLimitBuckets,
} from "./rateLimit.middleware";

async function runMw(
  mw: (req: any, res: any, next: () => void) => unknown,
  req: any
): Promise<number> {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      json() {
        resolve(this.statusCode);
      },
    } as any;
    void Promise.resolve(mw(req, res, () => resolve(200)));
  });
}

async function main() {
  let passed = 0;
  const check = (name: string, ok: boolean) => {
    if (!ok) {
      console.error("FAIL:", name);
      process.exitCode = 1;
      return;
    }
    console.log("PASS:", name);
    passed += 1;
  };

  clearRateLimitBuckets();
  const opts = { max: 2, windowMs: 60_000 };
  check("allow 1", checkRateLimit("t", opts) === true);
  check("allow 2", checkRateLimit("t", opts) === true);
  check("limit 3", checkRateLimit("t", opts) === false);

  clearRateLimitBuckets();
  const mw = adminMutationRateLimit(opts);
  const c1 = await runMw(mw, {
    method: "PATCH",
    user: { userId: "u1" },
    ip: "127.0.0.1",
  });
  const c2 = await runMw(mw, {
    method: "PATCH",
    user: { userId: "u1" },
    ip: "127.0.0.1",
  });
  const c3 = await runMw(mw, {
    method: "PATCH",
    user: { userId: "u1" },
    ip: "127.0.0.1",
  });
  check("middleware allows first two", c1 === 200 && c2 === 200);
  check("middleware returns 429 on burst", c3 === 429);

  clearRateLimitBuckets();
  const mwGet = adminMutationRateLimit({ max: 1, windowMs: 60_000 });
  const getCode = await runMw(mwGet, {
    method: "GET",
    user: { userId: "u2" },
  });
  check("GET skips mutation limit", getCode === 200);

  clearRateLimitBuckets();
  const authMw = authSensitiveRateLimit("login", {
    max: 2,
    windowMs: 60_000,
  });
  const a1 = await runMw(authMw, { method: "POST", ip: "10.0.0.9" });
  const a2 = await runMw(authMw, { method: "POST", ip: "10.0.0.9" });
  const a3 = await runMw(authMw, { method: "POST", ip: "10.0.0.9" });
  check("auth sensitive allows first two", a1 === 200 && a2 === 200);
  check("auth sensitive returns 429 on burst", a3 === 429);

  clearRateLimitBuckets();
  const refreshMw = authSensitiveRateLimit("refresh", {
    max: 2,
    windowMs: 60_000,
  });
  const refreshIp = `10.0.0.${Date.now() % 200 + 20}`;
  const tok = `refresh-selftest-token-${Date.now()}`;
  const rf1 = await runMw(refreshMw, {
    method: "POST",
    ip: refreshIp,
    body: { refreshToken: tok },
    cookies: {},
  });
  const rf2 = await runMw(refreshMw, {
    method: "POST",
    ip: refreshIp,
    body: { refreshToken: tok },
    cookies: {},
  });
  const rf3 = await runMw(refreshMw, {
    method: "POST",
    ip: refreshIp,
    body: { refreshToken: tok },
    cookies: {},
  });
  check("refresh allows first two", rf1 === 200 && rf2 === 200);
  check("refresh returns 429 on burst", rf3 === 429);

  // Malformed / empty body still counts against IP bucket
  clearRateLimitBuckets();
  const refreshMw2 = authSensitiveRateLimit("refresh", {
    max: 2,
    windowMs: 60_000,
  });
  const badIp = `10.0.1.${Date.now() % 200 + 20}`;
  const b1 = await runMw(refreshMw2, {
    method: "POST",
    ip: badIp,
    body: {},
    cookies: {},
  });
  const b2 = await runMw(refreshMw2, {
    method: "POST",
    ip: badIp,
    body: { refreshToken: "" },
    cookies: {},
  });
  const b3 = await runMw(refreshMw2, {
    method: "POST",
    ip: badIp,
    body: { refreshToken: null },
    cookies: {},
  });
  check("refresh empty body still rate-limited by IP", b1 === 200 && b2 === 200 && b3 === 429);

  // Redis shared counter + TTL (simulates multiple AuthService instances)
  const sharedKey = `selftest-shared-${Date.now()}`;
  const windowMs = 2500;
  const r1 = await checkRateLimitAsync(sharedKey, { max: 2, windowMs });
  const r2 = await checkRateLimitAsync(sharedKey, { max: 2, windowMs });
  const r3 = await checkRateLimitAsync(sharedKey, { max: 2, windowMs });
  check("redis allow 1", r1.allowed === true);
  check("redis allow 2", r2.allowed === true);
  check("redis limit 3 (shared)", r3.allowed === false);
  check("redis retry-after positive", r3.retryAfterSec >= 1);

  const redisKey = `auth:rl:v1:${sharedKey}`;
  const pttl = await redis.pttl(redisKey);
  check("redis key has TTL", pttl > 0 && pttl <= windowMs);

  // Wait for TTL expiry then allow again
  await new Promise((r) => setTimeout(r, windowMs + 400));
  const r4 = await checkRateLimitAsync(sharedKey, { max: 2, windowMs });
  check("redis allows after TTL expiry", r4.allowed === true);
  await redis.del(redisKey);

  // Health: normal login path still reachable (no rate-limit on GET health)
  // (full HTTP check done separately in verify script)

  console.log(`\nSelftest done. Passed ${passed} checks.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
