/**
 * Focused checks for submission limit helpers (no full HTTP stack).
 * Run: npx ts-node -r dotenv/config src/utils/platformLimits.selftest.ts
 */
import "dotenv/config";
import {
  assertCodeLength,
  clearPlatformLimitsCache,
  consumeHourlyQuota,
  enforceSubmissionLimits,
  getPlatformSubmissionLimits,
  isStaffRole,
} from "./platformLimits";
import { BadRequestError, TooManyRequestsError } from "./errors/app.error";

async function main() {
  let passed = 0;
  const check = (name: string, ok: boolean, detail?: string) => {
    if (!ok) {
      console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
      process.exitCode = 1;
      return;
    }
    console.log(`PASS: ${name}`);
    passed += 1;
  };

  try {
    assertCodeLength("ok", 10);
    check("assertCodeLength allows short code", true);
  } catch {
    check("assertCodeLength allows short code", false);
  }
  try {
    assertCodeLength("x".repeat(11), 10);
    check("assertCodeLength rejects long code", false, "expected throw");
  } catch (e) {
    check(
      "assertCodeLength rejects long code",
      e instanceof BadRequestError && e.statusCode === 400
    );
  }

  check("isStaffRole admin", isStaffRole("admin") === true);
  check("isStaffRole user", isStaffRole("user") === false);

  clearPlatformLimitsCache();
  const limits = await getPlatformSubmissionLimits();
  check(
    "limits fetch has maxSubmissionsPerHour",
    typeof limits.maxSubmissionsPerHour === "number" &&
      limits.maxSubmissionsPerHour >= 1
  );
  check(
    "limits fetch has maxRunPerHour",
    typeof limits.maxRunPerHour === "number" && limits.maxRunPerHour >= 1
  );
  check(
    "limits fetch has maxCodeLength",
    typeof limits.maxCodeLength === "number" && limits.maxCodeLength >= 1
  );
  check(
    "limits fetch has concurrentSubmissionCap",
    typeof limits.concurrentSubmissionCap === "number" &&
      limits.concurrentSubmissionCap >= 1
  );

  // DB fallback path: redis may be unavailable in this process; enforce via hourlyCount
  let dbFallback429 = false;
  try {
    await enforceSubmissionLimits({
      userId: "selftest-user",
      code: "print(1)",
      source: "submit",
      role: "user",
      concurrentActive: 0,
      hourlyCount: 10_000,
    });
  } catch (e) {
    dbFallback429 = e instanceof TooManyRequestsError && e.statusCode === 429;
  }
  check("DB hourly fallback returns 429 when over limit", dbFallback429);

  let concurrent429 = false;
  try {
    await enforceSubmissionLimits({
      userId: "selftest-user",
      code: "print(1)",
      source: "submit",
      role: "user",
      concurrentActive: 99,
      hourlyCount: 0,
    });
  } catch (e) {
    concurrent429 = e instanceof TooManyRequestsError && e.statusCode === 429;
  }
  check("concurrent cap returns 429", concurrent429);

  // Redis path when credentials exist
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    const testUser = `limit-selftest-${Date.now()}`;
    await consumeHourlyQuota({ userId: testUser, source: "submit", limit: 2 });
    await consumeHourlyQuota({ userId: testUser, source: "submit", limit: 2 });
    const third = await consumeHourlyQuota({
      userId: testUser,
      source: "submit",
      limit: 2,
    });
    check("Redis hourly quota returns limited", third === "limited");
  } else {
    console.log("SKIP: Redis hourly quota (no UPSTASH env in this process)");
  }

  console.log(`\nSelftest done. Passed ${passed} checks.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
