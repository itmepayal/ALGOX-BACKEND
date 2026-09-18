/**
 * Phase 17 — Spaced Repetition Engine.
 * Run: cd server/ProblemService && npx tsx scripts/spaced-repetition.selftest.ts
 *
 * VERIFY: first solve, review, confidence, reschedule, overdue, duplicate, timezone.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const clientSrc = path.join(root, "../../client/src");
const authFeatures = path.join(root, "../AuthService/src/subscription/features.ts");
const evalWorker = path.join(
  root,
  "../EvaluationService/src/workers/evaluation.worker.ts"
);

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

const schedule = read("src/utils/srsSchedule.ts");
const model = read("src/models/userSpacedRepetition.model.ts");
const service = read("src/services/srs.service.ts");
const router = read("src/routers/v1/srs.router.ts");
const indexRouter = read("src/routers/v1/index.router.ts");
const featuresAuth = fs.readFileSync(authFeatures, "utf8");
const featuresClient = readClient("access/features.ts");
const worker = fs.readFileSync(evalWorker, "utf8");
const clientApi = readClient("api/srsApi.ts");
const panel = readClient("components/SpacedRepetitionPanel.tsx");
const dash = readClient("components/Dashboard.tsx");

check(
  "deterministic schedule Hard/Okay/Easy",
  schedule.includes('feedback === "hard"') &&
    schedule.includes('feedback === "okay"') &&
    schedule.includes("nextIntervalDays")
);
check(
  "model tracks required fields",
  model.includes("lastSolvedAt") &&
    model.includes("confidence") &&
    model.includes("attempts") &&
    model.includes("nextReviewAt") &&
    model.includes("reviewCount")
);
check(
  "no localStorage dependency in service",
  !service.includes("localStorage")
);
check(
  "duplicate seed does not reset schedule",
  service.includes("duplicate: true") &&
    service.includes("without resetting")
);
check(
  "premium reschedule gated",
  service.includes("premium.spaced_repetition") &&
    service.includes("reschedule")
);
check(
  "routes /reviews + internal seed",
  router.includes("/queue") &&
    indexRouter.includes("/reviews") &&
    indexRouter.includes("mountSrsInternal") &&
    router.includes("/internal/srs/seed-on-solve")
);
check(
  "feature catalog premium.spaced_repetition",
  featuresAuth.includes("premium.spaced_repetition") &&
    featuresClient.includes("premium.spaced_repetition")
);
check(
  "evaluation seeds on ACCEPTED",
  worker.includes("srs-seed-on-solve") &&
    worker.includes("/internal/srs/seed-on-solve")
);
check(
  "client Reviews tab",
  dash.includes('"reviews"') &&
    dash.includes("SpacedRepetitionPanel") &&
    clientApi.includes("/reviews/queue") &&
    panel.includes("Hard")
);

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

async function unitSchedule() {
  const mod = await import("../src/utils/srsSchedule.ts");
  check("first interval 1d", mod.FIRST_INTERVAL_DAYS === 1);
  check("hard → 1", mod.nextIntervalDays(9, "hard", false) === 1);
  check("okay 1→3", mod.nextIntervalDays(1, "okay", false) === 3);
  check("okay cap 30 free", mod.nextIntervalDays(20, "okay", false) === 30);
  check("easy 1→5 free", mod.nextIntervalDays(1, "easy", false) === 5);
  check("easy cap 90 free", mod.nextIntervalDays(30, "easy", false) === 90);
  check(
    "premium hard soft-reset",
    mod.nextIntervalDays(8, "hard", true) === 4
  );
  check("premium easy ×7", mod.nextIntervalDays(1, "easy", true) === 7);
  check(
    "confidence scores",
    mod.confidenceScore("hard") === 1 &&
      mod.confidenceScore("okay") === 3 &&
      mod.confidenceScore("easy") === 5
  );
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
  const authEnv = dotenv.config({
    path: path.join(root, "../AuthService/.env"),
  });
  const authMongo =
    authEnv.parsed?.MONGO_URL ||
    authEnv.parsed?.MONGO_URI ||
    process.env.AUTH_MONGO_URL;
  const problemMongo = process.env.MONGO_URL || process.env.MONGO_URI;
  const internalSecret = (
    process.env.INTERNAL_SERVICE_SECRET ||
    dotenv.config({ path: path.join(root, ".env") }).parsed
      ?.INTERNAL_SERVICE_SECRET ||
    "dev-internal-service-secret"
  ).trim();

  const email = `p17_srs_${Date.now()}@test.local`;
  const password = "TestPass123!";
  await request(AUTH_URL, "/api/v1/auth/signup", "POST", {}, {
    name: "P17 SRS",
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

  const mongoose = await import("mongoose");
  const problemId = new mongoose.default.Types.ObjectId().toString();

  // Timezone
  const badTz = await request(
    PROBLEM_URL,
    "/api/v1/reviews/timezone",
    "PUT",
    auth,
    { timezone: "Not/AZone" }
  );
  check("invalid timezone rejected", badTz.status === 400 || badTz.status >= 400);

  const tz = await request(
    PROBLEM_URL,
    "/api/v1/reviews/timezone",
    "PUT",
    auth,
    { timezone: "Asia/Kolkata" }
  );
  check(
    "timezone Asia/Kolkata",
    tz.status === 200 && tz.json?.data?.timezone === "Asia/Kolkata",
    `status=${tz.status}`
  );

  // First solve via enroll
  const first = await request(
    PROBLEM_URL,
    `/api/v1/reviews/enroll/${problemId}`,
    "POST",
    auth
  );
  check("first solve enroll 200", first.status === 200, `status=${first.status}`);
  check("first card created", first.json?.data?.created === true);
  check(
    "first nextReview ~+1d",
    first.json?.data?.card?.intervalDays === 1 &&
      first.json?.data?.card?.reviewCount === 0
  );

  const next1 = new Date(first.json.data.card.nextReviewAt).getTime();
  const dup = await request(
    PROBLEM_URL,
    `/api/v1/reviews/enroll/${problemId}`,
    "POST",
    auth
  );
  check("duplicate review seed", dup.json?.data?.duplicate === true);
  check(
    "duplicate keeps schedule",
    new Date(dup.json.data.card.nextReviewAt).getTime() === next1 &&
      (dup.json.data.card.attempts || 0) >= 2
  );

  // Internal seed (eval path)
  const seed = await request(
    PROBLEM_URL,
    "/api/v1/internal/srs/seed-on-solve",
    "POST",
    { "x-internal-secret": internalSecret },
    {
      userId,
      problemId,
      difficulty: "hard",
    }
  );
  check(
    "internal seed idempotent",
    seed.status === 200 && seed.json?.data?.duplicate === true
  );

  // Review confidence
  const review = await request(
    PROBLEM_URL,
    `/api/v1/reviews/${problemId}/review`,
    "POST",
    auth,
    { feedback: "okay", clientNow: "2099-01-01T00:00:00.000Z" }
  );
  check("review okay 200", review.status === 200, `status=${review.status}`);
  check(
    "confidence okay score 3",
    review.json?.data?.card?.confidence === "okay" &&
      review.json?.data?.card?.confidenceScore === 3
  );
  check(
    "interval advanced 1→3",
    review.json?.data?.schedule?.previousIntervalDays === 1 &&
      review.json?.data?.schedule?.intervalDays === 3
  );

  // Free reschedule gated
  const freeResched = await request(
    PROBLEM_URL,
    `/api/v1/reviews/${problemId}/reschedule`,
    "POST",
    auth,
    { delayDays: 5 }
  );
  check(
    "free reschedule gated 403",
    freeResched.status === 403,
    `status=${freeResched.status}`
  );

  // Overdue: backdate nextReviewAt in mongo
  if (problemMongo && userId) {
    const pconn = await mongoose.default
      .createConnection(problemMongo)
      .asPromise();
    const Cards = pconn.collection("userspacedrepetitions");
    await Cards.updateOne(
      {
        userId,
        problemId: new mongoose.default.Types.ObjectId(problemId),
      },
      {
        $set: {
          nextReviewAt: new Date(Date.now() - 3 * 86400000),
          status: "active",
        },
      }
    );

    const queue = await request(
      PROBLEM_URL,
      "/api/v1/reviews/queue",
      "GET",
      auth
    );
    check("queue 200", queue.status === 200);
    check(
      "overdue bucket has card",
      (queue.json?.data?.counts?.overdue || 0) >= 1 ||
        (queue.json?.data?.buckets?.overdue || []).some(
          (c: any) => c.problemId === problemId
        ),
      JSON.stringify(queue.json?.data?.counts)
    );
    check(
      "timezone echoed",
      queue.json?.data?.timezone === "Asia/Kolkata"
    );
    check(
      "free has no recommendations",
      Array.isArray(queue.json?.data?.recommendations) &&
        queue.json.data.recommendations.length === 0
    );

    // Premium grant
    if (authMongo) {
      const aconn = await mongoose.default
        .createConnection(authMongo)
        .asPromise();
      await aconn.collection("users").updateOne(
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

      const resched = await request(
        PROBLEM_URL,
        `/api/v1/reviews/${problemId}/reschedule`,
        "POST",
        auth,
        { delayDays: 7 }
      );
      check(
        "premium reschedule ok",
        resched.status === 200 &&
          resched.json?.data?.card?.intervalDays >= 1,
        `status=${resched.status}`
      );

      const easy = await request(
        PROBLEM_URL,
        `/api/v1/reviews/${problemId}/review`,
        "POST",
        auth,
        { feedback: "easy" }
      );
      check(
        "premium easy advanced schedule",
        easy.status === 200 &&
          easy.json?.data?.schedule?.advanced === true,
        JSON.stringify(easy.json?.data?.schedule)
      );

      const qPrem = await request(
        PROBLEM_URL,
        "/api/v1/reviews/queue",
        "GET",
        auth
      );
      check(
        "premium queue flag",
        qPrem.json?.data?.premium === true
      );

      await aconn.close();
    }

    await Cards.deleteMany({ userId });
    await pconn.collection("usersrsprefs").deleteMany({ userId });
    await pconn.close();
  }
}

unitSchedule()
  .then(() => live())
  .then(() => {
    console.log(`\nResult: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("SELFTEST ERROR", err);
    process.exit(1);
  });
