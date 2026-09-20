/**
 * Phase 13 — Mock interview system.
 * Run: cd server/ProblemService && npx tsx scripts/mock-interview.selftest.ts
 *
 * VERIFY: start, resume, timeout, submit, evaluation, report, unauthorized access.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const clientSrc = path.join(root, "../../client/src");

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
function readClient(rel: string) {
  return fs.readFileSync(path.join(clientSrc, rel), "utf8");
}

const model = read("src/models/mockInterviewSession.model.ts");
const report = read("src/utils/mockInterviewReport.ts");
const service = read("src/services/mockInterview.service.ts");
const controller = read("src/controllers/mockInterview.controller.ts");
const router = read("src/routers/v1/mockInterview.router.ts");
const indexRouter = read("src/routers/v1/index.router.ts");
const subValidator = fs.readFileSync(
  path.join(root, "../SubmissionService/src/validators/submission.validator.ts"),
  "utf8"
);
const evalWorker = fs.readFileSync(
  path.join(root, "../EvaluationService/src/workers/evaluation.worker.ts"),
  "utf8"
);
const clientApi = readClient("api/mockInterviewApi.ts");
const panel = readClient("components/MockInterviewPanel.tsx");
const dash = readClient("components/Dashboard.tsx");
const clientSubApi = readClient("api/submissionApi.ts");

check("session model has config fields", model.includes("company") && model.includes("durationMinutes") && model.includes("language") && model.includes("topics"));
check("unique in_progress per user", model.includes('partialFilterExpression: { status: "in_progress" }'));
check(
  "report marks complexity unavailable",
  report.includes("No complexity analysis") && report.includes('"unavailable"')
);
check("scores from real signals only", report.includes("test_cases_passed") && report.includes("accepted_problems") && !report.includes("openai"));
check("premium gate", service.includes("premium.mock_interview") || service.includes("MOCK_INTERVIEW_FEATURE"));
check("PremiumRequiredError", service.includes("PremiumRequiredError"));
check("duplicate session conflict", service.includes("ConflictError") && service.includes("active mock interview"));
check("owner check unauthorized", service.includes("Unauthorized session access"));
check("server timeout apply", service.includes("applyTimeoutIfNeeded") && service.includes("timed_out"));
check("reject client timer spoof", controller.includes("Client timer/result fields are not accepted"));
check("reject client judge spoof", controller.includes("Judge result fields are not accepted from client"));
check("routes start/active/complete/report", router.includes("/start") && router.includes("/active") && router.includes("/complete") && router.includes("/report"));
check("config route", router.includes("/config"));
check("requireFeature middleware", router.includes("requireFeature"));
check("internal allows + record", router.includes("allows-submission") && router.includes("record-submission"));
check("mounted on /interviews", indexRouter.includes("/interviews") && indexRouter.includes("mountMockInterviewInternal"));
check("admin interviews mounted", indexRouter.includes("admin/interviews") || indexRouter.includes("adminMockInterview"));
check("report overallScore", report.includes("overallScore") && report.includes("strengths"));
check("submission carries mockInterviewSessionId", subValidator.includes("mockInterviewSessionId"));
check("evaluation records interview verdicts", evalWorker.includes("interview-record-submission") && evalWorker.includes("mockInterviewSessionId"));
check("client API + panel", clientApi.includes("start") && clientApi.includes("getConfig") && panel.includes("Start interview") && panel.includes("Interview report"));
check(
  "client submit includes mockInterviewSessionId",
  dash.includes("mockInterviewSessionId") &&
    dash.includes("activeMockInterviewSessionId") &&
    clientSubApi.includes("mockInterviewSessionId")
);
check("dashboard interview tab", dash.includes('"interview"') && dash.includes("MockInterviewPanel"));
check("workspace timer chrome", dash.includes("mockInterviewRemainingMs") || dash.includes("mock-interview-workspace-bar"));

async function unitReport() {
  const mod = await import("../src/utils/mockInterviewReport.ts");
  const built = mod.buildMockInterviewReport({
    status: "completed",
    durationMinutes: 45,
    startedAt: new Date("2026-09-17T10:00:00.000Z"),
    endsAt: new Date("2026-09-17T10:45:00.000Z"),
    completedAt: new Date("2026-09-17T10:20:00.000Z"),
    problemIds: ["p1", "p2"],
    attempts: [
      {
        problemId: "p1",
        order: 0,
        submissionId: "s1",
        status: "ACCEPTED",
        testCasesPassed: 10,
        totalTestCases: 10,
        executionTimeMs: 12,
        memoryMb: 20,
        source: "submit",
        submittedAt: new Date(),
      },
      {
        problemId: "p2",
        order: 1,
        submissionId: "s2",
        status: "WRONG_ANSWER",
        testCasesPassed: 3,
        totalTestCases: 8,
        source: "submit",
        submittedAt: new Date(),
      },
    ],
  });
  check("problemSolving 50%", built.scores.problemSolving.score === 50);
  check("correctness from testcases", built.scores.correctness.available && (built.scores.correctness.score || 0) > 0);
  check("complexity unavailable not invented", built.scores.complexity.available === false && built.scores.complexity.score == null);
  check("completion 100% attempted", built.scores.completion.score === 100);
  check("time management available on complete", built.scores.timeManagement.available === true);
  check("overallScore computed", typeof built.overallScore === "number" && built.overallScore >= 0 && built.overallScore <= 100);
  check("attempt efficiency cell", built.scores.attempts.available === true);
}

const PROBLEM_URL = process.env.PROBLEM_SERVICE_URL || "http://localhost:3003";
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

async function live() {
  try {
    const health = await fetch(`${PROBLEM_URL}/api/v1/health`);
    if (!health.ok) {
      console.log("SKIP live: ProblemService not reachable");
      return;
    }
  } catch {
    console.log("SKIP live: ProblemService not reachable");
    return;
  }

  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(root, ".env") });
  const problemMongo = process.env.MONGO_URL || process.env.MONGO_URI;
  const authEnv = dotenv.config({
    path: path.join(root, "../AuthService/.env"),
  });
  const authMongo =
    authEnv.parsed?.MONGO_URL ||
    authEnv.parsed?.MONGO_URI ||
    process.env.AUTH_MONGO_URL ||
    problemMongo;
  const internal =
    process.env.INTERNAL_SERVICE_SECRET || "dev-internal-service-secret";

  const guestStart = await request(PROBLEM_URL, "/api/v1/interviews/start", "POST", {}, {
    language: "python",
    durationMinutes: 30,
  });
  check("start requires auth", guestStart.status === 401);

  const email = `p13_iv_${Date.now()}@test.local`;
  const password = "TestPass123!";
  await request(AUTH_URL, "/api/v1/auth/signup", "POST", {}, {
    name: "P13 Interview",
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

  const freeStart = await request(
    PROBLEM_URL,
    "/api/v1/interviews/start",
    "POST",
    auth,
    { language: "python", durationMinutes: 30, difficulty: "easy", problemCount: 1 }
  );
  check(
    "free user blocked without premium",
    freeStart.status === 403,
    `status=${freeStart.status}`
  );

  // Grant premium via Subscription ledger (SoT) + User.subscription snapshot
  let userId = "";
  try {
    userId = JSON.parse(
      Buffer.from(String(token).split(".")[1], "base64url").toString()
    ).userId;
  } catch {
    /* */
  }
  if (!authMongo || !userId) {
    console.log("SKIP premium live flows: no auth mongo/userId");
    return;
  }

  const mongoose = await import("mongoose");
  const authConn = await mongoose.default.createConnection(authMongo).asPromise();
  const Users = authConn.collection("users");
  const Subs = authConn.collection("subscriptions");
  const oid = new mongoose.default.Types.ObjectId(userId);
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 86400000);
  await Subs.updateMany(
    { userId: oid, endedAt: null },
    { $set: { endedAt: now, status: "CANCELLED", updatedAt: now } }
  );
  await Subs.insertOne({
    userId: oid,
    plan: "PREMIUM",
    status: "ACTIVE",
    provider: "admin",
    startDate: now,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    endedAt: null,
    metadata: { reason: "mock-interview.selftest" },
    createdAt: now,
    updatedAt: now,
  });
  await Users.updateOne(
    { _id: oid },
    {
      $set: {
        subscription: {
          plan: "PREMIUM",
          status: "active",
          source: "admin",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          updatedAt: now,
        },
      },
    }
  );

  const ent = await request(AUTH_URL, "/api/v1/auth/entitlements/me", "GET", auth);
  check(
    "premium entitlement after grant",
    ent.json?.data?.accessTier === "PREMIUM" ||
      (ent.json?.data?.features || []).includes("premium.mock_interview"),
    JSON.stringify(ent.json?.data)
  );

  // Re-login so JWT flows still work; entitlement is DB-backed via /entitlements/me
  const spoof = await request(
    PROBLEM_URL,
    "/api/v1/interviews/start",
    "POST",
    auth,
    {
      language: "python",
      durationMinutes: 30,
      startedAt: "2099-01-01T00:00:00.000Z",
      endsAt: "2099-01-01T01:00:00.000Z",
    }
  );
  check(
    "API rejects client timer spoof",
    spoof.status === 400,
    `status=${spoof.status}`
  );

  const start = await request(
    PROBLEM_URL,
    "/api/v1/interviews/start",
    "POST",
    auth,
    {
      language: "python",
      durationMinutes: 30,
      difficulty: "mixed",
      problemCount: 1,
      topics: ["Arrays"],
      company: "AlgoPath",
      role: "SDE",
    }
  );
  check("start interview", start.status === 201 || start.status === 200, `status=${start.status} ${start.json?.message}`);
  const session = start.json?.data;
  check("session has endsAt + remainingMs", Boolean(session?.endsAt && session?.remainingMs != null));
  check("session has problemIds", Array.isArray(session?.problemIds) && session.problemIds.length >= 1);
  const sessionId = session?.id;
  if (!sessionId) {
    await authConn.close();
    return;
  }

  const dup = await request(
    PROBLEM_URL,
    "/api/v1/interviews/start",
    "POST",
    auth,
    { language: "python", durationMinutes: 30 }
  );
  check("duplicate session blocked", dup.status === 409, `status=${dup.status}`);

  const resume = await request(PROBLEM_URL, "/api/v1/interviews/active", "GET", auth);
  check("resume active", resume.status === 200 && resume.json?.data?.id === sessionId);

  // Unauthorized access with second user
  const email2 = `p13_iv2_${Date.now()}@test.local`;
  await request(AUTH_URL, "/api/v1/auth/signup", "POST", {}, {
    name: "P13 Other",
    email: email2,
    password,
  });
  const login2 = await request(AUTH_URL, "/api/v1/auth/login", "POST", {}, {
    email: email2,
    password,
  });
  const token2 = login2.json?.data?.accessToken || login2.json?.data?.token;
  await Subs.updateMany(
    {
      userId: new mongoose.default.Types.ObjectId(
        JSON.parse(Buffer.from(String(token2).split(".")[1], "base64url").toString()).userId
      ),
      endedAt: null,
    },
    { $set: { endedAt: new Date(), status: "CANCELLED" } }
  );
  const uid2 = new mongoose.default.Types.ObjectId(
    JSON.parse(Buffer.from(String(token2).split(".")[1], "base64url").toString()).userId
  );
  const now2 = new Date();
  await Subs.insertOne({
    userId: uid2,
    plan: "PREMIUM",
    status: "ACTIVE",
    provider: "admin",
    startDate: now2,
    currentPeriodStart: now2,
    currentPeriodEnd: new Date(now2.getTime() + 30 * 86400000),
    cancelAtPeriodEnd: false,
    endedAt: null,
    createdAt: now2,
    updatedAt: now2,
  });
  await Users.updateOne(
    { _id: uid2 },
    {
      $set: {
        subscription: {
          plan: "PREMIUM",
          status: "active",
          source: "admin",
          currentPeriodEnd: new Date(now2.getTime() + 30 * 86400000),
          updatedAt: now2,
        },
      },
    }
  );
  const unauth = await request(
    PROBLEM_URL,
    `/api/v1/interviews/${sessionId}`,
    "GET",
    { Authorization: `Bearer ${token2}` }
  );
  check(
    "unauthorized session access forbidden",
    unauth.status === 403,
    `status=${unauth.status}`
  );

  // Evaluation record via internal (real judge-shaped payload)
  const problemId = session.problemIds[0];
  const allows = await request(
    PROBLEM_URL,
    `/api/v1/internal/interviews/${sessionId}/allows-submission?userId=${userId}`,
    "GET",
    { "x-internal-secret": internal }
  );
  check("allows-submission while in window", allows.status === 200);

  const recorded = await request(
    PROBLEM_URL,
    `/api/v1/internal/interviews/${sessionId}/record-submission`,
    "POST",
    { "x-internal-secret": internal },
    {
      submissionId: `sub-p13-${Date.now()}`,
      userId,
      problemId,
      status: "ACCEPTED",
      testCasesPassed: 5,
      totalTestCases: 5,
      executionTimeMs: 18,
      memoryMb: 22,
      language: "python",
      source: "submit",
    }
  );
  check("evaluation record", recorded.status === 200);
  check(
    "attempt stored with ACCEPTED",
    (recorded.json?.data?.attempts || []).some(
      (a: any) => a.problemId === problemId && a.status === "ACCEPTED"
    )
  );

  const judgeSpoof = await request(
    PROBLEM_URL,
    `/api/v1/interviews/${sessionId}/attach-submission`,
    "POST",
    auth,
    {
      problemId,
      submissionId: "x",
      status: "ACCEPTED",
      testCasesPassed: 99,
    }
  );
  check("client cannot send forged judge fields", judgeSpoof.status === 400);

  const complete = await request(
    PROBLEM_URL,
    `/api/v1/interviews/${sessionId}/complete`,
    "POST",
    auth,
    {}
  );
  check("complete session", complete.status === 200);
  check("status completed", complete.json?.data?.status === "completed");

  const reportRes = await request(
    PROBLEM_URL,
    `/api/v1/interviews/${sessionId}/report`,
    "GET",
    auth
  );
  check("report endpoint", reportRes.status === 200);
  const scores = reportRes.json?.data?.report?.scores;
  check("report has problemSolving", Boolean(scores?.problemSolving));
  check(
    "complexity not invented",
    scores?.complexity?.available === false && scores?.complexity?.score == null
  );
  check(
    "correctness from recorded tests",
    scores?.correctness?.available === true && scores?.correctness?.score === 100
  );

  // Timeout path uses ProblemService mongo
  const problemConn = await mongoose.default
    .createConnection(problemMongo!)
    .asPromise();
  const Sessions = problemConn.collection("mockinterviewsessions");
  await Sessions.updateMany(
    { userId, status: "in_progress" },
    { $set: { status: "abandoned" } }
  );
  const start2 = await request(
    PROBLEM_URL,
    "/api/v1/interviews/start",
    "POST",
    auth,
    { language: "python", durationMinutes: 30, problemCount: 1 }
  );
  const sid2 = start2.json?.data?.id;
  check("second start after complete", Boolean(sid2));
  if (sid2) {
    await Sessions.updateOne(
      { _id: new mongoose.default.Types.ObjectId(sid2) },
      { $set: { endsAt: new Date(Date.now() - 60_000) } }
    );
    const timed = await request(
      PROBLEM_URL,
      `/api/v1/interviews/${sid2}`,
      "GET",
      auth
    );
    check(
      "timeout applied on access",
      timed.json?.data?.status === "timed_out",
      `status=${timed.json?.data?.status}`
    );
    const trep = await request(
      PROBLEM_URL,
      `/api/v1/interviews/${sid2}/report`,
      "GET",
      auth
    );
    check(
      "timeout report present",
      trep.status === 200 && trep.json?.data?.report?.sessionStatus === "timed_out"
    );

    const denySubmit = await request(
      PROBLEM_URL,
      `/api/v1/internal/interviews/${sid2}/allows-submission?userId=${userId}`,
      "GET",
      { "x-internal-secret": internal }
    );
    check(
      "submit blocked after timeout",
      denySubmit.status === 400 || denySubmit.status === 409,
      `status=${denySubmit.status}`
    );
  }

  await authConn.close();
  await problemConn.close();
}

unitReport()
  .then(() => live())
  .then(() => {
    console.log(`\n${passed} PASS, ${failed} FAIL`);
    process.exit(failed ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
