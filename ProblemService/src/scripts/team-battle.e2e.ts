import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { Team } from "../models/team.model";
import { TeamMember } from "../models/teamMember.model";
import { TeamBattle } from "../models/teamBattle.model";
import { teamService } from "../services/team.service";
import { teamBattleService } from "../services/teamBattle.service";

async function runE2E() {
  console.log("=== TEAM / CLAN BATTLE V1 — END TO END TEST ===");

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

  const userA = new Types.ObjectId().toString();
  const userB = new Types.ObjectId().toString();
  const userC = new Types.ObjectId().toString();
  const userD = new Types.ObjectId().toString();

  try {
    // 1. User A creates Team A
    const teamA = await teamService.createTeam(userA, `Thunder Clan ${Date.now()}`, "Thunder Clan E2E");
    assert(Boolean(teamA._id), "1. User A creates Team A");

    // 2. User C creates Team B
    const teamB = await teamService.createTeam(userC, `Lightning Clan ${Date.now()}`, "Lightning Clan E2E");
    assert(Boolean(teamB._id), "2. User C creates Team B");

    // 3. User A invites User B to Team A & User B accepts
    const inviteB = await teamService.inviteUser(teamA._id.toString(), userA, userB);
    assert(inviteB.status === "PENDING", "3. User A invites User B to Team A");

    const updatedTeamA = await teamService.acceptInvitation(userB, inviteB._id.toString());
    assert(updatedTeamA.memberCount === 2, "4. User B accepts invitation and joins Team A");

    // 4. User C invites User D to Team B & User D accepts
    const inviteD = await teamService.inviteUser(teamB._id.toString(), userC, userD);
    await teamService.acceptInvitation(userD, inviteD._id.toString());

    // 5. Team A challenges Team B to Team Battle
    const battle = await teamBattleService.challengeTeam(
      userA,
      teamA._id.toString(),
      teamB._id.toString(),
      1800
    );
    assert(battle.state === "PENDING_ACCEPTANCE", "5. Challenge issued successfully");

    // 6. User C (Team B Captain/Owner) accepts challenge
    const lobbyBattle = await teamBattleService.acceptBattle(userC, battle._id.toString());
    assert(lobbyBattle.state === "LOBBY", "6. Team B accepts challenge (State -> LOBBY)");

    // 7. Captains select participants
    await teamBattleService.selectParticipants(userA, battle._id.toString(), teamA._id.toString(), [userA, userB]);
    await teamBattleService.selectParticipants(userC, battle._id.toString(), teamB._id.toString(), [userC, userD]);

    // 8. Start Battle
    const liveBattle = await teamBattleService.startBattle(userA, battle._id.toString());
    assert(liveBattle.state === "LIVE" && liveBattle.endsAt !== null, "7. Battle started (State -> LIVE)");

    // 9. Simulate submissions
    await teamBattleService.recordSubmissionScore(liveBattle._id.toString(), teamA._id.toString(), 250);
    await teamBattleService.recordSubmissionScore(liveBattle._id.toString(), teamB._id.toString(), 150);

    // 10. Finish Battle & Settlement
    const completedBattle = await teamBattleService.finishBattle(liveBattle._id.toString());
    assert(completedBattle.state === "COMPLETED" && completedBattle.winnerTeamId?.toString() === teamA._id.toString(), "8. Battle finished with Team A as Winner");

    // 11. Verify Team Ratings
    const finalTeamA = await Team.findById(teamA._id);
    const finalTeamB = await Team.findById(teamB._id);
    assert(finalTeamA!.rating > 1200 && finalTeamB!.rating < 1200, "9. Team ratings updated dynamically via ELO formula");
    assert(finalTeamA!.wins === 1 && finalTeamB!.losses === 1, "10. Team win/loss statistics recorded");

    // 12. Verify Leaderboard
    const lb = await teamBattleService.getTeamLeaderboard(1, 10);
    const topTeam = lb.items[0];
    assert(topTeam.slug === teamA.slug, "11. Team A correctly ranked #1 on Global Team Leaderboard");

    // Clean up
    await Team.deleteMany({ _id: { $in: [teamA._id, teamB._id] } });
    await TeamMember.deleteMany({ teamId: { $in: [teamA._id, teamB._id] } });
    await TeamBattle.deleteMany({ _id: battle._id });

    console.log(`\nRESULTS: ${passed} PASSED, ${failed} FAILED`);
  } catch (err) {
    console.error("E2E Test execution error:", err);
    failed++;
  } finally {
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runE2E();
