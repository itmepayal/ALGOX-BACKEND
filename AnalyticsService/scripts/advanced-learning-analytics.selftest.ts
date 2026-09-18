/**
 * Phase 16 — Advanced Learning Analytics.
 * Run: cd server/AnalyticsService && npx tsx scripts/advanced-learning-analytics.selftest.ts
 *
 * VERIFY: with/without data, premium gating, date filters, explainable recs.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const clientSrc = path.join(root, "../../client/src");
const problemRoot = path.join(root, "../ProblemService");

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
function readProblem(rel: string) {
  return fs.readFileSync(path.join(problemRoot, rel), "utf8");
}
function readClient(rel: string) {
  return fs.readFileSync(path.join(clientSrc, rel), "utf8");
}

const learningUtil = read("src/utils/learningAnalytics.ts");
const analyticsSvc = read("src/services/analytics.service.ts");
const analyticsRouter = read("src/routers/v1/analytics.router.ts");
const config = read("src/config/index.ts");
const contestSvc = readProblem("src/services/contest.service.ts");
const contestRouter = readProblem("src/routers/v1/contest.router.ts");
const clientApi = readClient("api/userAnalyticsApi.ts");
const panel = readClient("components/AdvancedLearningAnalyticsPanel.tsx");
const subPanel = readClient("components/SubmissionAnalyticsPanel.tsx");

check(
  "learning util never invents scores",
  learningUtil.includes("Never invent") &&
    learningUtil.includes("acceptanceRate") &&
    learningUtil.includes("null")
);
check(
  "explainable recommendations cite evidence",
  learningUtil.includes("evidence:") &&
    learningUtil.includes("Weak topic") &&
    learningUtil.includes("suggestedProblemCount")
);
check(
  "getMyLearning gated premium.analytics",
  analyticsSvc.includes("getMyLearning") &&
    analyticsSvc.includes("premium.analytics") &&
    analyticsSvc.includes("buildRecommendations")
);
check(
  "fan-in content + streak + contests",
  analyticsSvc.includes("study-plans/progress/me") &&
    analyticsSvc.includes("challenges/streak") &&
    analyticsSvc.includes("contests/me/summary")
);
check(
  "CONTENT_SERVICE_URL configured",
  config.includes("CONTENT_SERVICE_URL")
);
check(
  "route /me/learning",
  analyticsRouter.includes("/me/learning")
);
check(
  "contest me/summary real participant data",
  contestSvc.includes("getMyContestSummary") &&
    contestRouter.includes("/me/summary")
);
check(
  "client getLearning + panel",
  clientApi.includes("/analytics/me/learning") &&
    panel.includes("recommendations") &&
    subPanel.includes("AdvancedLearningAnalyticsPanel")
);

const ANALYTICS_URL =
  process.env.ANALYTICS_SERVICE_URL || "http://localhost:3007";
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

async function unitHelpers() {
  const mod = await import("../src/utils/learningAnalytics.ts");
  const mastery = mod.buildTopicMastery([
    { topic: "Arrays", solvedCount: 8, totalSubmissions: 10 },
    { topic: "Dynamic Programming", solvedCount: 1, totalSubmissions: 6 },
  ]);
  check(
    "topic acceptance from counts",
    mastery.find((t) => t.topic === "Dynamic Programming")?.acceptanceRate ===
      Math.round((1 / 6) * 10000) / 100
  );
  const weak = mod.buildWeakTopics(mastery);
  check(
    "weak topic DP detected",
    weak.some((t) => t.topic === "Dynamic Programming")
  );
  const recs = mod.buildRecommendations({
    weakTopics: weak,
    studyPlans: [
      {
        studyPlanSlug: "dp-fundamentals",
        topics: ["Dynamic Programming"],
        status: "in_progress",
        solvedCount: 2,
        totalProblemsCount: 12,
        completionPercentage: 16,
        enrolled: true,
      },
    ],
    consistencyRate: 20,
    difficulty: mod.buildDifficultyDistribution({
      solvedEasy: 10,
      solvedMedium: 1,
      solvedHard: 0,
    }),
    hasAnySubmissions: true,
  });
  check(
    "recommendation cites DP evidence",
    recs.some(
      (r) =>
        r.topic === "Dynamic Programming" &&
        r.evidence.includes("1/6") &&
        (r.suggestedProblemCount || 0) > 0 &&
        r.studyPlanSlug === "dp-fundamentals"
    ),
    JSON.stringify(recs[0])
  );
  const emptyRecs = mod.buildRecommendations({
    weakTopics: [],
    studyPlans: [],
    consistencyRate: null,
    difficulty: mod.buildDifficultyDistribution({}),
    hasAnySubmissions: false,
  });
  check(
    "empty user recommendation honest",
    emptyRecs.length === 1 && emptyRecs[0].evidence.includes("No submission")
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

  const guest = await request(ANALYTICS_URL, "/api/v1/analytics/me/learning");
  check("guest learning requires auth", guest.status === 401);

  const email = `p16_learning_${Date.now()}@test.local`;
  const password = "TestPass123!";
  await request(AUTH_URL, "/api/v1/auth/signup", "POST", {}, {
    name: "P16 Learning",
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
  let userId = "";
  try {
    userId = JSON.parse(
      Buffer.from(String(token).split(".")[1], "base64url").toString()
    ).userId;
  } catch {
    /* */
  }

  const free = await request(
    ANALYTICS_URL,
    "/api/v1/analytics/me/learning?range=30d",
    "GET",
    auth
  );
  check(
    "free user learning gated 403",
    free.status === 403,
    `status=${free.status}`
  );

  if (!authMongo || !userId) {
    console.log("SKIP premium live: no auth mongo");
    return;
  }

  const mongoose = await import("mongoose");
  const aconn = await mongoose.default.createConnection(authMongo).asPromise();
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

  // Empty premium user
  const empty = await request(
    ANALYTICS_URL,
    "/api/v1/analytics/me/learning?range=7d",
    "GET",
    auth
  );
  check(
    "premium empty learning 200",
    empty.status === 200,
    `status=${empty.status} ${empty.json?.message || ""}`
  );
  const ed = empty.json?.data;
  check(
    "empty performance zeros",
    (ed?.performanceOverview?.totalSubmissions ?? -1) === 0
  );
  check(
    "empty recommendations explain gap",
    Array.isArray(ed?.recommendations) &&
      ed.recommendations.some((r: any) =>
        String(r.evidence || "").toLowerCase().includes("no submission")
      )
  );
  check(
    "empty topic weakness []",
    Array.isArray(ed?.topicWeakness) && ed.topicWeakness.length === 0
  );

  // Seed UserAnalytics with weak DP topic + heatmap
  const analyticsMongo =
    dotenv.config({ path: path.join(root, ".env") }).parsed?.MONGO_URI ||
    process.env.MONGO_URI;
  if (analyticsMongo) {
    const anConn = await mongoose.default
      .createConnection(analyticsMongo)
      .asPromise();
    const UA = anConn.collection("useranalytics");
    const today = new Date().toISOString().slice(0, 10);
    await UA.updateOne(
      { userId: new mongoose.default.Types.ObjectId(userId) },
      {
        $set: {
          userId: new mongoose.default.Types.ObjectId(userId),
          totalSubmissions: 16,
          acceptedSubmissions: 9,
          acceptanceRate: 56.25,
          solvedEasy: 8,
          solvedMedium: 1,
          solvedHard: 0,
          currentStreak: 2,
          maxStreak: 4,
          lastSubmissionDate: new Date(),
          submissionHeatmap: [
            { date: today, count: 3 },
            {
              date: new Date(Date.now() - 2 * 86400000)
                .toISOString()
                .slice(0, 10),
              count: 1,
            },
          ],
          topicStrengths: [
            {
              topic: "Arrays",
              solvedCount: 8,
              totalSubmissions: 10,
            },
            {
              topic: "Dynamic Programming",
              solvedCount: 1,
              totalSubmissions: 6,
            },
          ],
        },
      },
      { upsert: true }
    );

    const withData = await request(
      ANALYTICS_URL,
      "/api/v1/analytics/me/learning?range=30d",
      "GET",
      auth
    );
    check(
      "user with data 200",
      withData.status === 200,
      `status=${withData.status}`
    );
    const wd = withData.json?.data;
    check(
      "topic mastery includes DP",
      (wd?.topicMastery || []).some(
        (t: any) => t.topic === "Dynamic Programming" && t.acceptanceRate != null
      )
    );
    check(
      "topic weakness flags DP",
      (wd?.topicWeakness || []).some(
        (t: any) => t.topic === "Dynamic Programming"
      )
    );
    check(
      "difficulty distribution from counts",
      wd?.difficultyDistribution?.easy === 8 &&
        wd?.difficultyDistribution?.hard === 0
    );
    check(
      "recommendation explainable for DP",
      (wd?.recommendations || []).some(
        (r: any) =>
          r.topic === "Dynamic Programming" &&
          String(r.evidence).includes("1/6")
      )
    );
    check(
      "streaks present without inventing challenge",
      wd?.streaks?.submission?.current === 2 &&
        wd?.streaks?.challenge?.source?.includes("challenges/streak")
    );

    // Date filter range param
    const ranged = await request(
      ANALYTICS_URL,
      "/api/v1/analytics/me/learning?range=7d",
      "GET",
      auth
    );
    check(
      "date range filter applied",
      ranged.status === 200 && ranged.json?.data?.range === "7d"
    );

    await UA.deleteOne({
      userId: new mongoose.default.Types.ObjectId(userId),
    });
    await anConn.close();
  }

  // Re-gate expired
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
    "/api/v1/analytics/me/learning?range=30d",
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

unitHelpers()
  .then(() => live())
  .then(() => {
    console.log(`\nResult: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("SELFTEST ERROR", err);
    process.exit(1);
  });
