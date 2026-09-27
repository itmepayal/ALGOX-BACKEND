import { battleService } from "../src/services/battle.service";
import { matchmakingService } from "../src/services/matchmaking.service";
import { eloService, calculateElo } from "../src/services/elo.service";
import { Battle } from "../src/models/battle.model";
import { BattleParticipant } from "../src/models/battleParticipant.model";
import { BattleProblem } from "../src/models/battleProblem.model";
import { BattleSubmission } from "../src/models/battleSubmission.model";
import { RatingHistory } from "../src/models/ratingHistory.model";
import { UserSnapshot } from "../src/models/user.model";
import { Problem } from "../src/models/problem.model";
import mongoose, { Types } from "mongoose";

const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/leetcode_dev";

async function runTests() {
  console.log("==================================================");
  console.log("🧪 Running 1v1 Battle System Self-Test Suite");
  console.log("==================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`  ✓ ${message}`);
      passed++;
    } else {
      console.error(`  ✗ ${message}`);
      failed++;
    }
  }

  try {
    await mongoose.connect(MONGO_URL);
    console.log("[+] Connected to MongoDB for self-test");

    // Seed test users if not present
    const user1Id = new Types.ObjectId();
    const user2Id = new Types.ObjectId();
    const user3Id = new Types.ObjectId();

    await UserSnapshot.create([
      {
        _id: user1Id,
        name: "Alice Developer",
        email: "alice@test.com",
        role: "user",
        status: "active",
      },
      {
        _id: user2Id,
        name: "Bob Coder",
        email: "bob@test.com",
        role: "user",
        status: "active",
      },
      {
        _id: user3Id,
        name: "Charlie Hacker",
        email: "charlie@test.com",
        role: "user",
        status: "active",
      },
    ]);

    // Seed test problems if not present
    const prob1 = await Problem.create({
      title: "Battle Two Sum Test",
      slug: `battle-two-sum-${Date.now()}`,
      description: "Find two numbers",
      difficulty: "easy",
      status: "published",
      category: "Array",
      tags: ["array"],
      codeStubs: [
        { language: "javascript", startSnippet: "function twoSum() {}", userTemplate: "function twoSum() {}" },
      ],
      testcases: [{ input: "[2,7,11,15]", output: "[0,1]", isHidden: false }],
    });

    const prob2 = await Problem.create({
      title: "Battle Reverse Linked List Test",
      slug: `battle-reverse-list-${Date.now()}`,
      description: "Reverse a linked list",
      difficulty: "medium",
      status: "published",
      category: "LinkedList",
      tags: ["linked-list"],
      codeStubs: [
        { language: "javascript", startSnippet: "function reverseList() {}", userTemplate: "function reverseList() {}" },
      ],
      testcases: [{ input: "[1,2,3,4,5]", output: "[5,4,3,2,1]", isHidden: false }],
    });

    // 1. Student Search
    console.log("\n--- Test 1: Student Search ---");
    const searchResults = await battleService.searchStudents("Bob", user1Id.toString());
    assert(searchResults.length >= 1, "Should find registered student 'Bob'");
    assert(
      searchResults.every((u) => u.id !== user1Id.toString()),
      "Should exclude searching user from results"
    );

    // 2. Challenge Creation
    console.log("\n--- Test 2: Challenge Creation ---");
    const creator = { id: user1Id.toString(), name: "Alice Developer", email: "alice@test.com" };
    const battle = await battleService.createChallenge(creator, {
      opponentId: user2Id.toString(),
      difficulty: "easy",
      problemCount: 2,
      durationSeconds: 600,
    });

    assert(battle.status === "PENDING", "Created battle should be PENDING");
    assert(battle.creatorId.toString() === user1Id.toString(), "Creator ID should match Alice");
    assert(battle.opponentId.toString() === user2Id.toString(), "Opponent ID should match Bob");

    // 3. Duplicate Challenge Prevention
    console.log("\n--- Test 3: Duplicate Challenge Prevention ---");
    try {
      await battleService.createChallenge(creator, {
        opponentId: user2Id.toString(),
      });
      assert(false, "Should reject duplicate challenge");
    } catch (err: any) {
      assert(err.statusCode === 409, "Duplicate challenge should throw 409 ConflictError");
    }

    // 4. Non-Opponent Accept Rejection
    console.log("\n--- Test 4: Authorization Gates ---");
    try {
      await battleService.acceptChallenge(battle._id.toString(), user3Id.toString());
      assert(false, "Non-opponent should not be able to accept battle");
    } catch (err: any) {
      assert(err.statusCode === 403, "Non-opponent accept should return 403 Forbidden");
    }

    // 5. Opponent Accepts Challenge
    console.log("\n--- Test 5: Accept Challenge & Lobby Join ---");
    const acceptedBattle = await battleService.acceptChallenge(
      battle._id.toString(),
      user2Id.toString()
    );
    assert(acceptedBattle.status === "WAITING", "Accepted battle should transition to WAITING");

    await battleService.joinLobby(
      battle._id.toString(),
      user1Id.toString()
    );
    const lobbyDataBob = await battleService.joinLobby(
      battle._id.toString(),
      user2Id.toString()
    );

    assert(lobbyDataBob.participants.length === 2, "Lobby should have 2 participants");
    assert(
      lobbyDataBob.participants.every((p: any) => p.connectionStatus === "CONNECTED"),
      "Both participants should be CONNECTED after both join lobby"
    );

    // 6. Ready State & Server-Authoritative Battle Start
    console.log("\n--- Test 6: Ready State & Battle Start ---");
    await battleService.setReady(battle._id.toString(), user1Id.toString(), true);
    const startedData = await battleService.setReady(
      battle._id.toString(),
      user2Id.toString(),
      true
    );

    assert(startedData.battle.status === "ACTIVE", "Battle should be ACTIVE after both ready");
    assert(Boolean(startedData.battle.startedAt), "Battle startedAt should be set");
    assert(Boolean(startedData.battle.endsAt), "Battle endsAt should be set");
    assert(startedData.problems.length >= 1, "Problems should be selected server-side");

    // 7. Non-Participant Problem Access Rejection
    console.log("\n--- Test 7: Non-Participant Problem Access Rejection ---");
    try {
      await battleService.getBattleProblems(battle._id.toString(), user3Id.toString());
      assert(false, "Non-participant should not be able to fetch battle problems");
    } catch (err: any) {
      assert(err.statusCode === 403, "Fetching problems as non-participant should throw 403");
    }

    // 8. Fetch Battle Problems (Participant)
    console.log("\n--- Test 8: Fetch Battle Problems ---");
    const problems = await battleService.getBattleProblems(
      battle._id.toString(),
      user1Id.toString()
    );
    assert(problems.length >= 1, "Participant can fetch battle problems");
    assert(
      problems.every((p) => p.testcases.every((tc: any) => !tc.isHidden)),
      "Returned testcases must NEVER contain hidden test cases"
    );

    // 9. Submission Verdict & Server-Side Scoring
    console.log("\n--- Test 9: Submission Verdict & Scoring ---");
    const targetProblem = problems[0];

    // Alice solves first
    await battleService.recordSubmissionVerdict(battle._id.toString(), {
      userId: user1Id.toString(),
      problemId: targetProblem.problemId,
      submissionId: new Types.ObjectId().toString(),
      status: "ACCEPTED",
    });

    const resultAfterAlice = await battleService.getBattleResult(
      battle._id.toString(),
      user1Id.toString()
    );

    const alicePart = resultAfterAlice.participants.find(
      (p: any) => p.userId.toString() === user1Id.toString()
    );

    // Base points for easy (100) + first-accepted bonus (+20) = 120 (or 200/300 + 20)
    assert(alicePart?.solvedCount === 1, "Alice solved count should be 1");
    assert((alicePart?.score ?? 0) > 0, `Alice score should be > 0 (got ${alicePart?.score})`);

    // Duplicate submission by Alice should award 0 points
    const aliceScoreBefore = alicePart?.score ?? 0;
    await battleService.recordSubmissionVerdict(battle._id.toString(), {
      userId: user1Id.toString(),
      problemId: targetProblem.problemId,
      submissionId: new Types.ObjectId().toString(),
      status: "ACCEPTED",
    });

    const resultAfterAliceDup = await battleService.getBattleResult(
      battle._id.toString(),
      user1Id.toString()
    );
    const alicePartDup = resultAfterAliceDup.participants.find(
      (p: any) => p.userId.toString() === user1Id.toString()
    );

    assert(
      alicePartDup?.score === aliceScoreBefore,
      "Duplicate accepted submission must award 0 additional points"
    );

    // Bob solves second (gets base points only, no first-accepted bonus)
    await battleService.recordSubmissionVerdict(battle._id.toString(), {
      userId: user2Id.toString(),
      problemId: targetProblem.problemId,
      submissionId: new Types.ObjectId().toString(),
      status: "ACCEPTED",
    });

    const resultAfterBob = await battleService.getBattleResult(
      battle._id.toString(),
      user2Id.toString()
    );
    const bobPart = resultAfterBob.participants.find(
      (p: any) => p.userId.toString() === user2Id.toString()
    );

    assert(bobPart?.solvedCount === 1, "Bob solved count should be 1");
    assert(
      (alicePart?.score ?? 0) > (bobPart?.score ?? 0),
      "First solver (Alice) should have higher score due to first-accepted bonus"
    );

    // 10. Forfeit Battle
    console.log("\n--- Test 10: Forfeit Battle ---");
    const forfeited = await battleService.forfeitBattle(
      battle._id.toString(),
      user2Id.toString()
    );

    assert(forfeited.status === "FORFEITED", "Battle status should be FORFEITED");
    assert(
      forfeited.winnerId!.toString() === user1Id.toString(),
      "Opponent (Alice) should win on Bob forfeit"
    );

    // 11. My Battles Retrieval & Pagination
    console.log("\n--- Test 11: Get My Battles & Pagination ---");
    const myBattles = await battleService.getMyBattles(user1Id.toString(), { page: 1, limit: 10 });
    assert(myBattles.history.length >= 1, "Alice should have 1 historical battle");
    assert(myBattles.pagination.page === 1, "Pagination page should be 1");
    assert(myBattles.pagination.limit === 10, "Pagination limit should be 10");
    assert(myBattles.pagination.total >= 1, "Pagination total should be >= 1");
    assert(typeof myBattles.pagination.totalPages === "number", "totalPages should be defined");

    // Test limit max cap (50)
    const myBattlesCap = await battleService.getMyBattles(user1Id.toString(), { limit: 100 });
    assert(myBattlesCap.pagination.limit === 50, "Limit should be capped at max 50");

    // 12. History Status Filtering
    console.log("\n--- Test 12: History Status Filtering ---");
    const completedHistory = await battleService.getMyBattles(user1Id.toString(), { filter: "completed" });
    assert(completedHistory.history.every((b) => ["FINISHED", "RESULT_PUBLISHED", "FORFEITED"].includes(b.status)), "Completed filter should only return finished/forfeited battles");

    const cancelledHistory = await battleService.getMyBattles(user1Id.toString(), { filter: "cancelled" });
    assert(cancelledHistory.history.every((b) => ["DECLINED", "CANCELLED", "FORFEITED"].includes(b.status)), "Cancelled filter should only return cancelled/declined/forfeited battles");

    // 13. Battle Statistics Calculation
    console.log("\n--- Test 13: Battle Statistics Calculation ---");
    const aliceStats = await battleService.getBattleStats(user1Id.toString());
    assert(aliceStats.totalBattles >= 1, "Alice should have >= 1 total completed battle");
    assert(aliceStats.wins >= 1, "Alice should have >= 1 win");
    assert(aliceStats.winRate > 0, `Win rate should be > 0 (got ${aliceStats.winRate}%)`);
    assert(aliceStats.bestStreak >= 1, `Best streak should be >= 1 (got ${aliceStats.bestStreak})`);
    assert(aliceStats.currentStreak >= 1, `Current streak should be >= 1 (got ${aliceStats.currentStreak})`);
    assert(aliceStats.averageDurationSeconds >= 0, "Average duration seconds should be >= 0");

    const bobStats = await battleService.getBattleStats(user2Id.toString());
    assert(bobStats.losses >= 1, "Bob should have >= 1 loss after forfeit");
    assert(bobStats.currentStreak === 0, "Bob current streak should be 0 after loss");

    // 14. Zero-Battle User Statistics
    console.log("\n--- Test 14: Zero-Battle User Statistics ---");
    const charlieStats = await battleService.getBattleStats(user3Id.toString());
    assert(charlieStats.totalBattles === 0, "Zero-battle user totalBattles should be 0");
    assert(charlieStats.wins === 0, "Zero-battle user wins should be 0");
    assert(charlieStats.losses === 0, "Zero-battle user losses should be 0");
    assert(charlieStats.draws === 0, "Zero-battle user draws should be 0");
    assert(charlieStats.winRate === 0, "Zero-battle user winRate should be 0");
    assert(charlieStats.bestStreak === 0, "Zero-battle user bestStreak should be 0");
    assert(charlieStats.currentStreak === 0, "Zero-battle user currentStreak should be 0");
    assert(charlieStats.averageDurationSeconds === 0, "Zero-battle user avg duration should be 0");

    // 15. Matchmaking Join & Duplicate Prevention
    console.log("\n--- Test 15: Matchmaking Join & Duplicate Prevention ---");
    const user1Obj = { id: user1Id.toString(), name: "Alice Developer", email: "alice@test.com" };
    const user2Obj = { id: user2Id.toString(), name: "Bob Coder", email: "bob@test.com" };

    const joinRes1 = await matchmakingService.joinQueue(user1Obj, {
      difficulty: "easy",
      topic: "array",
      battleMode: "unranked",
    });
    assert(joinRes1.status === "SEARCHING", "Join queue should return SEARCHING status");
    assert(joinRes1.queueEntry?.difficulty === "easy", "Queue request difficulty should match");

    const joinResDup = await matchmakingService.joinQueue(user1Obj, {
      difficulty: "easy",
      topic: "array",
      battleMode: "unranked",
    });
    assert(joinResDup.status === "SEARCHING", "Duplicate join should safely return SEARCHING without error");

    const user1Status = await matchmakingService.getStatus(user1Id.toString());
    assert(user1Status.status === "SEARCHING", "Status check should confirm SEARCHING");

    // 16. Matchmaking Cancellation
    console.log("\n--- Test 16: Matchmaking Cancellation ---");
    const cancelRes = await matchmakingService.cancelQueue(user1Id.toString());
    assert(cancelRes.success === true, "Cancelling queue should return success");

    const user1StatusAfterCancel = await matchmakingService.getStatus(user1Id.toString());
    assert(user1StatusAfterCancel.status === "IDLE", "Status check after cancel should return IDLE");

    // 17. Atomic 2-Player Matchmaking & Battle Creation
    console.log("\n--- Test 17: Atomic 2-Player Matchmaking ---");
    const playerAJoin = await matchmakingService.joinQueue(user1Obj, {
      difficulty: "easy",
      topic: "Any",
      battleMode: "unranked",
    });
    assert(playerAJoin.status === "SEARCHING", "Player A should be SEARCHING");

    const playerBJoin = await matchmakingService.joinQueue(user2Obj, {
      difficulty: "easy",
      topic: "Any",
      battleMode: "unranked",
    });

    assert(playerBJoin.status === "MATCHED", "Player B join should trigger atomic match with Player A");
    assert(typeof playerBJoin.battleId === "string", "Matched response should contain battleId");

    // Verify created battle in DB
    const matchBattle = await Battle.findById(playerBJoin.battleId);
    assert(matchBattle !== null, "Matched battle must exist in database");

    const matchParticipants = await BattleParticipant.find({ battleId: playerBJoin.battleId });
    assert(matchParticipants.length === 2, "Matched battle must have 2 participants");
    // 18. Elo Standard Formula & Rounding
    console.log("\n--- Test 18: Elo Standard Formula & Rounding ---");
    const eloEqualWin = calculateElo(1000, 1000, 1);
    assert(eloEqualWin.playerA.ratingChange === 16, "Equal 1000 ratings win should increase by +16");
    assert(eloEqualWin.playerB.ratingChange === -16, "Equal 1000 ratings loss should decrease by -16");

    const eloEqualDraw = calculateElo(1000, 1000, 0.5);
    assert(eloEqualDraw.playerA.ratingChange === 0, "Equal ratings draw should result in 0 change");
    assert(eloEqualDraw.playerB.ratingChange === 0, "Equal ratings draw should result in 0 change");

    const eloUnderdogWin = calculateElo(1000, 1400, 1);
    assert(eloUnderdogWin.playerA.ratingChange > 16, "Underdog win should yield larger rating gain (+29)");
    assert(eloUnderdogWin.playerB.ratingChange < -16, "Favorite loss should yield larger rating drop (-29)");

    // 19. Ranked Battle Settlement & Idempotency
    console.log("\n--- Test 19: Ranked Battle Settlement & Idempotency ---");
    const rankedBattle = await Battle.create({
      creatorId: user1Id,
      creatorName: "Alice Developer",
      creatorEmail: "alice@test.com",
      opponentId: user2Id,
      opponentName: "Bob Coder",
      opponentEmail: "bob@test.com",
      status: "FINISHED",
      difficulty: "medium",
      battleMode: "ranked",
      winnerId: user1Id, // Alice won!
      problemCount: 3,
      durationSeconds: 1800,
    });

    const settlement1 = await eloService.settleBattleElo(rankedBattle._id.toString());
    assert(settlement1 !== null, "Ranked battle settlement should return result");
    assert(settlement1?.alreadySettled === false, "First settlement should process rating update");
    assert((settlement1?.elo?.playerA?.ratingChange ?? 0) > 0, "Winner (Alice) rating should increase");
    assert((settlement1?.elo?.playerB?.ratingChange ?? 0) < 0, "Loser (Bob) rating should decrease");

    // Repeat Settlement (Idempotency Check)
    const settlementDup = await eloService.settleBattleElo(rankedBattle._id.toString());
    assert(settlementDup?.alreadySettled === true, "Repeated settlement MUST be marked alreadySettled");

    // 20. Unranked & Cancelled Battle Exclusion
    console.log("\n--- Test 20: Unranked & Cancelled Battle Exclusion ---");
    const unrankedBattle = await Battle.create({
      creatorId: user1Id,
      creatorName: "Alice Developer",
      creatorEmail: "alice@test.com",
      opponentId: user2Id,
      opponentName: "Bob Coder",
      opponentEmail: "bob@test.com",
      status: "FINISHED",
      difficulty: "medium",
      battleMode: "unranked",
      winnerId: user1Id,
      problemCount: 3,
      durationSeconds: 1800,
    });

    const unrankedRes = await eloService.settleBattleElo(unrankedBattle._id.toString());
    assert(unrankedRes === null, "Unranked battle MUST NOT settle Elo ratings");

    // 21. Rating Statistics & Paginated Rating History
    console.log("\n--- Test 21: Rating Statistics & Rating History Retrieval ---");
    const ratingStats = await eloService.getRatingStats(user1Id.toString());
    assert(ratingStats.currentRating > 1000, "Alice current rating should be > 1000 after win");
    assert(ratingStats.peakRating >= ratingStats.currentRating, "Peak rating should be >= current rating");
    assert(ratingStats.wins >= 1, "Alice ranked wins should be >= 1");

    const historyRes = await eloService.getRatingHistory(user1Id.toString(), { page: 1, limit: 10 });
    assert(historyRes.history.length >= 1, "Alice should have >= 1 rating history record");
    assert(historyRes.history[0].result === "WIN", "History entry result should match WIN");
    assert(historyRes.pagination.total >= 1, "Rating history pagination total should be >= 1");

    // 22. Battle Leaderboard V1 & Deterministic User Ranking
    console.log("\n--- Test 22: Battle Leaderboard V1 & Deterministic User Ranking ---");
    const lbRes = await eloService.getLeaderboard({ page: 1, limit: 10 });
    assert(lbRes.items.length >= 2, "Leaderboard should return at least 2 active users");
    assert(lbRes.items[0].rating >= lbRes.items[1].rating, "Leaderboard must be ordered rating DESC");
    assert(lbRes.items[0].user.id === user1Id.toString(), "Winner (Alice) should rank #1 on Leaderboard");
    assert(lbRes.items[0].rank === 1, "Rank #1 item must have rank === 1");
    assert(lbRes.items[0].wins >= 1, "Rank #1 item should aggregate wins >= 1");
    assert(lbRes.items[0].winRate > 0, "Rank #1 item should calculate winRate > 0");

    const aliceRank = await eloService.getUserRank(user1Id.toString());
    const bobRank = await eloService.getUserRank(user2Id.toString());
    assert(aliceRank === 1, "Alice user rank should be 1");
    assert(bobRank === 3, "Bob user rank should be 3 (below default 1000 rating users)");

    // Cleanup test data
    if (matchBattle) {
      await Battle.deleteMany({ _id: matchBattle._id });
      await BattleParticipant.deleteMany({ battleId: matchBattle._id });
      await BattleProblem.deleteMany({ battleId: matchBattle._id });
    }
    await Battle.deleteMany({ _id: { $in: [battle._id, rankedBattle._id, unrankedBattle._id] } });
    await BattleParticipant.deleteMany({ battleId: { $in: [battle._id, rankedBattle._id, unrankedBattle._id] } });
    await BattleProblem.deleteMany({ battleId: { $in: [battle._id, rankedBattle._id, unrankedBattle._id] } });
    await BattleSubmission.deleteMany({ battleId: { $in: [battle._id, rankedBattle._id, unrankedBattle._id] } });
    await RatingHistory.deleteMany({ userId: { $in: [user1Id, user2Id, user3Id] } });
    await UserSnapshot.deleteMany({ _id: { $in: [user1Id, user2Id, user3Id] } });
    await Problem.deleteMany({ _id: { $in: [prob1._id, prob2._id] } });

    console.log("\n==================================================");
    console.log(`✅ Self-test completed! Passed: ${passed}, Failed: ${failed}`);
    console.log("==================================================\n");
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("Self-test error:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runTests();
