/**
 * Topic-wise Skill Rating V1 — Static & Architectural Self-Test
 * Run: cd server/ProblemService && npx tsx scripts/topic-skill.selftest.ts
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

const service = read("src/services/skill.service.ts");
const model = read("src/models/topicSkillProfile.model.ts");
const controller = read("src/controllers/skill.controller.ts");
const router = read("src/routers/v1/skill.router.ts");
const v1Router = read("src/routers/v1/index.router.ts");

check(
  "TopicSkillProfile model defines schema with unique userId+topic index and rating index",
  model.includes("userId: 1, topic: 1") &&
    model.includes("unique: true") &&
    model.includes("userId: 1, rating: -1")
);

check(
  "TopicSkillProfile schema supports rating, confidence, problemsAttempted, problemsSolved, trend",
  model.includes("confidence:") &&
    model.includes("problemsAttempted:") &&
    model.includes("problemsSolved:") &&
    model.includes("trend:") &&
    model.includes("acceptanceRate:")
);

check(
  "skill.service calculates rating with difficulty weights and multi-topic normalization",
  service.includes("topicWeight = 1 / topics.length") &&
    service.includes("solvedPoints = 15") &&
    service.includes("solvedPoints = 25") &&
    service.includes("solvedPoints = 40")
);

check(
  "skill.service supports confidence modeling (LOW, MEDIUM, HIGH) and trend calculation",
  service.includes("confidence = \"HIGH\"") &&
    service.includes("confidence = \"MEDIUM\"") &&
    service.includes("trend = \"IMPROVING\"") &&
    service.includes("trend = \"DECLINING\"")
);

check(
  "skill.service integrates Redis caching and cache invalidation",
  service.includes("skill_profile:${userId}") &&
    service.includes("getRedisClient")
);

check(
  "skill.controller enforces authenticated user extraction (no client-driven userId)",
  controller.includes("req.user?.userId") &&
    controller.includes("UnauthorizedError")
);

check(
  "skill.router exposes GET /me and POST /me/recalculate behind authenticateJwt",
  router.includes("authenticateJwt") &&
    router.includes("/me") &&
    router.includes("/me/recalculate")
);

check(
  "v1Router registers /skills endpoint",
  v1Router.includes("/skills") && v1Router.includes("skillRouter")
);

console.log(`\n========================================`);
console.log(`TOPIC SKILL RATING SELFTEST COMPLETE`);
console.log(`PASSED: ${passed} | FAILED: ${failed}`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
