import { Types } from "mongoose";
import { eloService } from "./elo.service";
import { tournamentService } from "./tournament.service";
import type { IBattle, BattleDifficulty } from "../models/battle.model";
import { Battle } from "../models/battle.model";
import { BattleProblem } from "../models/battleProblem.model";
import { BattleParticipant } from "../models/battleParticipant.model";
import { BattleSubmission } from "../models/battleSubmission.model";
import { UserSnapshot } from "../models/user.model";
import type { IProblem } from "../models/problem.model";
import { Problem } from "../models/problem.model";
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "../utils/errors/app.error";
import { emitRealtimeEvent } from "../utils/helpers/realtimeEmit";
import logger from "../config/logger.config";
import { recordProgressionEvent } from "../utils/helpers/progressionFanout";

export interface CreateBattleDto {
  opponentId: string;
  difficulty?: BattleDifficulty;
  problemCount?: number;
  durationSeconds?: number;
  battleMode?: "ranked" | "unranked";
}

export class BattleService {
  /**
   * Search registered students to challenge.
   */
  async searchStudents(query: string, currentUserId: string) {
    if (!query || query.trim().length < 2) return [];

    const searchRegex = new RegExp(query.trim(), "i");
    const users = await UserSnapshot.find({
      _id: { $ne: new Types.ObjectId(currentUserId) },
      status: "active",
      deletedAt: null,
      $or: [{ name: searchRegex }, { email: searchRegex }],
    })
      .select("_id name email avatar role")
      .limit(10)
      .lean();

    return users.map((u: any) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      avatar: u.avatar || "",
      role: u.role,
    }));
  }

  /**
   * Create a 1v1 challenge.
   */
  async createChallenge(
    creator: { id: string; name: string; email: string },
    dto: CreateBattleDto
  ): Promise<IBattle> {
    if (!dto.opponentId || !Types.ObjectId.isValid(dto.opponentId)) {
      throw new BadRequestError("Invalid opponent ID");
    }

    if (dto.opponentId === creator.id) {
      throw new BadRequestError("You cannot challenge yourself");
    }

    const opponent = await UserSnapshot.findById(dto.opponentId).lean();
    if (!opponent || (opponent as any).deletedAt) {
      throw new NotFoundError("Opponent not found or inactive");
    }

    // Check for existing pending or active battle between these participants
    const existingActive = await Battle.findOne({
      $or: [
        {
          creatorId: new Types.ObjectId(creator.id),
          opponentId: new Types.ObjectId(dto.opponentId),
        },
        {
          creatorId: new Types.ObjectId(dto.opponentId),
          opponentId: new Types.ObjectId(creator.id),
        },
      ],
      status: { $in: ["PENDING", "ACCEPTED", "WAITING", "READY", "ACTIVE"] },
    });

    if (existingActive) {
      throw new ConflictError(
        "A pending or active battle challenge already exists with this student."
      );
    }

    const difficulty: BattleDifficulty = [
      "easy",
      "medium",
      "hard",
      "mixed",
    ].includes(dto.difficulty as string)
      ? dto.difficulty!
      : "medium";

    const problemCount = Math.max(1, Math.min(5, dto.problemCount || 3));
    const durationSeconds = Math.max(300, Math.min(7200, dto.durationSeconds || 1800));

    const battle = await Battle.create({
      creatorId: new Types.ObjectId(creator.id),
      creatorName: creator.name,
      creatorEmail: creator.email,
      opponentId: new Types.ObjectId(dto.opponentId),
      opponentName: (opponent as any).name,
      opponentEmail: (opponent as any).email,
      status: "PENDING",
      difficulty,
      problemCount,
      durationSeconds,
    });

    // Create participant records
    await BattleParticipant.create([
      {
        battleId: battle._id,
        userId: new Types.ObjectId(creator.id),
        connectionStatus: "CONNECTED",
        joinedAt: new Date(),
      },
      {
        battleId: battle._id,
        userId: new Types.ObjectId(dto.opponentId),
        connectionStatus: "DISCONNECTED",
      },
    ]);

    logger.info("BATTLE CHALLENGE CREATED", {
      battleId: battle._id.toString(),
      creatorId: creator.id,
      opponentId: dto.opponentId,
    });

    // Realtime notification to opponent
    emitRealtimeEvent({
      event: "battle:invite",
      userId: dto.opponentId,
      room: `user:${dto.opponentId}`,
      payload: {
        battleId: battle._id.toString(),
        creator: {
          id: creator.id,
          name: creator.name,
          email: creator.email,
        },
        difficulty,
        problemCount,
        durationSeconds,
        createdAt: battle.createdAt,
      },
    });

    // Also trigger in-app notification event
    emitRealtimeEvent({
      event: "notification.created",
      userId: dto.opponentId,
      room: `user:${dto.opponentId}`,
      payload: {
        title: "⚔️ 1v1 Battle Challenge Received",
        message: `${creator.name} challenged you to a 1v1 DSA Battle (${problemCount} problems, ${Math.round(
          durationSeconds / 60
        )} mins)!`,
        type: "BATTLE_INVITE",
        link: `/battles?battleId=${battle._id.toString()}`,
      },
    });

    return battle;
  }

  /**
   * Accept a challenge.
   */
  async acceptChallenge(battleId: string, userId: string): Promise<IBattle> {
    const battle = await this.getBattleById(battleId);

    if (battle.opponentId.toString() !== userId) {
      throw new ForbiddenError("Only the challenged student can accept this battle.");
    }

    if (battle.status !== "PENDING") {
      throw new ConflictError("Battle is no longer pending or available.");
    }

    battle.status = "ACCEPTED";
    await battle.save();

    // Move to WAITING for lobby join
    battle.status = "WAITING";
    await battle.save();

    logger.info("BATTLE ACCEPTED", { battleId, userId });

    emitRealtimeEvent({
      event: "battle:accepted",
      room: `battle:${battleId}`,
      userId: battle.creatorId.toString(),
      payload: {
        battleId,
        acceptedBy: userId,
      },
    });

    emitRealtimeEvent({
      event: "battle:accepted",
      room: `user:${battle.creatorId.toString()}`,
      payload: {
        battleId,
        acceptedBy: userId,
      },
    });

    return battle;
  }

  /**
   * Decline a challenge.
   */
  async declineChallenge(battleId: string, userId: string): Promise<IBattle> {
    const battle = await this.getBattleById(battleId);

    if (battle.opponentId.toString() !== userId) {
      throw new ForbiddenError("Only the challenged student can decline this battle.");
    }

    if (battle.status !== "PENDING") {
      throw new ConflictError("Battle is no longer pending.");
    }

    battle.status = "DECLINED";
    battle.finishedAt = new Date();
    await battle.save();

    logger.info("BATTLE DECLINED", { battleId, userId });

    emitRealtimeEvent({
      event: "battle:declined",
      room: `user:${battle.creatorId.toString()}`,
      payload: {
        battleId,
        declinedBy: userId,
      },
    });

    return battle;
  }

  /**
   * Cancel a pending challenge.
   */
  async cancelChallenge(battleId: string, userId: string): Promise<IBattle> {
    const battle = await this.getBattleById(battleId);

    if (battle.creatorId.toString() !== userId) {
      throw new ForbiddenError("Only the challenge creator can cancel it.");
    }

    if (battle.status !== "PENDING") {
      throw new ConflictError("Only pending battles can be cancelled.");
    }

    battle.status = "CANCELLED";
    battle.finishedAt = new Date();
    await battle.save();

    logger.info("BATTLE CANCELLED", { battleId, userId });

    emitRealtimeEvent({
      event: "battle:declined",
      room: `user:${battle.opponentId.toString()}`,
      payload: {
        battleId,
        cancelledBy: userId,
      },
    });

    return battle;
  }

  /**
   * Join battle lobby / room.
   */
  async joinLobby(battleId: string, userId: string) {
    const battle = await this.getBattleById(battleId);

    this.assertParticipant(battle, userId);
    await this.autoFinalizeIfExpired(battle);

    let participant = await BattleParticipant.findOne({
      battleId: battle._id,
      userId: new Types.ObjectId(userId),
    });

    if (!participant) {
      participant = await BattleParticipant.create({
        battleId: battle._id,
        userId: new Types.ObjectId(userId),
        connectionStatus: "CONNECTED",
        joinedAt: new Date(),
      });
    } else {
      participant.connectionStatus = "CONNECTED";
      participant.lastSeenAt = new Date();
      if (!participant.joinedAt) participant.joinedAt = new Date();
      await participant.save();
    }

    const participants = await BattleParticipant.find({ battleId: battle._id }).lean();
    const problems = await BattleProblem.find({ battleId: battle._id })
      .sort({ order: 1 })
      .lean();

    emitRealtimeEvent({
      event: "battle:opponent_status",
      room: `battle:${battleId}`,
      payload: {
        battleId,
        userId,
        connectionStatus: "CONNECTED",
      },
    });

    return {
      battle,
      participants,
      problems,
    };
  }

  /**
   * Toggle/set participant ready state.
   * When BOTH participants are ready, server starts battle!
   */
  async setReady(battleId: string, userId: string, isReady: boolean) {
    const battle = await this.getBattleById(battleId);
    this.assertParticipant(battle, userId);

    if (!["ACCEPTED", "WAITING", "READY"].includes(battle.status)) {
      throw new BadRequestError(
        `Cannot change ready state when battle is in status ${battle.status}`
      );
    }

    let participant = await BattleParticipant.findOne({
      battleId: battle._id,
      userId: new Types.ObjectId(userId),
    });

    if (!participant) {
      participant = await BattleParticipant.create({
        battleId: battle._id,
        userId: new Types.ObjectId(userId),
        isReady,
      });
    } else {
      participant.isReady = isReady;
      participant.connectionStatus = "CONNECTED";
      participant.lastSeenAt = new Date();
      await participant.save();
    }

    const allParticipants = await BattleParticipant.find({
      battleId: battle._id,
    });

    const bothReady =
      allParticipants.length === 2 &&
      allParticipants.every((p) => p.isReady === true);

    if (bothReady) {
      // Server-authoritative problem selection & battle start
      await this.startBattle(battle);
    } else {
      battle.status = allParticipants.some((p) => p.isReady) ? "READY" : "WAITING";
      await battle.save();

      emitRealtimeEvent({
        event: "battle:ready",
        room: `battle:${battleId}`,
        payload: {
          battleId,
          userId,
          isReady,
          participants: allParticipants,
        },
      });
    }

    const updatedParticipants = await BattleParticipant.find({
      battleId: battle._id,
    }).lean();
    const problems = await BattleProblem.find({ battleId: battle._id })
      .sort({ order: 1 })
      .lean();

    return {
      battle,
      participants: updatedParticipants,
      problems,
    };
  }

  /**
   * Server-authoritative problem selection & battle start.
   */
  private async startBattle(battle: IBattle) {
    // Select problems server-side
    let problems: IProblem[] = [];

    const statusFilter = { status: "published" };
    if (battle.difficulty === "mixed") {
      problems = await Problem.aggregate([
        { $match: statusFilter },
        { $sample: { size: battle.problemCount } },
      ]);
    } else {
      problems = await Problem.aggregate([
        {
          $match: {
            ...statusFilter,
            difficulty: battle.difficulty,
          },
        },
        { $sample: { size: battle.problemCount } },
      ]);

      // Fallback if not enough matching difficulty
      if (problems.length < battle.problemCount) {
        const extraNeeded = battle.problemCount - problems.length;
        const existingIds = problems.map((p) => p._id);
        const extra = await Problem.aggregate([
          { $match: { ...statusFilter, _id: { $nin: existingIds } } },
          { $sample: { size: extraNeeded } },
        ]);
        problems = [...problems, ...extra];
      }
    }

    if (problems.length === 0) {
      throw new BadRequestError("No active published problems available for battle selection");
    }

    // Save BattleProblem snapshot
    await BattleProblem.deleteMany({ battleId: battle._id });

    const battleProblemsData = problems.map((p, idx) => {
      const difficulty = (p.difficulty || "medium").toLowerCase();
      const points = difficulty === "easy" ? 100 : difficulty === "hard" ? 300 : 200;
      return {
        battleId: battle._id,
        problemId: p._id,
        order: idx + 1,
        points,
        title: p.title,
        slug: p.slug,
        difficulty: p.difficulty,
      };
    });

    const battleProblems = await BattleProblem.create(battleProblemsData);

    const now = new Date();
    const endsAt = new Date(now.getTime() + battle.durationSeconds * 1000);

    battle.status = "ACTIVE";
    battle.startedAt = now;
    battle.endsAt = endsAt;
    await battle.save();

    logger.info("BATTLE STARTED", {
      battleId: battle._id.toString(),
      problemCount: battleProblems.length,
      startedAt: now,
      endsAt,
    });

    emitRealtimeEvent({
      event: "battle:started",
      room: `battle:${battle._id.toString()}`,
      payload: {
        battleId: battle._id.toString(),
        status: "ACTIVE",
        startedAt: now,
        endsAt,
        durationSeconds: battle.durationSeconds,
        problems: battleProblems.map((bp) => ({
          id: bp._id.toString(),
          problemId: bp.problemId.toString(),
          order: bp.order,
          points: bp.points,
          title: bp.title,
          slug: bp.slug,
          difficulty: bp.difficulty,
        })),
      },
    });
  }

  /**
   * Get problems for active battle.
   */
  async getBattleProblems(battleId: string, userId: string) {
    const battle = await this.getBattleById(battleId);
    this.assertParticipant(battle, userId);
    await this.autoFinalizeIfExpired(battle);

    const battleProblems = await BattleProblem.find({ battleId: battle._id })
      .sort({ order: 1 })
      .lean();

    const problemIds = battleProblems.map((bp) => bp.problemId);
    const rawProblems = await Problem.find({ _id: { $in: problemIds } }).lean();

    const problemsMap = new Map(rawProblems.map((p: any) => [p._id.toString(), p]));

    return battleProblems.map((bp) => {
      const p: any = problemsMap.get(bp.problemId.toString()) || {};
      // Filter testcases to exclude hidden expected outputs
      const sanitizedTestcases = (p.testcases || [])
        .filter((tc: any) => !tc.isHidden)
        .map((tc: any) => ({
          input: tc.input,
          output: tc.output || tc.expectedOutput || "",
          explanation: tc.explanation,
        }));

      return {
        id: bp._id.toString(),
        problemId: bp.problemId.toString(),
        order: bp.order,
        points: bp.points,
        title: bp.title || p.title,
        slug: bp.slug || p.slug,
        difficulty: bp.difficulty || p.difficulty,
        description: p.description,
        constraints: p.constraints,
        examples: p.examples || [],
        codeStubs: p.codeStubs || [],
        starterCode: p.starterCode || {},
        functionName: p.functionName,
        className: p.className,
        timeLimitMs: p.timeLimitMs || 2000,
        memoryLimitMb: p.memoryLimitMb || 256,
        testcases: sanitizedTestcases,
      };
    });
  }

  /**
   * Record a submission evaluation result.
   */
  async recordSubmissionVerdict(
    battleId: string,
    payload: {
      userId: string;
      problemId: string;
      submissionId: string;
      status: string;
      executionTimeMs?: number;
      memoryMb?: number;
    }
  ) {
    const battle = await Battle.findById(battleId);
    if (!battle) return;

    if (battle.status !== "ACTIVE") return;

    // Check expiry
    if (battle.endsAt && Date.now() >= battle.endsAt.getTime()) {
      await this.finalizeBattle(battle);
      return;
    }

    const { userId, problemId, submissionId, status } = payload;

    const participant = await BattleParticipant.findOne({
      battleId: battle._id,
      userId: new Types.ObjectId(userId),
    });

    if (!participant) return;

    const battleProblem = await BattleProblem.findOne({
      battleId: battle._id,
      problemId: new Types.ObjectId(problemId),
    });

    if (!battleProblem) return;

    if (status !== "ACCEPTED") {
      participant.wrongAttempts += 1;
      await participant.save();

      emitRealtimeEvent({
        event: "battle:submission_result",
        room: `battle:${battleId}`,
        payload: {
          battleId,
          userId,
          problemId,
          status,
          solved: false,
        },
      });
      return;
    }

    // Check if user already solved this problem in this battle
    const existingSolve = await BattleSubmission.findOne({
      battleId: battle._id,
      userId: new Types.ObjectId(userId),
      problemId: new Types.ObjectId(problemId),
      status: "ACCEPTED",
    });

    if (existingSolve) {
      // Duplicate accepted submission — 0 additional points
      return;
    }

    // Check if anyone else solved this problem first in this battle
    const previousSolves = await BattleSubmission.countDocuments({
      battleId: battle._id,
      problemId: new Types.ObjectId(problemId),
      status: "ACCEPTED",
    });

    const isFirstSolve = previousSolves === 0;
    const basePoints = battleProblem.points;
    const bonusPoints = isFirstSolve ? 20 : 0;
    const pointsAwarded = basePoints + bonusPoints;

    participant.score += pointsAwarded;
    participant.solvedCount += 1;
    await participant.save();

    await BattleSubmission.create({
      battleId: battle._id,
      userId: new Types.ObjectId(userId),
      problemId: new Types.ObjectId(problemId),
      submissionId: new Types.ObjectId(submissionId),
      status: "ACCEPTED",
      pointsAwarded,
      isFirstSolve,
      submittedAt: new Date(),
    });

    logger.info("BATTLE PROBLEM SOLVED", {
      battleId,
      userId,
      problemId,
      pointsAwarded,
      totalScore: participant.score,
    });

    emitRealtimeEvent({
      event: "battle:problem_solved",
      room: `battle:${battleId}`,
      payload: {
        battleId,
        userId,
        problemId,
        status: "ACCEPTED",
        pointsAwarded,
        isFirstSolve,
        participantScore: participant.score,
        solvedCount: participant.solvedCount,
      },
    });

    // Check if battle win condition met (e.g., all problems solved by participants)
    const totalProblems = battle.problemCount;
    const allParticipants = await BattleParticipant.find({
      battleId: battle._id,
    });

    const everyoneSolvedAll = allParticipants.every(
      (p) => p.solvedCount >= totalProblems
    );

    if (everyoneSolvedAll) {
      await this.finalizeBattle(battle);
    }
  }

  /**
   * Forfeit battle.
   */
  async forfeitBattle(battleId: string, userId: string) {
    const battle = await this.getBattleById(battleId);
    this.assertParticipant(battle, userId);

    if (["FINISHED", "RESULT_PUBLISHED", "DECLINED", "CANCELLED"].includes(battle.status)) {
      throw new BadRequestError(`Battle is already ${battle.status.toLowerCase()}`);
    }

    const winnerId =
      battle.creatorId.toString() === userId ? battle.opponentId : battle.creatorId;

    battle.status = "FORFEITED";
    battle.forfeitedBy = new Types.ObjectId(userId);
    battle.winnerId = winnerId;
    battle.finishedAt = new Date();
    await battle.save();

    if (battle.battleMode === "ranked") {
      await recordProgressionEvent({
        eventKey: `battle-win:${battle._id}:${winnerId}`,
        userId: winnerId.toString(),
        eventType: "battle_won",
        sourceId: battle._id.toString(),
      });
    }

    emitRealtimeEvent({
      event: "battle:forfeit",
      room: `battle:${battleId}`,
      payload: {
        battleId,
        forfeitedBy: userId,
        winnerId: winnerId.toString(),
      },
    });

    emitRealtimeEvent({
      event: "battle:finished",
      room: `battle:${battleId}`,
      payload: {
        battleId,
        status: "FORFEITED",
        winnerId: winnerId.toString(),
      },
    });

    // Trigger Elo settlement for ranked forfeit
    await eloService.settleBattleElo(battle._id.toString());
    try {
      await tournamentService.processMatchBattleCompletion(battle._id.toString());
    } catch {
      // Ignore non-tournament battle completion errors
    }

    return battle;
  }

  /**
   * Finalize battle on expiry or completion.
   */
  async finalizeBattle(battle: IBattle) {
    if (["FINISHED", "RESULT_PUBLISHED", "FORFEITED", "DECLINED", "CANCELLED"].includes(battle.status)) {
      return battle;
    }

    const participants = await BattleParticipant.find({ battleId: battle._id });
    const p1 = participants[0];
    const p2 = participants[1];

    let winnerId: Types.ObjectId | null = null;

    if (p1 && p2) {
      if (p1.score > p2.score) {
        winnerId = p1.userId;
      } else if (p2.score > p1.score) {
        winnerId = p2.userId;
      } else {
        // Tie breaker 1: solved count
        if (p1.solvedCount > p2.solvedCount) {
          winnerId = p1.userId;
        } else if (p2.solvedCount > p1.solvedCount) {
          winnerId = p2.userId;
        } else {
          // Tie breaker 2: wrong attempts (fewer is better)
          if (p1.wrongAttempts < p2.wrongAttempts) {
            winnerId = p1.userId;
          } else if (p2.wrongAttempts < p1.wrongAttempts) {
            winnerId = p2.userId;
          } else {
            // Draw
            winnerId = null;
          }
        }
      }
    }

    battle.status = "RESULT_PUBLISHED";
    battle.winnerId = winnerId;
    battle.finishedAt = new Date();
    await battle.save();

    if (winnerId && battle.battleMode === "ranked") {
      await recordProgressionEvent({
        eventKey: `battle-win:${battle._id}:${winnerId}`,
        userId: winnerId.toString(),
        eventType: "battle_won",
        sourceId: battle._id.toString(),
      });
    }

    logger.info("BATTLE FINISHED & FINALIZED", {
      battleId: battle._id.toString(),
      winnerId: winnerId ? winnerId.toString() : "DRAW",
    });

    emitRealtimeEvent({
      event: "battle:finished",
      room: `battle:${battle._id.toString()}`,
      payload: {
        battleId: battle._id.toString(),
        status: "RESULT_PUBLISHED",
        winnerId: winnerId ? winnerId.toString() : null,
        battleMode: battle.battleMode,
      },
    });

    // Trigger Elo settlement for ranked battle completion
    await eloService.settleBattleElo(battle._id.toString());
    try {
      await tournamentService.processMatchBattleCompletion(battle._id.toString());
    } catch {
      // Ignore non-tournament battle completion errors
    }

    return battle;
  }

  /**
   * Auto-finalize battle if ACTIVE and expired.
   */
  private async autoFinalizeIfExpired(battle: IBattle) {
    if (
      battle.status === "ACTIVE" &&
      battle.endsAt &&
      Date.now() >= battle.endsAt.getTime()
    ) {
      await this.finalizeBattle(battle);
    }
  }

  /**
   * Get single battle by ID with auto-expiry.
   */
  async getBattleById(battleId: string): Promise<IBattle> {
    if (!Types.ObjectId.isValid(battleId)) {
      throw new BadRequestError("Invalid battle ID");
    }

    const battle = await Battle.findById(battleId);
    if (!battle) {
      throw new NotFoundError("Battle not found");
    }

    await this.autoFinalizeIfExpired(battle);
    return battle;
  }

  /**
   * Get detailed battle result breakdown.
   */
  async getBattleResult(battleId: string, userId: string) {
    const battle = await this.getBattleById(battleId);
    this.assertParticipant(battle, userId);
    await this.autoFinalizeIfExpired(battle);

    const participants = await BattleParticipant.find({ battleId: battle._id }).lean();
    const problems = await BattleProblem.find({ battleId: battle._id })
      .sort({ order: 1 })
      .lean();
    const submissions = await BattleSubmission.find({ battleId: battle._id })
      .sort({ submittedAt: 1 })
      .lean();

    const ratingSettlement = await eloService.settleBattleElo(battle._id.toString());

    return {
      battle,
      participants,
      problems,
      submissions,
      ratingSettlement,
    };
  }

  /**
   * Get my battles (incoming challenges, active, paginated history).
   */
  async getMyBattles(
    userId: string,
    options: { page?: number; limit?: number; filter?: string } = {}
  ) {
    const uid = new Types.ObjectId(userId);
    const page = Math.max(1, Number(options.page) || 1);
    const rawLimit = Number(options.limit) || 20;
    const limit = Math.max(1, Math.min(50, rawLimit));
    const filter = (options.filter || "all").toLowerCase();

    // Auto-finalize any active battles for this user that have expired
    const activeBattles = await Battle.find({
      $or: [{ creatorId: uid }, { opponentId: uid }],
      status: "ACTIVE",
    });
    for (const b of activeBattles) {
      if (b.endsAt && Date.now() >= new Date(b.endsAt).getTime()) {
        await this.finalizeBattle(b);
      }
    }

    // Incoming & Active (unpaginated transient states)
    const incoming = await Battle.find({
      opponentId: uid,
      status: "PENDING",
    })
      .sort({ createdAt: -1 })
      .lean();

    const active = await Battle.find({
      $or: [{ creatorId: uid }, { opponentId: uid }],
      status: { $in: ["ACCEPTED", "WAITING", "READY", "ACTIVE"] },
    })
      .sort({ createdAt: -1 })
      .lean();

    // History filter statuses
    let historyStatuses = [
      "FINISHED",
      "RESULT_PUBLISHED",
      "DECLINED",
      "CANCELLED",
      "FORFEITED",
    ];
    if (filter === "completed") {
      historyStatuses = ["FINISHED", "RESULT_PUBLISHED"];
    } else if (filter === "cancelled") {
      historyStatuses = ["DECLINED", "CANCELLED", "FORFEITED"];
    }

    const historyQuery = {
      $or: [{ creatorId: uid }, { opponentId: uid }],
      status: { $in: historyStatuses },
    };

    const total = await Battle.countDocuments(historyQuery);
    const totalPages = Math.ceil(total / limit) || 1;
    const effectivePage = Math.min(page, totalPages);
    const skip = (effectivePage - 1) * limit;

    const history = await Battle.find(historyQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return {
      incoming,
      active,
      history,
      pagination: {
        page: effectivePage,
        limit,
        total,
        totalPages,
        hasNextPage: effectivePage < totalPages,
        hasPreviousPage: effectivePage > 1,
        filter,
      },
    };
  }

  /**
   * Calculate battle statistics for authenticated user.
   */
  async getBattleStats(userId: string) {
    const uid = new Types.ObjectId(userId);

    // Auto-finalize any active battles for this user that have expired
    const activeBattles = await Battle.find({
      $or: [{ creatorId: uid }, { opponentId: uid }],
      status: "ACTIVE",
    });
    for (const b of activeBattles) {
      if (b.endsAt && Date.now() >= new Date(b.endsAt).getTime()) {
        await this.finalizeBattle(b);
      }
    }

    // Query all played/completed battles in chronological order for streak calculation
    const completedBattles = await Battle.find({
      $or: [{ creatorId: uid }, { opponentId: uid }],
      status: { $in: ["FINISHED", "RESULT_PUBLISHED", "FORFEITED"] },
    })
      .sort({ createdAt: 1 })
      .lean();

    const totalBattles = completedBattles.length;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let bestStreak = 0;
    let currentStreak = 0;
    let totalDurationMs = 0;
    let validDurationCount = 0;

    for (const b of completedBattles) {
      const isWinner = b.winnerId && b.winnerId.toString() === userId;
      const isDraw = !b.winnerId && b.status !== "FORFEITED";
      const isLoss = b.winnerId && b.winnerId.toString() !== userId;

      if (isWinner) {
        wins++;
        currentStreak++;
        if (currentStreak > bestStreak) {
          bestStreak = currentStreak;
        }
      } else if (isLoss) {
        losses++;
        currentStreak = 0;
      } else if (isDraw) {
        draws++;
        currentStreak = 0;
      }

      // Duration calculation
      let durationMs = 0;
      if (b.startedAt && b.finishedAt) {
        durationMs =
          new Date(b.finishedAt).getTime() - new Date(b.startedAt).getTime();
      } else if (b.durationSeconds) {
        durationMs = b.durationSeconds * 1000;
      }

      if (durationMs > 0) {
        totalDurationMs += durationMs;
        validDurationCount++;
      }
    }

    const winRate =
      totalBattles > 0
        ? Math.round((wins / totalBattles) * 100 * 10) / 10
        : 0;

    const averageDurationSeconds =
      validDurationCount > 0
        ? Math.round(totalDurationMs / validDurationCount / 1000)
        : 0;

    const averageDurationMinutes =
      Math.round((averageDurationSeconds / 60) * 10) / 10;

    return {
      totalBattles,
      wins,
      losses,
      draws,
      winRate,
      bestStreak,
      currentStreak,
      averageDurationSeconds,
      averageDurationMinutes,
    };
  }

  /**
   * Assert user is a participant of the battle.
   */
  private assertParticipant(battle: IBattle, userId: string) {
    const isCreator = battle.creatorId.toString() === userId;
    const isOpponent = battle.opponentId.toString() === userId;

    if (!isCreator && !isOpponent) {
      throw new ForbiddenError("You are not a participant in this battle.");
    }
  }
}

export const battleService = new BattleService();
