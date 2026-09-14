/**
 * Focused rate-limit middleware checks.
 * Run: npx ts-node src/middlewares/rateLimit.selftest.ts
 */
import {
  adminMutationRateLimit,
  checkRateLimit,
  clearRateLimitBuckets,
} from "./rateLimit.middleware";

function main() {
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
  const codes: number[] = [];
  for (let i = 0; i < 3; i++) {
    const req = {
      method: "PATCH",
      user: { userId: "u1" },
      ip: "127.0.0.1",
    } as any;
    const res = {
      statusCode: 200,
      setHeader() {},
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      json() {
        codes.push(this.statusCode);
      },
    } as any;
    mw(req, res, () => {
      codes.push(200);
    });
  }
  check("middleware allows first two", codes[0] === 200 && codes[1] === 200);
  check("middleware returns 429 on burst", codes[2] === 429);

  clearRateLimitBuckets();
  const mwGet = adminMutationRateLimit({ max: 1, windowMs: 60_000 });
  let getOk = false;
  mwGet({ method: "GET", user: { userId: "u2" } } as any, {} as any, () => {
    getOk = true;
  });
  check("GET skips mutation limit", getOk);

  console.log(`\nSelftest done. Passed ${passed} checks.`);
}

main();
