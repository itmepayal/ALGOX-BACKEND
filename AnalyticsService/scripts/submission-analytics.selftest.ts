/**
 * Phase 15 — Submission Analytics.
 * Run: cd server/AnalyticsService && npx tsx scripts/submission-analytics.selftest.ts
 *
 * VERIFY: real/empty/filter/range/premium; no fabricated runtime/memory;
 * server aggregation + pagination; dashboard tab wired.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const clientSrc = path.join(root, "../../client/src");
const submissionRoot = path.join(root, "../SubmissionService");

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (!ok) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failed += 1;
    return;
  }
  console.log(`PASS: ${name}`);
  passed += 1;
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function readSub(rel: string) {
  return fs.readFileSync(path.join(submissionRoot, rel), "utf8");
}
function readClient(rel: string) {
  return fs.readFileSync(path.join(clientSrc, rel), "utf8");
}

const repo = readSub("src/repositories/submission.repository.ts");
const model = readSub("src/models/submission.model.ts");
const subRouter = readSub("src/routers/v1/submission.router.ts");
const subSvc = readSub("src/services/submission.service.ts");
const analyticsSvc = read("src/services/analytics.service.ts");
const analyticsRouter = read("src/routers/v1/analytics.router.ts");
const entitlement = read("src/utils/entitlementClient.ts");
const clientApi = readClient("api/userAnalyticsApi.ts");
const panel = readClient("components/SubmissionAnalyticsPanel.tsx");
const dash = readClient("components/Dashboard.tsx");
const types = readClient("components/home/types.ts");

check(
  "userId+createdAt index",
  model.includes("userId: 1, createdAt: -1")
);
check(
  "server aggregation never fabricates runtime",
  repo.includes("Never invents runtime/memory") &&
    repo.includes("avgExecutionTimeMs") &&
    repo.includes("null")
);
check(
  "paginated lean rows omit code",
  repo.includes("problemId status language executionTime memory source createdAt") &&
    repo.includes(".lean()") &&
    repo.includes("Never invents runtime/memory")
);
check(
  "Submission /me/analytics route",
  subRouter.includes("/me/analytics") &&
    subSvc.includes("userSubmissionAnalytics")
);
check(
  "Analytics /me/overview|history|premium",
  analyticsRouter.includes("/me/overview") &&
    analyticsRouter.includes("/me/history") &&
    analyticsRouter.includes("/me/premium")
);
check(
  "premium gated via Auth entitlements",
  analyticsSvc.includes("premium.analytics") &&
    analyticsSvc.includes("resolveEntitlements") &&
    entitlement.includes("/auth/entitlements/me")
);
check(
  "premium trends from real aggregates only",
  analyticsSvc.includes("runtimeTrend") &&
    analyticsSvc.includes("memoryTrend") &&
    analyticsSvc.includes("acceptanceTrend") &&
    analyticsSvc.includes("null means no samples")
);
check(
  "client API endpoints",
  clientApi.includes("/analytics/me/overview") &&
    clientApi.includes("/analytics/me/history") &&
    clientApi.includes("/analytics/me/premium")
);
check(
  "dashboard analytics tab",
  dash.includes('"analytics"') &&
    dash.includes("SubmissionAnalyticsPanel") &&
    types.includes('"analytics"')
);
check(
  "panel shows null runtime as dash",
  panel.includes('return "—"') && panel.includes("fmtMs") && panel.includes("fmtMb")
);
check(
  "panel premium UpgradePrompt",
  panel.includes("premium.analytics") && panel.includes("UpgradePrompt")
);
check(
  "limit capped at 50",
  repo.includes("Math.min(50")
);

const ANALYTICS_URL =
  process.env.ANALYTICS_SERVICE_URL || "http://localhost:3007";
const SUBMISSION_URL =
  process.env.SUBMISSION_SERVICE_URL || "http://localhost:3004";
const AUTH_URL = process.env.AUTH_SERVICE_URL || "http://localhost:3001";

async function request(
  base: string,
  pathName: string,
  method = "GET",
  headers: Record<string, string> = {},
  body?: unknown
) {
  const res = await fetch(`${base}${pathName}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function decodeUserId(token: string): string {
  try {
    return JSON.parse(
      Buffer.from(String(token).split(".")[1], "base64url").toString()
    ).userId;
  } catch {
    return "";
  }
}

function assertNoFabricatedMetrics(items: any[]) {
  return items.every(
    (row) =>
      (row.executionTime == null || typeof row.executionTime === "number") &&
      (row.memory == null || typeof row.memory === "number") &&
      !("code" in row)
  );
}

async function live() {
  try {
    const health = await fetch(`${ANALYTICS_URL}/api/v1/health`);
    if (!health.ok) {
      console.log("SKIP live: AnalyticsService not reachable");
      return;
    }
  } catch {
    console.log("SKIP live: AnalyticsService not reachable");
    return;
  }

  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(root, ".env") });
  const authEnv = dotenv.config({
    path: path.join(root, "../AuthService/.env"),
  });
  const authMongo =
    authEnv.parsed?.MONGO_URL ||
    authEnv.parsed?.MONGO_URI ||
    process.env.AUTH_MONGO_URL;
  const subEnv = dotenv.config({
    path: path.join(root, "../SubmissionService/.env"),
  });
  const subMongo =
    subEnv.parsed?.MONGO_URL ||
    subEnv.parsed?.MONGO_URI ||
    process.env.SUBMISSION_MONGO_URL;

  const guest = await request(ANALYTICS_URL, "/api/v1/analytics/me/overview");
  check("guest overview requires auth", guest.status === 401);

  const email = `p15_analytics_${Date.now()}@test.local`;
  const password = "TestPass123!";
  await request(AUTH_URL, "/api/v1/auth/signup", "POST", {}, {
    name: "P15 Analytics",
    email,
    password,
  });
  const login = await request(AUTH_URL, "/api/v1/auth/login", "POST", {}, {
    email,
    password,
  });
  const token = login.json?.data?.accessToken || login.json?.data?.token;
  check("user login", Boolean(token));
  if (!token) return;
  const auth = { Authorization: `Bearer ${token}` };
  const userId = decodeUserId(token);

  // Empty user — no submissions yet
  const emptyOverview = await request(
    ANALYTICS_URL,
    "/api/v1/analytics/me/overview",
    "GET",
    auth
  );
  check("empty overview 200", emptyOverview.status === 200);
  check(
    "empty overview counters zero-ish",
    (emptyOverview.json?.data?.totalSubmissions ?? 0) === 0
  );

  const emptyHist = await request(
    ANALYTICS_URL,
    "/api/v1/analytics/me/history?range=30d&page=1&limit=10",
    "GET",
    auth
  );
  check("empty history 200", emptyHist.status === 200, `status=${emptyHist.status}`);
  check(
    "empty history items []",
    Array.isArray(emptyHist.json?.data?.items) &&
      emptyHist.json.data.items.length === 0 &&
      (emptyHist.json.data.total ?? 0) === 0
  );
  check(
    "empty avg runtime null not fabricated",
    emptyHist.json?.data?.aggregates?.avgExecutionTimeMs === null ||
      emptyHist.json?.data?.aggregates?.avgExecutionTimeMs === undefined ||
      emptyHist.json?.data?.aggregates?.runtimeSampleCount === 0
  );

  const freePremium = await request(
    ANALYTICS_URL,
    "/api/v1/analytics/me/premium?range=30d",
    "GET",
    auth
  );
  check(
    "free user premium gated 403",
    freePremium.status === 403,
    `status=${freePremium.status}`
  );

  // Seed real submissions (multiple) into Submission Mongo
  const mongoose = await import("mongoose");
  if (!subMongo || !userId) {
    console.log("SKIP seed: no submission mongo / userId");
  } else {
    const sconn = await mongoose.default.createConnection(subMongo).asPromise();
    const Subs = sconn.collection("submissions");
    const pid1 = new mongoose.default.Types.ObjectId();
    const pid2 = new mongoose.default.Types.ObjectId();
    const now = Date.now();
    await Subs.insertMany([
      {
        userId: new mongoose.default.Types.ObjectId(userId),
        problemId: pid1,
        language: "python",
        code: "print(1)",
        status: "ACCEPTED",
        source: "submit",
        executionTime: 42.5,
        memory: 12.1,
        testCasesPassed: 3,
        totalTestCases: 3,
        createdAt: new Date(now - 2 * 86400000),
        updatedAt: new Date(now - 2 * 86400000),
      },
      {
        userId: new mongoose.default.Types.ObjectId(userId),
        problemId: pid1,
        language: "python",
        code: "print(0)",
        status: "WRONG_ANSWER",
        source: "submit",
        // no executionTime/memory — must stay null in API
        createdAt: new Date(now - 86400000),
        updatedAt: new Date(now - 86400000),
      },
      {
        userId: new mongoose.default.Types.ObjectId(userId),
        problemId: pid2,
        language: "javascript",
        code: "console.log(1)",
        status: "ACCEPTED",
        source: "submit",
        executionTime: 18,
        memory: 8.4,
        createdAt: new Date(now - 3600000),
        updatedAt: new Date(now - 3600000),
      },
      {
        userId: new mongoose.default.Types.ObjectId(userId),
        problemId: pid2,
        language: "javascript",
        code: "// run only",
        status: "ACCEPTED",
        source: "run",
        executionTime: 999,
        memory: 999,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
    ]);

    // Direct SubmissionService analytics
    let subOk = false;
    try {
      const sh = await fetch(`${SUBMISSION_URL}/api/v1/health`);
      subOk = sh.ok;
    } catch {
      subOk = false;
    }
    if (!subOk) {
      console.log("SKIP submission live: SubmissionService down");
    } else {
      const direct = await request(
        SUBMISSION_URL,
        "/api/v1/submissions/me/analytics?limit=20",
        "GET",
        auth
      );
      check(
        "submission analytics 200",
        direct.status === 200,
        `status=${direct.status}`
      );
      const d = direct.json?.data;
      check(
        "multiple real submissions (excludes run)",
        (d?.total ?? 0) === 3,
        `total=${d?.total}`
      );
      check(
        "items omit code + honest nulls",
        assertNoFabricatedMetrics(d?.items || [])
      );
      const wa = (d?.items || []).find(
        (i: any) => i.status === "WRONG_ANSWER"
      );
      check(
        "WA has null runtime/memory",
        wa && wa.executionTime === null && wa.memory === null
      );
      check(
        "accepted avg uses measured only",
        typeof d?.aggregates?.avgExecutionTimeMs === "number" &&
          d.aggregates.runtimeSampleCount >= 1
      );

      // Filter by status
      const filtered = await request(
        SUBMISSION_URL,
        "/api/v1/submissions/me/analytics?status=ACCEPTED&limit=10",
        "GET",
        auth
      );
      check(
        "status filter ACCEPTED",
        filtered.status === 200 &&
          (filtered.json?.data?.total ?? 0) === 2 &&
          (filtered.json?.data?.items || []).every(
            (i: any) => i.status === "ACCEPTED"
          )
      );

      // Language filter
      const lang = await request(
        SUBMISSION_URL,
        "/api/v1/submissions/me/analytics?language=python&limit=10",
        "GET",
        auth
      );
      check(
        "language filter python",
        lang.status === 200 &&
          (lang.json?.data?.total ?? 0) === 2 &&
          (lang.json?.data?.items || []).every(
            (i: any) => i.language === "python"
          )
      );

      // Date range — only last hour (should get recent ACCEPTED js)
      const from = new Date(now - 2 * 3600000).toISOString();
      const to = new Date(now + 60000).toISOString();
      const ranged = await request(
        SUBMISSION_URL,
        `/api/v1/submissions/me/analytics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        "GET",
        auth
      );
      check(
        "date range filter",
        ranged.status === 200 && (ranged.json?.data?.total ?? 0) === 1,
        `total=${ranged.json?.data?.total}`
      );

      // Pagination
      const page1 = await request(
        SUBMISSION_URL,
        "/api/v1/submissions/me/analytics?page=1&limit=2",
        "GET",
        auth
      );
      check(
        "pagination page1 limit2",
        page1.status === 200 &&
          (page1.json?.data?.items || []).length === 2 &&
          page1.json?.data?.totalPages >= 2
      );

      // Via AnalyticsService history
      const hist = await request(
        ANALYTICS_URL,
        "/api/v1/analytics/me/history?range=90d&limit=15",
        "GET",
        auth
      );
      check(
        "analytics history fan-in",
        hist.status === 200 && (hist.json?.data?.total ?? 0) >= 3,
        `total=${hist.json?.data?.total} err=${hist.json?.data?.error || ""}`
      );
    }

    // Premium grant
    if (authMongo && userId) {
      const aconn = await mongoose.default
        .createConnection(authMongo)
        .asPromise();
      const Users = aconn.collection("users");
      await Users.updateOne(
        { _id: new mongoose.default.Types.ObjectId(userId) },
        {
          $set: {
            subscription: {
              plan: "PREMIUM",
              status: "active",
              source: "admin_grant",
              currentPeriodEnd: null,
            },
          },
        }
      );

      const prem = await request(
        ANALYTICS_URL,
        "/api/v1/analytics/me/premium?range=90d",
        "GET",
        auth
      );
      check(
        "premium analytics unlocked",
        prem.status === 200,
        `status=${prem.status} ${prem.json?.message || ""}`
      );
      const pdata = prem.json?.data;
      check(
        "premium has runtime/memory/acceptance trends",
        Array.isArray(pdata?.runtimeTrend) &&
          Array.isArray(pdata?.memoryTrend) &&
          Array.isArray(pdata?.acceptanceTrend)
      );
      check(
        "premium language comparison",
        Array.isArray(pdata?.languageComparison) &&
          pdata.languageComparison.length >= 1
      );
      check(
        "premium attempt analysis",
        pdata?.attemptAnalysis?.problemsAttempted >= 1
      );
      check(
        "premium performanceComparison null-safe",
        pdata?.performanceComparison != null &&
          (pdata.performanceComparison.avgExecutionTimeMs == null ||
            typeof pdata.performanceComparison.avgExecutionTimeMs ===
              "number")
      );
      check(
        "premium history items honest metrics",
        assertNoFabricatedMetrics(pdata?.history?.items || [])
      );

      // Expired subscription re-gates
      await Users.updateOne(
        { _id: new mongoose.default.Types.ObjectId(userId) },
        {
          $set: {
            subscription: {
              plan: "PREMIUM",
              status: "expired",
              source: "admin_grant",
              currentPeriodEnd: new Date(Date.now() - 86400000),
            },
          },
        }
      );
      const expired = await request(
        ANALYTICS_URL,
        "/api/v1/analytics/me/premium?range=7d",
        "GET",
        auth
      );
      check(
        "expired premium re-gated",
        expired.status === 403,
        `status=${expired.status}`
      );
      await aconn.close();
    }

    // Cleanup seeded docs
    await Subs.deleteMany({
      userId: new mongoose.default.Types.ObjectId(userId),
      code: { $in: ["print(1)", "print(0)", "console.log(1)", "// run only"] },
    });
    await sconn.close();
  }
}

live()
  .then(() => {
    console.log(`\nResult: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("SELFTEST ERROR", err);
    process.exit(1);
  });
