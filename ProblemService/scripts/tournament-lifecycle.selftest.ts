/**
 * Tournament V1 Static & Unit Self-Test
 * Run: cd server/ProblemService && npx tsx scripts/tournament-lifecycle.selftest.ts
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

const service = read("src/services/tournament.service.ts");
const model = read("src/models/tournament.model.ts");
const matchModel = read("src/models/tournamentMatch.model.ts");
const partModel = read("src/models/tournamentParticipant.model.ts");
const router = read("src/routers/v1/tournament.router.ts");
const adminRouter = read("src/routers/v1/adminTournament.router.ts");
const panel = readClient("components/tournaments/TournamentPanel.tsx");
const bracket = readClient("components/tournaments/TournamentBracket.tsx");

check(
  "Tournament model supports status enum & maxParticipants",
  model.includes("SINGLE_ELIMINATION") &&
    model.includes("REGISTRATION_OPEN") &&
    model.includes("IN_PROGRESS") &&
    model.includes("maxParticipants")
);

check(
  "TournamentParticipant model has unique index on tournamentId + userId",
  partModel.includes("tournamentId: 1, userId: 1") &&
    partModel.includes("unique: true")
);

check(
  "TournamentMatch model has unique index on tournamentId + roundNumber + matchNumber",
  matchModel.includes("tournamentId: 1, roundNumber: 1, matchNumber: 1") &&
    matchModel.includes("unique: true")
);

check(
  "TournamentService supports seedAndGenerateBracket",
  service.includes("seedAndGenerateBracket") &&
    service.includes("getPairings")
);

check(
  "TournamentService supports atomic capacity enforcement",
  service.includes("participantCount: { $lt: tournament.maxParticipants }") &&
    service.includes("ConflictError(\"Tournament is full\")")
);

check(
  "TournamentService supports processMatchBattleCompletion idempotency",
  service.includes("processMatchBattleCompletion") &&
    service.includes("status: { $in: [\"READY\", \"LIVE\"] }")
);

check(
  "TournamentService emits realtime events",
  service.includes("tournament.started") &&
    service.includes("tournament.round_started") &&
    service.includes("tournament.completed")
);

check(
  "Public tournament router registered",
  router.includes("/:slug/register") &&
    router.includes("/:slug/bracket") &&
    router.includes("/:slug/results")
);

check(
  "Admin tournament router registered",
  adminRouter.includes("/:tournamentId/publish") &&
    adminRouter.includes("/:tournamentId/seed") &&
    adminRouter.includes("/:tournamentId/start")
);

check(
  "Frontend TournamentPanel component exists",
  panel.includes("Competitive Coding Tournaments") &&
    panel.includes("TournamentBracket")
);

check(
  "Frontend TournamentBracket component exists",
  bracket.includes("Quarter Finals") || bracket.includes("totalRounds")
);

console.log(`\n==================================================`);
console.log(`Tournament Selftest Completed: ${passed} passed, ${failed} failed`);
console.log(`==================================================\n`);

process.exit(failed > 0 ? 1 : 0);
