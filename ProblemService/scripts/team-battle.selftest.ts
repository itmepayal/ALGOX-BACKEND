import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { teamService } from "../src/services/team.service";
import { teamBattleService } from "../src/services/teamBattle.service";
import { Team } from "../src/models/team.model";
import { TeamMember } from "../src/models/teamMember.model";
import { TeamInvitation } from "../src/models/teamInvitation.model";
import { TeamBattle } from "../src/models/teamBattle.model";

async function runSelfTest() {
  console.log("==========================================");
  console.log("🚀 Running Team / Clan Battle V1 Self-Test");
  console.log("==========================================\n");

  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/leetcode_problem_service";
  await mongoose.connect(mongoUri);

  const ownerAId = new Types.ObjectId().toString();
  const memberAId = new Types.ObjectId().toString();
  const ownerBId = new Types.ObjectId().toString();

  try {
    // 1. Create Team A
    console.log("[1] Creating Team A...");
    const teamAName = `SelfTest Team A ${Date.now()}`;
    const teamA = await teamService.createTeam(ownerAId, teamAName, "First test clan");
    console.log(`✅ Team A created: ${teamA.name} (ID: ${teamA._id})`);

    // 2. Invite member to Team A
    console.log("[2] Inviting member to Team A...");
    const invite = await teamService.inviteUser(teamA._id.toString(), ownerAId, memberAId);
    console.log(`✅ Invitation created for user ${memberAId}`);

    // 3. Accept invitation
    console.log("[3] Accepting invitation...");
    await teamService.acceptInvitation(memberAId, invite._id.toString());
    const updatedTeamA = await teamService.getTeamById(teamA._id.toString());
    console.log(`✅ Member count: ${updatedTeamA.memberCount}`);

    // 4. Create Team B
    console.log("[4] Creating Team B...");
    const teamBName = `SelfTest Team B ${Date.now()}`;
    const teamB = await teamService.createTeam(ownerBId, teamBName, "Second test clan");
    console.log(`✅ Team B created: ${teamB.name} (ID: ${teamB._id})`);

    // 5. Challenge Team B from Team A
    console.log("[5] Issuing Team Battle Challenge...");
    const battle = await teamBattleService.challengeTeam(
      ownerAId,
      teamA._id.toString(),
      teamB._id.toString(),
      1800
    );
    console.log(`✅ Battle challenge created (ID: ${battle._id}) with state: ${battle.state}`);

    // 6. Accept Battle
    console.log("[6] Accepting Team Battle Challenge...");
    const acceptedBattle = await teamBattleService.acceptBattle(
      ownerBId,
      battle._id.toString()
    );
    console.log(`✅ Battle accepted, new state: ${acceptedBattle.state}`);

    // 7. Select Roster Participants
    console.log("[7] Setting participant roster...");
    await teamBattleService.selectParticipants(
      ownerAId,
      battle._id.toString(),
      teamA._id.toString(),
      [ownerAId, memberAId]
    );
    console.log(`✅ Team A roster set`);

    // 8. Start Battle
    console.log("[8] Starting Team Battle...");
    const liveBattle = await teamBattleService.startBattle(ownerAId, battle._id.toString());
    console.log(`✅ Battle live at ${liveBattle.startedAt}, state: ${liveBattle.state}`);

    // 9. Record Submission Verdict
    console.log("[9] Recording submission verdicts...");
    await teamBattleService.recordSubmissionVerdict(battle._id.toString(), {
      userId: ownerAId,
      problemId: new Types.ObjectId().toString(),
      submissionId: new Types.ObjectId().toString(),
      status: "ACCEPTED",
      points: 200,
    });
    console.log(`✅ Submission verdict recorded`);

    // 10. Finish Battle & Elo Update
    console.log("[10] Finishing Battle & Settling Rating...");
    const finishedBattle = await teamBattleService.finishBattle(battle._id.toString());
    console.log(`✅ Battle completed! Final scores: Team A ${finishedBattle.teamAScore} vs Team B ${finishedBattle.teamBScore}`);
    console.log(`✅ Rating changes: Team A ${finishedBattle.teamARatingChange}, Team B ${finishedBattle.teamBRatingChange}`);

    // 11. Fetch Leaderboard
    console.log("[11] Fetching Team Leaderboard...");
    const lb = await teamBattleService.getTeamLeaderboard(1, 10);
    console.log(`✅ Leaderboard fetched (${lb.items.length} teams listed)`);

    // Cleanup test records
    await Team.deleteMany({ _id: { $in: [teamA._id, teamB._id] } });
    await TeamMember.deleteMany({ teamId: { $in: [teamA._id, teamB._id] } });
    await TeamInvitation.deleteMany({ teamId: { $in: [teamA._id, teamB._id] } });
    await TeamBattle.deleteMany({ _id: battle._id });

    console.log("\n==========================================");
    console.log("🎉 TEAM BATTLE V1 SELF-TEST PASSED SUCCESSFULLY!");
    console.log("==========================================\n");
  } catch (err) {
    console.error("❌ Self-test failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

runSelfTest();
