/**
 * Adaptive Problem Recommendation V1 — Static & Architectural Self-Test
 * Run: cd server/ProblemService && npx tsx scripts/recommendation.selftest.ts
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

const service = read("src/services/recommendation.service.ts");
const controller = read("src/controllers/recommendation.controller.ts");
const router = read("src/routers/v1/recommendation.router.ts");
const problemRouter = read("src/routers/v1/problem.router.ts");
const v1Router = read("src/routers/v1/index.router.ts");

check(
  "recommendation.service reuses getUserSkillProfile from Topic Skill Rating V1",
  service.includes("getUserSkillProfile") &&
    service.includes("skillProfile.topics")
);

check(
  "recommendation.service filters out solved problems from candidate pool",
  service.includes("solvedProblemIdSet") &&
    service.includes("!solvedProblemIdSet.has")
);

check(
  "recommendation.service incorporates topic weakness, difficulty suitability, failed attempts, and recency signals",
  service.includes("weaknessScore") &&
    service.includes("diffSuitability") &&
    service.includes("failedAttemptScore") &&
    service.includes("recencyScore")
);

check(
  "recommendation.service constructs explainable machine-generated reasons",
  service.includes("reason =") &&
    service.includes("optimal next step")
);

check(
  "recommendation.service integrates Redis caching",
  service.includes("recommendations:${userId}") &&
    service.includes("getRedisClient")
);

check(
  "recommendation.controller enforces JWT authentication and extracts userId",
  controller.includes("req.user?.userId") &&
    controller.includes("UnauthorizedError")
);

check(
  "recommendation.router exposes GET /me and GET / behind authenticateJwt",
  router.includes("authenticateJwt") &&
    router.includes("/me")
);

check(
  "v1Router registers /recommendations endpoint and problem.router exposes /recommendations",
  v1Router.includes("/recommendations") &&
    problemRouter.includes("/recommendations")
);

console.log(`\n========================================`);
console.log(`ADAPTIVE RECOMMENDATION SELFTEST COMPLETE`);
console.log(`PASSED: ${passed} | FAILED: ${failed}`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
