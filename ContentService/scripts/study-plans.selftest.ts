/**
 * Phase 11 — Study plans engine selftest.
 * Run: cd server/ContentService && npx tsx scripts/study-plans.selftest.ts
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

const model = read("src/models/studyPlan.model.ts");
const progress = read("src/models/userStudyPlanProgress.model.ts");
const access = read("src/utils/studyPlanAccess.ts");
const repo = read("src/repositories/content.repository.ts");
const router = read("src/routers/v1/content.router.ts");
const panel = readClient("components/ContentLibraryPanel.tsx");
const api = readClient("api/contentApi.ts");
const learnPersist = readClient("utils/learningPersistence.ts");

check("plan has access/premium/published", model.includes("isPremium") && model.includes("isPublished"));
check("plan has topics/difficulty/effort", model.includes("topics") && model.includes("estimatedMinutes"));
check("plan has prerequisites", model.includes("prerequisiteSlugs"));
check("progress status enum", progress.includes("not_started") && progress.includes("in_progress") && progress.includes("completed"));
check("enroll/resume/complete in repo", repo.includes("enrollStudyPlan") && repo.includes("completeStudyPlan"));
check("premium lock projection", access.includes("accessLocked") && access.includes("locked"));
check("routes enroll/complete/resume/me", router.includes("/enroll") && router.includes("/complete") && router.includes("/resume") && router.includes("progress/me"));
check("client enroll/resume/complete APIs", api.includes("enrollStudyPlan") && api.includes("resumeStudyPlan") && api.includes("completeStudyPlan"));
check("Learn UI enroll + server notice", (panel.includes("Start Learning") || panel.includes("Enroll")) && panel.includes("Progress is saved"));
check("learningPersistence not localStorage SoT", !learnPersist.includes("localStorage"));

const CONTENT_URL = process.env.CONTENT_SERVICE_URL || "http://localhost:3009";
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
    const health = await fetch(`${CONTENT_URL}/api/v1/content/study-plans`);
    if (!health.ok && health.status >= 500) {
      console.log("SKIP live: ContentService not reachable");
      return;
    }
  } catch {
    console.log("SKIP live: ContentService not reachable");
    return;
  }

  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(root, ".env") });
  const mongoUri = process.env.MONGO_URL || process.env.MONGO_URI;
  if (!mongoUri) {
    console.log("SKIP live mongo: no URI");
    return;
  }

  const mongoose = await import("mongoose");
  await mongoose.default.connect(mongoUri);
  const StudyPlan = mongoose.default.connection.collection("studyplans");
  const Progress = mongoose.default.connection.collection("userstudyplanprogresses");

  const freeSlug = `p11-free-${Date.now()}`;
  const premSlug = `p11-prem-${Date.now()}`;
  const freeIns = await StudyPlan.insertOne({
    title: "DSA Fundamentals",
    slug: freeSlug,
    description: "Free fundamentals plan",
    category: "algorithm",
    topics: ["Arrays", "Hashing"],
    difficulty: "beginner",
    estimatedMinutes: 120,
    estimatedDays: 7,
    cards: [
      {
        title: "Arrays",
        description: "Core array drills",
        problemIds: ["p1", "p2"],
      },
      {
        title: "Hashing",
        description: "Maps and sets",
        problemIds: ["p3"],
      },
    ],
    totalProblemsCount: 3,
    access: "FREE",
    isPremium: false,
    isPublished: true,
    prerequisiteSlugs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await StudyPlan.insertOne({
    title: "Interview Preparation",
    slug: premSlug,
    description: "Premium interview plan",
    category: "interview",
    topics: ["Graphs", "DP"],
    difficulty: "advanced",
    estimatedMinutes: 600,
    estimatedDays: 30,
    cards: [
      {
        title: "Graphs",
        description: "Interview graphs",
        problemIds: ["g1", "g2"],
      },
    ],
    totalProblemsCount: 2,
    access: "PREMIUM",
    isPremium: true,
    isPublished: true,
    prerequisiteSlugs: [freeSlug],
    createdAt: new Date(),
    updatedAt: new Date(),
    });

  // Guest list — premium locked
  const list = await request(CONTENT_URL, "/api/v1/content/study-plans");
  check("public list 200", list.status === 200);
  const plans = list.json?.data || [];
  const prem = plans.find((p: any) => p.slug === premSlug);
  const free = plans.find((p: any) => p.slug === freeSlug);
  check("free plan listed unlocked", free && !free.accessLocked);
  check("premium plan listed locked for guest", prem && prem.accessLocked === true);
  check(
    "locked premium hides problem ids",
    prem && (!prem.problemIds || prem.problemIds.length === 0)
  );

  // Guest enroll unauthorized
  const guestEnroll = await request(
    CONTENT_URL,
    `/api/v1/content/study-plans/${freeSlug}/enroll`,
    "POST"
  );
  check(
    "enroll requires auth",
    guestEnroll.status === 401 || guestEnroll.status === 403
  );

  // Free user signup + enroll/progress/resume/complete
  const email = `p11_${Date.now()}@test.local`;
  const password = "TestPass123!";
  await request(AUTH_URL, "/api/v1/auth/signup", "POST", {}, {
    name: "P11 User",
    email,
    password,
  });
  const login = await request(AUTH_URL, "/api/v1/auth/login", "POST", {}, {
    email,
    password,
  });
  const token = login.json?.data?.accessToken || login.json?.data?.token;
  check("user login", Boolean(token));
  if (!token) {
    await StudyPlan.deleteMany({ slug: { $in: [freeSlug, premSlug] } });
    await mongoose.default.disconnect();
    return;
  }
  const auth = { Authorization: `Bearer ${token}` };

  const enroll = await request(
    CONTENT_URL,
    `/api/v1/content/study-plans/${freeSlug}/enroll`,
    "POST",
    auth
  );
  check("enroll free plan", enroll.status === 200);
  check(
    "enroll status not_started",
    enroll.json?.data?.status === "not_started" ||
      enroll.json?.data?.enrolled === true
  );

  const mark = await request(
    CONTENT_URL,
    "/api/v1/content/study-plans/progress",
    "POST",
    auth,
    { studyPlanSlug: freeSlug, problemId: "p1" }
  );
  check("mark progress", mark.status === 200);
  check("status in_progress", mark.json?.data?.status === "in_progress");
  check("resume points to next", mark.json?.data?.resumeProblemId === "p2");

  const resume = await request(
    CONTENT_URL,
    `/api/v1/content/study-plans/${freeSlug}/resume`,
    "GET",
    auth
  );
  check("resume endpoint", resume.status === 200);
  check(
    "resume problem id",
    resume.json?.data?.resumeProblemId === "p2" ||
      resume.json?.data?.resumeProblemId === "p3"
  );

  // Cross-device: progress/me reflects server state
  const mine = await request(
    CONTENT_URL,
    "/api/v1/content/study-plans/progress/me",
    "GET",
    auth
  );
  check("list my progress", mine.status === 200);
  const mineRow = (mine.json?.data || []).find(
    (r: any) => r.studyPlanSlug === freeSlug
  );
  check("progress persisted server-side", Boolean(mineRow) && mineRow.solvedCount >= 1);

  const complete = await request(
    CONTENT_URL,
    `/api/v1/content/study-plans/${freeSlug}/complete`,
    "POST",
    auth
  );
  check("complete plan", complete.status === 200);
  check("status completed", complete.json?.data?.status === "completed");

  // Premium lock for free user
  const premEnroll = await request(
    CONTENT_URL,
    `/api/v1/content/study-plans/${premSlug}/enroll`,
    "POST",
    auth
  );
  check(
    "premium enroll blocked for free user",
    premEnroll.status === 403 ||
      premEnroll.json?.code === "PREMIUM_REQUIRED" ||
      premEnroll.json?.code === "PREREQUISITE_REQUIRED"
  );

  const premDetail = await request(
    CONTENT_URL,
    `/api/v1/content/study-plans/${premSlug}`,
    "GET",
    auth
  );
  check(
    "premium detail locked without entitlement",
    premDetail.json?.data?.accessLocked === true
  );

  await Progress.deleteMany({ studyPlanSlug: { $in: [freeSlug, premSlug] } });
  await StudyPlan.deleteMany({
    _id: { $in: [freeIns.insertedId] },
    slug: { $in: [freeSlug, premSlug] },
  });
  await StudyPlan.deleteMany({ slug: { $in: [freeSlug, premSlug] } });
  await mongoose.default.disconnect();
}

live()
  .then(() => {
    console.log(`\n${passed} PASS, ${failed} FAIL`);
    process.exit(failed ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
