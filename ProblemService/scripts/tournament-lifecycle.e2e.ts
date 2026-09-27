/**
 * Tournament V1 Real 8-User E2E Integration Test
 * Run: cd server/ProblemService && npx tsx scripts/tournament-lifecycle.e2e.ts
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose, { Types } from "mongoose";
import { Tournament } from "../src/models/tournament.model";
import { TournamentParticipant } from "../src/models/tournamentParticipant.model";
import { TournamentMatch } from "../src/models/tournamentMatch.model";
import { UserSnapshot } from "../src/models/user.model";
import { Battle } from "../src/models/battle.model";
import { BattleParticipant } from "../src/models/battleParticipant.model";
import { BattleProblem } from "../src/models/battleProblem.model";
import { Problem } from "../src/models/problem.model";
import { tournamentService } from "../src/services/tournament.service";
import { battleService } from "../src/services/battle.service";

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

async function main() {
  const mongo = process.env.MONGO_URL;
  if (!mongo) throw new Error("MONGO_URL required");
  await mongoose.connect(mongo);

  const actor = { userId: "admin-test-user" };
  const slug = `e2e-tourn-${Date.now()}`;

  // 1. Create 8-player Single Elimination Tournament
  const tournament = await tournamentService.createTournament(
    {
      title: `E2E Tournament ${slug}`,
      slug,
      description: "8-player single elimination E2E test",
      maxParticipants: 8,
      startTime: new Date(Date.now() + 3600_000),
    },
    actor
  );
  check("1. Create 8-player tournament", tournament.format === "SINGLE_ELIMINATION" && tournament.maxParticipants === 8);

  // Publish & Open Registration
  await tournamentService.transitionStatus(tournament.id, "PUBLISHED", actor);
  await tournamentService.transitionStatus(tournament.id, "REGISTRATION_OPEN", actor);

  // 2. Create 8 Real Test Users with varying ratings
  const testUsers: any[] = [];
  for (let i = 1; i <= 8; i++) {
    const user = await UserSnapshot.create({
      name: `Tournament Player ${i}`,
      email: `tournplayer${i}_${Date.now()}@test.com`,
      rating: 1000 + i * 50, // Player 8 has highest rating (1400) -> Seed 1
      status: "active",
    });
    testUsers.push(user);
  }

  // 3. Register 8 Users & test duplicate rejection
  for (let i = 0; i < testUsers.length; i++) {
    const u = testUsers[i];
    const part = await tournamentService.register(slug, {
      id: u._id.toString(),
      name: u.name,
    });
    check(`Register user ${u.name}`, Boolean(part));

    if (i === 0) {
      // Test duplicate registration rejection for user 1
      try {
        await tournamentService.register(slug, {
          id: u._id.toString(),
          name: u.name,
        });
        check("Duplicate registration rejected", false);
      } catch (err: any) {
        check("Duplicate registration rejected", /already registered/i.test(err?.message || ""));
      }
    }
  }

  const overflowUser = await UserSnapshot.create({
    name: "Overflow Player",
    email: `overflow_${Date.now()}@test.com`,
    rating: 1000,
  });

  try {
    await tournamentService.register(slug, {
      id: overflowUser._id.toString(),
      name: overflowUser.name,
    });
    check("Capacity limit enforced (full)", false);
  } catch (err: any) {
    check("Capacity limit enforced (full)", /full/i.test(err?.message || ""));
  }

  // 5. Seed & Generate Bracket Tree (8 players -> 3 rounds)
  await tournamentService.transitionStatus(tournament.id, "REGISTRATION_CLOSED", actor);
  const seeded = await tournamentService.seedAndGenerateBracket(tournament.id, actor);
  check("Seeding completed", seeded.status === "SEEDED");

  const matches = await TournamentMatch.find({ tournamentId: tournament._id }).sort({ roundNumber: 1, matchNumber: 1 });
  check("Bracket generated 7 matches for 8 players", matches.length === 7);

  const round1Matches = matches.filter((m) => m.roundNumber === 1);
  check("Round 1 has 4 Quarter Final matches", round1Matches.length === 4);

  // 6. Start Tournament (Round 1 becomes READY)
  const started = await tournamentService.startTournament(tournament.id, actor);
  check("Tournament started IN_PROGRESS", started.status === "IN_PROGRESS" && started.currentRound === 1);

  // Ensure a test Problem exists for battle execution
  let problem = await Problem.findOne({ status: "published" });
  if (!problem) {
    problem = await Problem.create({
      title: "Tournament Test Problem",
      slug: `tourn-prob-${Date.now()}`,
      description: "Test problem",
      difficulty: "medium",
      status: "published",
      testcases: [{ input: "1", output: "1" }],
    });
  }

  // 7. Simulate Round 1 (Quarter Finals - 4 matches)
  for (const match of round1Matches) {
    const { match: liveMatch, battle } = await tournamentService.startMatchBattle(match.id);
    check(`Start QF match ${match.matchNumber}`, liveMatch.status === "LIVE" && Boolean(battle));

    // Forfeit match participant B so participant A wins legitimately
    await battleService.forfeitBattle((battle._id as Types.ObjectId).toString(), liveMatch.participantB!.userId);
  }

  // Verify Round 2 (Semi Finals)
  const tournamentRound2 = await Tournament.findById(tournament._id);
  check("Advanced to Round 2 (Semi Finals)", tournamentRound2?.currentRound === 2);

  const round2Matches = await TournamentMatch.find({ tournamentId: tournament._id, roundNumber: 2 });
  check("Semi Finals has 2 matches", round2Matches.length === 2);

  // 8. Simulate Round 2 (Semi Finals - 2 matches)
  for (const match of round2Matches) {
    const { match: liveMatch, battle } = await tournamentService.startMatchBattle(match.id);
    check(`Start SF match ${match.matchNumber}`, liveMatch.status === "LIVE" && Boolean(battle));

    // Forfeit match participant B
    await battleService.forfeitBattle((battle._id as Types.ObjectId).toString(), liveMatch.participantB!.userId);
  }

  // Verify Round 3 (Final)
  const tournamentRound3 = await Tournament.findById(tournament._id);
  check("Advanced to Round 3 (Final)", tournamentRound3?.currentRound === 3);

  const finalMatch = await TournamentMatch.findOne({ tournamentId: tournament._id, roundNumber: 3 });
  check("Final match exists", Boolean(finalMatch));

  // 9. Simulate Final Match
  const { match: liveFinal, battle: finalBattle } = await tournamentService.startMatchBattle(finalMatch!.id);
  check("Start Final match", liveFinal.status === "LIVE" && Boolean(finalBattle));

  // Participant A wins Final!
  await battleService.forfeitBattle((finalBattle._id as Types.ObjectId).toString(), liveFinal.participantB!.userId);

  // 10. Verify Tournament Completion & Champion
  const completedTournament = await Tournament.findById(tournament._id);
  check("Tournament COMPLETED", completedTournament?.status === "COMPLETED");
  check("Champion crowned", completedTournament?.championId === finalMatch!.participantA!.userId);

  // 11. Verify Standings & Results
  const results = await tournamentService.getResults(slug);
  check("Results return champion", results.champion?.id === completedTournament?.championId);
  check("Results return all 8 participants", results.participants.length === 8);

  const championPart = results.participants.find((p) => p.userId === completedTournament?.championId);
  check("Champion participant status === CHAMPION", championPart?.status === "CHAMPION" && championPart?.wins === 3);

  // Cleanup test data
  await Promise.all([
    TournamentMatch.deleteMany({ tournamentId: tournament._id }),
    TournamentParticipant.deleteMany({ tournamentId: tournament._id }),
    Tournament.deleteOne({ _id: tournament._id }),
    UserSnapshot.deleteMany({ _id: { $in: [...testUsers.map((u) => u._id), overflowUser._id] } }),
  ]);

  console.log(`\n==================================================`);
  console.log(`Tournament 8-User E2E Completed: ${passed} passed, ${failed} failed`);
  console.log(`==================================================\n`);

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("Tournament E2E Error:", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
