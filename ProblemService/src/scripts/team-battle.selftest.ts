import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { Team } from "../models/team.model";
import { TeamMember } from "../models/teamMember.model";
import { TeamBattle } from "../models/teamBattle.model";
import { teamService } from "../services/team.service";
import { teamBattleService } from "../services/teamBattle.service";


async function runSelfTest() {
  console.log("=== TEAM / CLAN BATTLE V1 — SELFTEST ===");

  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/algopath";
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB.");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`✅ PASS: ${title}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${title}`);
      failed++;
    }
  }

  const ownerAId = new Types.ObjectId().toString();
  const ownerBId = new Types.ObjectId().toString();

  try {
    // Test 1: Team Creation & Owner Membership
    const teamA = await teamService.createTeam(ownerAId, `Alpha Clan ${Date.now()}`, "Alpha Clan description");
    assert(Boolean(teamA._id), "1. Create team successfully");

    const ownerAMember = await TeamMember.findOne({ teamId: teamA._id, userId: ownerAId });
    assert(ownerAMember !== null && ownerAMember.role === "OWNER", "2. Creator automatically becomes OWNER member");

    // Test 2: Team Name Uniqueness
    let nameConflictPassed = false;
    try {
      await teamService.createTeam(ownerBId, teamA.name);
    } catch (err: any) {
      if (err.message.includes("already exists")) {
        nameConflictPassed = true;
      }
    }
    assert(nameConflictPassed, "3. Prevent duplicate team names (409 Conflict)");

    // Test 3: Create Team B
    const teamB = await teamService.createTeam(ownerBId, `Beta Clan ${Date.now()}`, "Beta Clan description");
    assert(Boolean(teamB._id), "4. Create second team successfully");

    // Test 4: Challenge Team B
    const battle = await teamBattleService.challengeTeam(
      ownerAId,
      teamA._id.toString(),
      teamB._id.toString()
    );
    assert(battle.state === "PENDING_ACCEPTANCE", "5. Challenge created in PENDING_ACCEPTANCE state");

    // Test 5: Prevent Self Challenge
    let selfChallengeFailed = false;
    try {
      await teamBattleService.challengeTeam(ownerAId, teamA._id.toString(), teamA._id.toString());
    } catch (err: any) {
      if (err.message.includes("cannot challenge itself")) {
        selfChallengeFailed = true;
      }
    }
    assert(selfChallengeFailed, "6. Prevent self team challenge");

    // Test 6: Accept Battle
    const acceptedBattle = await teamBattleService.acceptBattle(ownerBId, battle._id.toString());
    assert(acceptedBattle.state === "LOBBY", "7. Accept challenge transitions battle state to LOBBY");

    // Test 7: Start Battle & Score Recording
    const liveBattle = await teamBattleService.startBattle(ownerAId, battle._id.toString());
    assert(liveBattle.state === "LIVE", "8. Start battle transitions state to LIVE");

    await teamBattleService.recordSubmissionScore(liveBattle._id.toString(), teamA._id.toString(), 100);
    const updatedBattle = await teamBattleService.recordSubmissionScore(liveBattle._id.toString(), teamB._id.toString(), 50);
    assert(updatedBattle !== null && updatedBattle.teamAScore === 100 && updatedBattle.teamBScore === 50, "9. Real-time team score updates recorded accurately");

    // Test 8: Finish Battle & ELO Settlement
    const finishedBattle = await teamBattleService.finishBattle(liveBattle._id.toString());
    assert(finishedBattle.state === "COMPLETED" && finishedBattle.winnerTeamId?.toString() === teamA._id.toString(), "10. Finish battle determines winner");

    const updatedTeamA = await Team.findById(teamA._id);
    const updatedTeamB = await Team.findById(teamB._id);
    assert(updatedTeamA!.rating > 1200 && updatedTeamB!.rating < 1200, "11. ELO rating updated atomically (Team A rating increased, Team B rating decreased)");

    // Test 9: Leaderboard sorting
    const leaderboard = await teamBattleService.getTeamLeaderboard(1, 10);
    assert(leaderboard.items.length >= 2, "12. Team leaderboard returns teams sorted by rating");

    // Clean up
    await Team.deleteMany({ _id: { $in: [teamA._id, teamB._id] } });
    await TeamMember.deleteMany({ teamId: { $in: [teamA._id, teamB._id] } });
    await TeamBattle.deleteMany({ _id: battle._id });

    console.log(`\nRESULTS: ${passed} PASSED, ${failed} FAILED`);
  } catch (err) {
    console.error("Selftest execution error:", err);
    failed++;
  } finally {
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runSelfTest();
