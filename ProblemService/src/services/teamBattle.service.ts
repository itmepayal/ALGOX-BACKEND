import { Types } from "mongoose";
import "../models/user.model";
import { TeamBattle, ITeamBattle } from "../models/teamBattle.model";
import { Team } from "../models/team.model";
import { TeamMember } from "../models/teamMember.model";
import { Problem } from "../models/problem.model";


import { emitRealtimeEvent } from "../utils/helpers/realtimeEmit";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from "../utils/errors/app.error";

const K_FACTOR = 32;

function calculateEloChange(ratingA: number, ratingB: number, scoreA: number): {
  changeA: number;
  changeB: number;
} {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const changeA = Math.round(K_FACTOR * (scoreA - expectedA));
  const changeB = -changeA;
  return { changeA, changeB };
}

export class TeamBattleService {
  /**
   * Challenge another team to a coding battle.
   */
  async challengeTeam(
    creatorUserId: string,
    teamAId: string,
    teamBId: string,
    durationSeconds = 1800
  ): Promise<ITeamBattle> {
    if (!Types.ObjectId.isValid(teamAId) || !Types.ObjectId.isValid(teamBId)) {
      throw new BadRequestError("Invalid team IDs");
    }

    if (teamAId === teamBId) {
      throw new BadRequestError("A team cannot challenge itself");
    }

    // Check authorization: creator must be OWNER or CAPTAIN of Team A
    const creatorMember = await TeamMember.findOne({
      teamId: new Types.ObjectId(teamAId),
      userId: new Types.ObjectId(creatorUserId),
    }).lean();

    if (!creatorMember || (creatorMember.role !== "OWNER" && creatorMember.role !== "CAPTAIN")) {
      throw new ForbiddenError("Only team Owner or Captains can issue a challenge");
    }

    // Check both teams exist and are active
    const teamA = await Team.findById(teamAId).lean();
    const teamB = await Team.findById(teamBId).lean();

    if (!teamA || teamA.status !== "ACTIVE" || !teamB || teamB.status !== "ACTIVE") {
      throw new NotFoundError("One or both teams are inactive or not found");
    }

    // Check if there is an active battle between these teams
    const activeBattle = await TeamBattle.findOne({
      $or: [
        { teamAId: teamA._id, teamBId: teamB._id },
        { teamAId: teamB._id, teamBId: teamA._id },
      ],
      state: { $in: ["PENDING_ACCEPTANCE", "ACCEPTED", "LOBBY", "READY", "LIVE"] },
    }).lean();

    if (activeBattle) {
      throw new ConflictError("An active battle challenge already exists between these teams");
    }

    // Select 3 published problems (Easy, Medium, Hard)
    const easyProblems = await Problem.find({ difficulty: "easy", status: "published" })
      .limit(1)
      .select("_id")
      .lean();
    const mediumProblems = await Problem.find({ difficulty: "medium", status: "published" })
      .limit(1)
      .select("_id")
      .lean();
    const hardProblems = await Problem.find({ difficulty: "hard", status: "published" })
      .limit(1)
      .select("_id")
      .lean();

    const problemIds = [
      ...easyProblems.map((p) => p._id),
      ...mediumProblems.map((p) => p._id),
      ...hardProblems.map((p) => p._id),
    ];

    const battle = await TeamBattle.create({
      teamAId: teamA._id,
      teamBId: teamB._id,
      creatorId: new Types.ObjectId(creatorUserId),
      teamAParticipants: [new Types.ObjectId(creatorUserId)],
      teamBParticipants: [],
      problemIds,
      state: "PENDING_ACCEPTANCE",
      durationSeconds: Math.max(300, Math.min(7200, Number(durationSeconds) || 1800)),
      teamAScore: 0,
      teamBScore: 0,
      teamARatingChange: 0,
      teamBRatingChange: 0,
    });

    emitRealtimeEvent({
      event: "team:battle_created",
      room: `team:${teamBId}`,
      payload: {
        battleId: battle._id.toString(),
        challengingTeamId: teamAId,
        challengingTeamName: teamA.name,
      },
    });

    return battle;
  }

  /**
   * Accept a battle challenge (Team B Owner/Captain).
   */
  async acceptBattle(acceptorUserId: string, battleId: string): Promise<ITeamBattle> {
    if (!Types.ObjectId.isValid(battleId)) {
      throw new BadRequestError("Invalid battleId format");
    }

    const battle = await TeamBattle.findById(battleId);
    if (!battle || battle.state !== "PENDING_ACCEPTANCE") {
      throw new NotFoundError("Pending team battle challenge not found");
    }

    // Check acceptor authorization
    const acceptorMember = await TeamMember.findOne({
      teamId: battle.teamBId,
      userId: new Types.ObjectId(acceptorUserId),
    }).lean();

    if (!acceptorMember || (acceptorMember.role !== "OWNER" && acceptorMember.role !== "CAPTAIN")) {
      throw new ForbiddenError("Only Team B Owner or Captains can accept this challenge");
    }

    battle.state = "LOBBY";
    if (!battle.teamBParticipants.some((p) => p.toString() === acceptorUserId)) {
      battle.teamBParticipants.push(new Types.ObjectId(acceptorUserId));
    }
    await battle.save();

    emitRealtimeEvent({
      event: "team:battle_accepted",
      room: `team:${battle.teamAId.toString()}`,
      payload: {
        battleId: battle._id.toString(),
        acceptorUserId,
      },
    });

    emitRealtimeEvent({
      event: "team:battle_state",
      room: `team:${battle.teamBId.toString()}`,
      payload: {
        battleId: battle._id.toString(),
        state: "LOBBY",
      },
    });

    return battle;
  }

  /**
   * Select/lock roster participants for a team in lobby.
   */
  async selectParticipants(
    userId: string,
    battleId: string,
    teamId: string,
    participantUserIds: string[]
  ): Promise<ITeamBattle> {
    const battle = await TeamBattle.findById(battleId);
    if (!battle || (battle.state !== "PENDING_ACCEPTANCE" && battle.state !== "LOBBY")) {
      throw new NotFoundError("Battle not in lobby state");
    }

    const isTeamA = battle.teamAId.toString() === teamId;
    const isTeamB = battle.teamBId.toString() === teamId;
    if (!isTeamA && !isTeamB) {
      throw new ForbiddenError("Team is not part of this battle");
    }

    // Check user is captain/owner of the team
    const captainMember = await TeamMember.findOne({
      teamId: new Types.ObjectId(teamId),
      userId: new Types.ObjectId(userId),
    }).lean();

    if (!captainMember || (captainMember.role !== "OWNER" && captainMember.role !== "CAPTAIN")) {
      throw new ForbiddenError("Only team Captain/Owner can set the battle roster");
    }

    // Validate each participant belongs to the team
    const validMembers = await TeamMember.find({
      teamId: new Types.ObjectId(teamId),
      userId: { $in: participantUserIds.map((id) => new Types.ObjectId(id)) },
    })
      .select("userId")
      .lean();

    const validIds = validMembers.map((m) => m.userId);

    if (isTeamA) {
      battle.teamAParticipants = validIds;
    } else {
      battle.teamBParticipants = validIds;
    }

    await battle.save();

    emitRealtimeEvent({
      event: "team:member_status",
      room: `battle:${battleId}`,
      payload: {
        battleId,
        teamId,
        participantUserIds: validIds.map((id) => id.toString()),
      },
    });

    return battle;
  }

  /**
   * Start Team Battle.
   */
  async startBattle(userId: string, battleId: string): Promise<ITeamBattle> {
    const battle = await TeamBattle.findById(battleId);
    if (!battle || (battle.state !== "LOBBY" && battle.state !== "PENDING_ACCEPTANCE")) {
      throw new BadRequestError("Battle cannot be started from current state");
    }

    const creatorMember = await TeamMember.findOne({
      teamId: battle.teamAId,
      userId: new Types.ObjectId(userId),
    }).lean();

    if (!creatorMember || (creatorMember.role !== "OWNER" && creatorMember.role !== "CAPTAIN")) {
      throw new ForbiddenError("Only creator team Captain/Owner can initiate start");
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + battle.durationSeconds * 1000);

    battle.state = "LIVE";
    battle.startedAt = now;
    battle.endsAt = endsAt;

    await battle.save();

    emitRealtimeEvent({
      event: "team:battle_started",
      room: `battle:${battleId}`,
      payload: {
        battleId,
        startedAt: now,
        endsAt,
      },
    });

    return battle;
  }

  /**
   * Record score update when a team participant solves a problem.
   */
  async recordSubmissionScore(
    battleId: string,
    teamId: string,
    points: number
  ): Promise<ITeamBattle | null> {
    const battle = await TeamBattle.findById(battleId);
    if (!battle || battle.state !== "LIVE") {
      return null;
    }

    if (battle.teamAId.toString() === teamId) {
      battle.teamAScore += points;
    } else if (battle.teamBId.toString() === teamId) {
      battle.teamBScore += points;
    }

    await battle.save();
    return battle;
  }

  /**
   * Finish Team Battle, calculate final result & ELO rating changes.
   */
  async finishBattle(battleId: string): Promise<ITeamBattle> {
    const battle = await TeamBattle.findById(battleId);
    if (!battle || battle.state === "COMPLETED") {
      if (battle) return battle;
      throw new NotFoundError("Battle not found");
    }

    const teamA = await Team.findById(battle.teamAId);
    const teamB = await Team.findById(battle.teamBId);

    if (!teamA || !teamB) {
      throw new NotFoundError("Teams not found");
    }

    // Determine winner
    let scoreA = 0.5; // Draw
    if (battle.teamAScore > battle.teamBScore) {
      scoreA = 1;
      battle.winnerTeamId = teamA._id;
    } else if (battle.teamBScore > battle.teamAScore) {
      scoreA = 0;
      battle.winnerTeamId = teamB._id;
    }

    // Calculate ELO changes
    const { changeA, changeB } = calculateEloChange(teamA.rating, teamB.rating, scoreA);

    battle.teamARatingChange = changeA;
    battle.teamBRatingChange = changeB;
    battle.state = "COMPLETED";
    battle.completedAt = new Date();

    await battle.save();

    // Update Team A statistics
    teamA.matches += 1;
    teamA.rating += changeA;
    teamA.peakRating = Math.max(teamA.peakRating, teamA.rating);
    if (scoreA === 1) teamA.wins += 1;
    else if (scoreA === 0) teamA.losses += 1;
    else teamA.draws += 1;
    await teamA.save();

    // Update Team B statistics
    teamB.matches += 1;
    teamB.rating += changeB;
    teamB.peakRating = Math.max(teamB.peakRating, teamB.rating);
    if (scoreA === 0) teamB.wins += 1;
    else if (scoreA === 1) teamB.losses += 1;
    else teamB.draws += 1;
    await teamB.save();

    emitRealtimeEvent({
      event: "team:battle_ended",
      room: `battle:${battleId}`,
      payload: {
        battleId,
        winnerTeamId: battle.winnerTeamId?.toString() || null,
        teamAScore: battle.teamAScore,
        teamBScore: battle.teamBScore,
        teamARatingChange: changeA,
        teamBRatingChange: changeB,
      },
    });

    emitRealtimeEvent({
      event: "team:rating_updated",
      room: `team:${teamA._id.toString()}`,
      payload: { teamId: teamA._id.toString(), newRating: teamA.rating, change: changeA },
    });

    emitRealtimeEvent({
      event: "team:rating_updated",
      room: `team:${teamB._id.toString()}`,
      payload: { teamId: teamB._id.toString(), newRating: teamB.rating, change: changeB },
    });

    return battle;
  }

  /**
   * Get Team Battle details.
   */
  async getBattleById(battleId: string) {
    if (!Types.ObjectId.isValid(battleId)) {
      throw new BadRequestError("Invalid battleId format");
    }

    const battle = await TeamBattle.findById(battleId)
      .populate("teamAId", "name slug rating")
      .populate("teamBId", "name slug rating")
      .populate("teamAParticipants", "username email name avatar")
      .populate("teamBParticipants", "username email name avatar")
      .populate("problemIds", "title slug difficulty points")
      .lean();

    if (!battle) {
      throw new NotFoundError("Team battle not found");
    }

    return battle;
  }

  /**
   * Get Team Leaderboard.
   */
  async getTeamLeaderboard(page = 1, limit = 20) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [teams, total] = await Promise.all([
      Team.find({ status: "ACTIVE" })
        .sort({ rating: -1, wins: -1, createdAt: 1 })
        .skip(skip)
        .limit(limitNum)
        .select("name slug description ownerId rating peakRating wins losses draws matches createdAt")
        .lean(),
      Team.countDocuments({ status: "ACTIVE" }),
    ]);

    return {
      items: teams.map((t, idx) => ({
        rank: skip + idx + 1,
        ...t,
        winRate: t.matches > 0 ? Math.round((t.wins / t.matches) * 100) : 0,
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  /**
   * Record a submission verdict for a team battle.
   */
  async recordSubmissionVerdict(
    battleId: string,
    payload: {
      userId: string;
      problemId: string;
      submissionId: string;
      status: string;
      points?: number;
    }
  ) {
    const battle = await TeamBattle.findById(battleId);
    if (!battle || battle.state !== "LIVE") return;

    if (battle.endsAt && Date.now() >= battle.endsAt.getTime()) {
      await this.finishBattle(battleId);
      return;
    }

    const { userId, problemId, status, points = 100 } = payload;
    const isTeamA = battle.teamAParticipants.some((p) => p.toString() === userId);
    const isTeamB = battle.teamBParticipants.some((p) => p.toString() === userId);

    if (!isTeamA && !isTeamB) return;

    const teamId = isTeamA ? battle.teamAId.toString() : battle.teamBId.toString();

    if (status !== "ACCEPTED") {
      emitRealtimeEvent({
        event: "team:submission_status",
        room: `battle:${battleId}`,
        payload: {
          battleId,
          userId,
          teamId,
          problemId,
          status,
          solved: false,
        },
      });
      return;
    }

    if (isTeamA) {
      battle.teamAScore += points;
    } else {
      battle.teamBScore += points;
    }
    await battle.save();

    emitRealtimeEvent({
      event: "team:submission_status",
      room: `battle:${battleId}`,
      payload: {
        battleId,
        userId,
        teamId,
        problemId,
        status: "ACCEPTED",
        solved: true,
        teamAScore: battle.teamAScore,
        teamBScore: battle.teamBScore,
      },
    });

    emitRealtimeEvent({
      event: "team:battle_state",
      room: `battle:${battleId}`,
      payload: {
        battleId,
        teamAScore: battle.teamAScore,
        teamBScore: battle.teamBScore,
        state: "LIVE",
      },
    });
  }

  /**
   * Cancel Team Battle.
   */
  async cancelBattle(userId: string, battleId: string) {
    const battle = await TeamBattle.findById(battleId);
    if (!battle || battle.state === "COMPLETED" || battle.state === "CANCELLED") {
      throw new BadRequestError("Battle cannot be cancelled");
    }

    battle.state = "CANCELLED";
    await battle.save();

    emitRealtimeEvent({
      event: "team:battle_state",
      room: `battle:${battleId}`,
      payload: { battleId, state: "CANCELLED" },
    });

    return battle;
  }
}

export const teamBattleService = new TeamBattleService();
