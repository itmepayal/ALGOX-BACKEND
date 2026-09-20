/**
 * Phase 12 — Daily challenge + streak engine.
 * Run: cd server/ProblemService && npx tsx scripts/daily-challenge-streak.selftest.ts
 *
 * VERIFY: timezone, duplicate completion, missed day, consecutive days, replay, API manipulation.
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

const rules = read("src/utils/streakRules.ts");
const model = read("src/models/dailyChallenge.model.ts");
const completion = read("src/models/userChallengeCompletion.model.ts");
const streakModel = read("src/models/userStreakState.model.ts");
const service = read("src/services/challenge.service.ts");
const controller = read("src/controllers/challenge.controller.ts");
const router = read("src/routers/v1/challenge.router.ts");
const indexRouter = read("src/routers/v1/index.router.ts");
const authFeatures = fs.readFileSync(
  path.join(root, "../AuthService/src/subscription/features.ts"),
  "utf8"
);
const clientFeatures = readClient("access/features.ts");
const clientApi = readClient("api/challengeApi.ts");
const home = readClient("components/home/FreeHomeDashboard.tsx");

check(
  "canonical challenge unique dateKey",
  model.includes("unique: true") && model.includes("dateKey")
);
check("challenge tier standard|advanced", model.includes("advanced"));
check(
  "completion unique userId+dateKey",
  completion.includes("userId: 1, dateKey: 1") && completion.includes("unique: true")
);
check("streak has timezone + freeze + goals", streakModel.includes("timezone") && streakModel.includes("freezeBalance") && streakModel.includes("weeklyGoalTarget"));
check("rules document qualifying activity", rules.includes("Qualifying activity") && rules.includes("Client timestamps"));
check("dateKeyInTimeZone helper", rules.includes("dateKeyInTimeZone"));
check("applyQualifiedDay consecutive/missed", rules.includes("missed_day") && rules.includes("continue"));
check("FREE_HISTORY_DAYS", rules.includes("FREE_HISTORY_DAYS"));
check("complete rejects client dateKey", controller.includes("dateKey/completedAt/timezone are not accepted"));
check("verify ACCEPTED via SubmissionService", service.includes("verifyAcceptedSubmission") && service.includes("ACCEPTED"));
check(
  "bad submissionId falls through to problem search",
  service.includes("Fall through") &&
    service.includes("do not treat a bad client submissionId as definitive")
);
check("ensureChallenge deterministic hash", service.includes("hashDateKey") && service.includes("ensureChallengeForDate"));
check("premium history + advanced + freeze gates", service.includes("premium.challenge_history") && service.includes("premium.daily_challenge_advanced") && service.includes("premium.streak_freeze"));
check("routes today/complete/streak/freeze/calendar", router.includes("/today") && router.includes("/complete") && router.includes("/streak/freeze") && router.includes("/calendar"));
check("internal qualify mounted", indexRouter.includes("mountChallengeInternal") && indexRouter.includes("/challenges"));
check("auth features include challenge keys", authFeatures.includes("premium.streak_freeze") && authFeatures.includes("premium.challenge_history"));
check("client features mirrored", clientFeatures.includes("premium.daily_challenge_advanced"));
check("client challengeApi", clientApi.includes("complete") && clientApi.includes("getStreak") && clientApi.includes("useFreeze"));
check("home uses challengeApi not pickDailyChallenge", home.includes("challengeApi") && !home.includes("pickDailyChallenge"));
check("home shows server streak", home.includes("streakView") || home.includes("challengeApi.getStreak"));

// Pure rule unit checks (inline import via dynamic)
async function unitRules() {
  const mod = await import("../src/utils/streakRules.ts");
  const {
    applyQualifiedDay,
    computeCurrentStreakFromDays,
    dateKeyInTimeZone,
    shiftDateKey,
    hashDateKey,
  } = mod;

  check(
    "same dateKey hash is stable",
    hashDateKey("2026-09-17") === hashDateKey("2026-09-17")
  );
  check(
    "different dates can hash differently",
    hashDateKey("2026-09-17") !== hashDateKey("2026-09-18")
  );

  const utcKey = dateKeyInTimeZone(new Date("2026-09-17T12:00:00.000Z"), "UTC");
  check("timezone UTC noon → 2026-09-17", utcKey === "2026-09-17");

  const tokyo = dateKeyInTimeZone(
    new Date("2026-09-16T16:00:00.000Z"),
    "Asia/Tokyo"
  );
  check("timezone Asia/Tokyo crosses date", tokyo === "2026-09-17");

  const cont = applyQualifiedDay({
    todayKey: "2026-09-17",
    lastQualifiedDateKey: "2026-09-16",
    currentStreak: 3,
    longestStreak: 5,
  });
  check("consecutive day increments streak", cont.currentStreak === 4 && cont.resetReason === "continue");

  const miss = applyQualifiedDay({
    todayKey: "2026-09-17",
    lastQualifiedDateKey: "2026-09-14",
    currentStreak: 5,
    longestStreak: 5,
  });
  check("missed day resets to 1", miss.currentStreak === 1 && miss.resetReason === "missed_day");

  const same = applyQualifiedDay({
    todayKey: "2026-09-17",
    lastQualifiedDateKey: "2026-09-17",
    currentStreak: 2,
    longestStreak: 4,
  });
  check("same day replay keeps streak", same.currentStreak === 2 && same.resetReason === "same_day");

  const cur = computeCurrentStreakFromDays(
    ["2026-09-15", "2026-09-16", "2026-09-17"],
    "2026-09-17"
  );
  check("current streak from days = 3", cur === 3);

  const broken = computeCurrentStreakFromDays(
    ["2026-09-14", "2026-09-17"],
    "2026-09-17"
  );
  check("gap breaks current streak to 1", broken === 1);

  check("shiftDateKey +1", shiftDateKey("2026-09-17", 1) === "2026-09-18");
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
    const health = await fetch(`${PROBLEM_URL}/api/v1/challenges/today`);
    if (!health.ok && health.status >= 500) {
      console.log("SKIP live: ProblemService not reachable");
      return;
    }
  } catch {
    console.log("SKIP live: ProblemService not reachable");
    return;
  }

  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(root, ".env") });
  const mongoUri = process.env.MONGO_URL || process.env.MONGO_URI;
  const internal =
    process.env.INTERNAL_SERVICE_SECRET || "dev-internal-service-secret";

  const guestToday = await request(PROBLEM_URL, "/api/v1/challenges/today");
  check("guest today 200", guestToday.status === 200);
  const gData = guestToday.json?.data;
  check("guest today has dateKey + challenge", Boolean(gData?.dateKey && gData?.challenge));
  check(
    "guest today same canonical problem shape",
    gData?.challenge?.problemId != null || gData?.challenge?.accessLocked === true
  );

  const guestAgain = await request(PROBLEM_URL, "/api/v1/challenges/today");
  check(
    "canonical challenge stable for guests",
    guestAgain.json?.data?.challenge?.problemId === gData?.challenge?.problemId &&
      guestAgain.json?.data?.dateKey === gData?.dateKey
  );

  const spoofComplete = await request(
    PROBLEM_URL,
    "/api/v1/challenges/complete",
    "POST",
    {},
    { dateKey: "2099-01-01", completedAt: "2099-01-01T00:00:00.000Z" }
  );
  check("complete requires auth", spoofComplete.status === 401);

  // Register/login a user
  const email = `p12-streak-${Date.now()}@test.local`;
  const password = "TestPass123!";
  await request(AUTH_URL, "/api/v1/auth/signup", "POST", {}, {
    name: "P12 Streak",
    email,
    password,
  });
  const login = await request(AUTH_URL, "/api/v1/auth/login", "POST", {}, {
    email,
    password,
  });
  const token =
    login.json?.data?.accessToken ||
    login.json?.data?.token ||
    login.json?.accessToken;
  check("user login", Boolean(token), String(login.status));
  if (!token) return;

  const auth = { Authorization: `Bearer ${token}` };

  const spoof = await request(
    PROBLEM_URL,
    "/api/v1/challenges/complete",
    "POST",
    auth,
    { dateKey: "2099-01-01", completedAt: new Date().toISOString() }
  );
  check(
    "API rejects client dateKey spoof",
    spoof.status === 400 || spoof.status === 422,
    `status=${spoof.status}`
  );

  const tz = await request(
    PROBLEM_URL,
    "/api/v1/challenges/streak/timezone",
    "PUT",
    auth,
    { timezone: "Asia/Kolkata" }
  );
  check("set timezone Asia/Kolkata", tz.status === 200);
  check(
    "timezone persisted",
    tz.json?.data?.timezone === "Asia/Kolkata"
  );

  const todayAuthed = await request(
    PROBLEM_URL,
    "/api/v1/challenges/today",
    "GET",
    auth
  );
  const dateKey = todayAuthed.json?.data?.dateKey;
  const problemId = todayAuthed.json?.data?.challenge?.problemId;
  check("authed today", todayAuthed.status === 200 && Boolean(dateKey));

  // No accepted submission → complete fails
  const noSub = await request(
    PROBLEM_URL,
    "/api/v1/challenges/complete",
    "POST",
    auth,
    {}
  );
  check(
    "complete blocked without accepted submission",
    noSub.status === 400,
    `status=${noSub.status} msg=${noSub.json?.message}`
  );

  // Internal qualify (server clock) — consecutive + duplicate
  if (problemId) {
    const q1 = await request(
      PROBLEM_URL,
      "/api/v1/internal/challenges/qualify",
      "POST",
      { "x-internal-secret": internal },
      {
        userId: login.json?.data?.user?.id || login.json?.data?.user?._id || login.json?.data?.userId,
        problemId,
        submissionId: "selftest-sub-1",
      }
    );

    // Resolve userId from /streak if register payload shape varies
    let userId =
      login.json?.data?.user?.id ||
      login.json?.data?.user?._id ||
      login.json?.data?.userId;
    if (!userId && mongoUri) {
      // decode jwt payload (no verify needed for test id peek)
      try {
        const payload = JSON.parse(
          Buffer.from(String(token).split(".")[1], "base64url").toString()
        );
        userId = payload.userId;
      } catch {
        /* ignore */
      }
    }

    const q1b = await request(
      PROBLEM_URL,
      "/api/v1/internal/challenges/qualify",
      "POST",
      { "x-internal-secret": internal },
      { userId, problemId, submissionId: "selftest-sub-1" }
    );
    check(
      "internal qualify succeeds",
      q1b.status === 200 && q1b.json?.data?.dateKey === dateKey,
      `status=${q1b.status} ${JSON.stringify(q1b.json?.message || q1b.json)}`
    );
    check(
      "streak at least 1 after qualify",
      (q1b.json?.data?.streak?.currentStreak || 0) >= 1
    );

    const q2 = await request(
      PROBLEM_URL,
      "/api/v1/internal/challenges/qualify",
      "POST",
      { "x-internal-secret": internal },
      { userId, problemId, submissionId: "selftest-sub-2" }
    );
    check("duplicate completion idempotent", q2.status === 200 && q2.json?.data?.duplicate === true);
    check(
      "duplicate does not inflate streak",
      q2.json?.data?.streak?.currentStreak === q1b.json?.data?.streak?.currentStreak
    );

    void q1;
  }

  // History window for free user
  const far = "2020-01-01";
  const hist = await request(
    PROBLEM_URL,
    `/api/v1/challenges/date/${far}`,
    "GET",
    auth
  );
  check(
    "historical access locked for free",
    hist.status === 403,
    `status=${hist.status}`
  );

  const streak = await request(PROBLEM_URL, "/api/v1/challenges/streak", "GET", auth);
  check("streak endpoint", streak.status === 200);
  check("weekly/monthly goals present", Boolean(streak.json?.data?.weeklyGoal && streak.json?.data?.monthlyGoal));

  const cal = await request(
    PROBLEM_URL,
    `/api/v1/challenges/calendar?from=${shiftSafe(dateKey, -7)}&to=${dateKey}`,
    "GET",
    auth
  );
  check("calendar endpoint", cal.status === 200);

  const freezeDenied = await request(
    PROBLEM_URL,
    "/api/v1/challenges/streak/freeze",
    "POST",
    auth,
    {}
  );
  check(
    "freeze blocked without premium",
    freezeDenied.status === 403,
    `status=${freezeDenied.status}`
  );

  // Missed-day / consecutive via mongoose ledger
  if (mongoUri && problemId) {
    const mongoose = await import("mongoose");
    await mongoose.default.connect(mongoUri);
    let userId = "";
    try {
      userId = JSON.parse(
        Buffer.from(String(token).split(".")[1], "base64url").toString()
      ).userId;
    } catch {
      /* */
    }
    if (userId) {
      const Completions = mongoose.default.connection.collection(
        "userchallengecompletions"
      );
      const States = mongoose.default.connection.collection("userstreakstates");
      const y1 = shiftSafe(dateKey, -1);
      const y2 = shiftSafe(dateKey, -2);
      await Completions.deleteMany({ userId });
      await Completions.insertMany([
        {
          userId,
          dateKey: y2,
          problemId,
          completedAt: new Date(),
          kind: "completed",
        },
        {
          userId,
          dateKey: y1,
          problemId,
          completedAt: new Date(),
          kind: "completed",
        },
        {
          userId,
          dateKey,
          problemId,
          completedAt: new Date(),
          kind: "completed",
        },
      ]);
      await States.updateOne(
        { userId },
        {
          $set: {
            lastQualifiedDateKey: dateKey,
            currentStreak: 3,
            longestStreak: 3,
            timezone: "Asia/Kolkata",
          },
        },
        { upsert: true }
      );
      const streak2 = await request(
        PROBLEM_URL,
        "/api/v1/challenges/streak",
        "GET",
        auth
      );
      check(
        "consecutive days streak = 3",
        streak2.json?.data?.currentStreak === 3,
        `got ${streak2.json?.data?.currentStreak}`
      );

      // Miss a day: remove yesterday
      await Completions.deleteOne({ userId, dateKey: y1 });
      await States.updateOne(
        { userId },
        { $set: { lastQualifiedDateKey: dateKey, currentStreak: 1 } }
      );
      // Recompute by clearing today and only keeping old far day + today would be weird;
      // instead keep only y2 and today → gap → current should be 1
      await Completions.deleteMany({ userId });
      await Completions.insertMany([
        {
          userId,
          dateKey: y2,
          problemId,
          completedAt: new Date(),
          kind: "completed",
        },
        {
          userId,
          dateKey,
          problemId,
          completedAt: new Date(),
          kind: "completed",
        },
      ]);
      const streak3 = await request(
        PROBLEM_URL,
        "/api/v1/challenges/streak",
        "GET",
        auth
      );
      check(
        "missed day breaks streak to 1",
        streak3.json?.data?.currentStreak === 1,
        `got ${streak3.json?.data?.currentStreak}`
      );
    }
    await mongoose.default.disconnect();
  }
}

function shiftSafe(dateKey: string, delta: number): string {
  if (!dateKey) return "2026-01-01";
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

unitRules()
  .then(() => live())
  .then(() => {
    console.log(`\n${passed} PASS, ${failed} FAIL`);
    process.exit(failed ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
