import { Types } from "mongoose";
import {
  Tournament,
  type TournamentStatus,
} from "../models/tournament.model";
import {
  TournamentParticipant,
  type ITournamentParticipant,
} from "../models/tournamentParticipant.model";
import {
  TournamentMatch,
  type ITournamentMatch,
} from "../models/tournamentMatch.model";
import { Battle } from "../models/battle.model";
import { UserSnapshot } from "../models/user.model";
import { battleService } from "./battle.service";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../utils/errors/app.error";
import { emitRealtimeEvent } from "../utils/helpers/realtimeEmit";

export type ActorCtx = {
  userId: string;
  email?: string;
  authorization?: string;
};

const ALLOWED_TRANSITIONS: Record<TournamentStatus, TournamentStatus[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["REGISTRATION_OPEN", "DRAFT", "ARCHIVED"],
  REGISTRATION_OPEN: ["REGISTRATION_CLOSED", "DRAFT", "ARCHIVED"],
  REGISTRATION_CLOSED: ["SEEDED", "DRAFT", "ARCHIVED"],
  SEEDED: ["IN_PROGRESS", "REGISTRATION_CLOSED", "ARCHIVED"],
  IN_PROGRESS: ["COMPLETED", "ARCHIVED"],
  COMPLETED: ["ARCHIVED"],
  ARCHIVED: [],
};

function oid(id: string, label = "id"): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return new Types.ObjectId(id);
}

function tournamentRoom(id: string | Types.ObjectId): string {
  return `tournament:${String(id)}`;
}

function emitTournamentEvent(
  tournamentId: string | Types.ObjectId,
  event: string,
  payload: Record<string, unknown>
) {
  emitRealtimeEvent({
    event,
    room: tournamentRoom(tournamentId),
    payload,
  });
}

/**
 * Standard single-elimination seed pairing order.
 * For 8 players: [1, 8], [4, 5], [2, 7], [3, 6]
 */
function getPairings(n: number): Array<[number, number]> {
  if (n === 8) {
    return [
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ];
  }
  if (n === 16) {
    return [
      [1, 16],
      [8, 9],
      [4, 13],
      [5, 12],
      [2, 15],
      [7, 10],
      [3, 14],
      [6, 11],
    ];
  }
  if (n === 32) {
    const pairings: Array<[number, number]> = [];
    const round1Pairs = [
      1, 32, 16, 17, 8, 25, 9, 24, 4, 29, 13, 20, 5, 28, 12, 21,
      2, 31, 15, 18, 7, 26, 10, 23, 3, 30, 14, 19, 6, 27, 11, 22,
    ];
    for (let i = 0; i < round1Pairs.length; i += 2) {
      pairings.push([round1Pairs[i], round1Pairs[i + 1]]);
    }
    return pairings;
  }

  // Fallback sequential pairs (1 vs N, 2 vs N-1...)
  const pairs: Array<[number, number]> = [];
  for (let i = 1; i <= n / 2; i++) {
    pairs.push([i, n - i + 1]);
  }
  return pairs;
}

export class TournamentService {
  async listPublicTournaments() {
    return Tournament.find({
      status: { $ne: "DRAFT" },
    })
      .sort({ startTime: -1 })
      .lean({ virtuals: true });
  }

  async listAllTournaments() {
    return Tournament.find({})
      .sort({ createdAt: -1 })
      .lean({ virtuals: true });
  }

  async getPublicBySlug(slug: string, viewerUserId?: string) {
    const tournament = await Tournament.findOne({
      slug: slug.toLowerCase().trim(),
      status: { $ne: "DRAFT" },
    });
    if (!tournament) throw new NotFoundError("Tournament not found");

    let isRegistered = false;
    let myParticipant: any = null;

    if (viewerUserId) {
      myParticipant = await TournamentParticipant.findOne({
        tournamentId: tournament._id,
        userId: String(viewerUserId),
      }).lean();
      isRegistered = Boolean(myParticipant);
    }

    return {
      ...tournament.toJSON(),
      isRegistered,
      myParticipant,
    };
  }

  async createTournament(
    input: {
      title: string;
      slug: string;
      description?: string;
      maxParticipants?: number;
      startTime: Date;
    },
    actor: ActorCtx
  ) {
    const slug = input.slug.toLowerCase().trim();
    const existing = await Tournament.findOne({ slug });
    if (existing) throw new ConflictError(`Tournament slug already exists: ${slug}`);

    const maxParticipants = input.maxParticipants || 8;
    if (![8, 16, 32].includes(maxParticipants)) {
      throw new BadRequestError("Supported bracket sizes are 8, 16, or 32 participants");
    }

    const totalRounds = Math.log2(maxParticipants);

    return Tournament.create({
      title: input.title,
      slug,
      description: input.description || "",
      format: "SINGLE_ELIMINATION",
      maxParticipants,
      minParticipants: maxParticipants,
      totalRounds,
      startTime: input.startTime,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });
  }

  async updateTournament(
    tournamentId: string,
    input: {
      title?: string;
      description?: string;
      startTime?: Date;
    },
    actor: ActorCtx
  ) {
    const tournament = await Tournament.findById(oid(tournamentId));
    if (!tournament) throw new NotFoundError("Tournament not found");

    if (["IN_PROGRESS", "COMPLETED", "ARCHIVED"].includes(tournament.status)) {
      throw new BadRequestError("Cannot edit tournament in progress or completed");
    }

    if (input.title !== undefined) tournament.title = input.title;
    if (input.description !== undefined) tournament.description = input.description;
    if (input.startTime !== undefined) tournament.startTime = input.startTime;
    tournament.updatedBy = actor.userId;

    await tournament.save();
    return tournament;
  }

  async transitionStatus(
    tournamentId: string,
    toStatus: TournamentStatus,
    actor: ActorCtx
  ) {
    const tournament = await Tournament.findById(oid(tournamentId));
    if (!tournament) throw new NotFoundError("Tournament not found");

    const allowed = ALLOWED_TRANSITIONS[tournament.status];
    if (!allowed || !allowed.includes(toStatus)) {
      throw new BadRequestError(
        `Cannot transition tournament from ${tournament.status} to ${toStatus}`
      );
    }

    tournament.status = toStatus;
    tournament.updatedBy = actor.userId;
    await tournament.save();

    emitTournamentEvent(tournament._id, "tournament.status_changed", {
      tournamentId: tournament._id.toString(),
      status: toStatus,
    });

    return tournament;
  }

  /**
   * Idempotent participant registration with atomic capacity enforcement.
   */
  async register(slug: string, user: { id: string; name: string; avatar?: string }) {
    const tournament = await Tournament.findOne({
      slug: slug.toLowerCase().trim(),
    });
    if (!tournament) throw new NotFoundError("Tournament not found");

    if (tournament.status !== "REGISTRATION_OPEN") {
      throw new BadRequestError("Registration is not open for this tournament");
    }

    // Atomic capacity increment
    const updated = await Tournament.findOneAndUpdate(
      {
        _id: tournament._id,
        status: "REGISTRATION_OPEN",
        participantCount: { $lt: tournament.maxParticipants },
      },
      { $inc: { participantCount: 1 } },
      { new: true }
    );

    if (!updated) {
      throw new ConflictError("Tournament is full");
    }

    try {
      const participant = await TournamentParticipant.create({
        tournamentId: tournament._id,
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar || "",
        registeredAt: new Date(),
      });

      emitTournamentEvent(tournament._id, "tournament.registered", {
        tournamentId: tournament._id.toString(),
        userId: user.id,
        participantCount: updated.participantCount,
      });

      return participant;
    } catch (err: any) {
      // Rollback participant count if duplicate registration attempt
      await Tournament.updateOne(
        { _id: tournament._id },
        { $inc: { participantCount: -1 } }
      );

      if (err?.code === 11000) {
        throw new ConflictError("You are already registered for this tournament");
      }
      throw err;
    }
  }

  /**
   * Seed participants by User.rating DESC and generate single-elimination bracket tree.
   */
  async seedAndGenerateBracket(tournamentId: string, actor: ActorCtx) {
    const tournament = await Tournament.findById(oid(tournamentId));
    if (!tournament) throw new NotFoundError("Tournament not found");

    if (tournament.participantCount !== tournament.maxParticipants) {
      throw new BadRequestError(
        `Cannot seed tournament: requires exactly ${tournament.maxParticipants} registered participants (current: ${tournament.participantCount})`
      );
    }

    // 1. Fetch registered participants & user ratings
    const participants = await TournamentParticipant.find({
      tournamentId: tournament._id,
    });

    const userIds = participants.map((p) => p.userId);
    const users = await UserSnapshot.find({ _id: { $in: userIds } }).lean();
    const userRatingMap = new Map<string, number>(
      users.map((u) => [u._id.toString(), (u as any).rating ?? 1000])
    );

    // Sort by rating DESC, then registeredAt ASC for deterministic tie-breaking
    const sorted = [...participants].sort((a, b) => {
      const rA = userRatingMap.get(a.userId) ?? 1000;
      const rB = userRatingMap.get(b.userId) ?? 1000;
      if (rB !== rA) return rB - rA;
      return a.registeredAt.getTime() - b.registeredAt.getTime();
    });

    // Assign Seeds 1..N
    const seedMap = new Map<number, ITournamentParticipant>();
    for (let i = 0; i < sorted.length; i++) {
      const seed = i + 1;
      sorted[i].seed = seed;
      sorted[i].status = "ACTIVE";
      await sorted[i].save();
      seedMap.set(seed, sorted[i]);
    }

    // Clear any previous matches if re-seeding in DRAFT/CLOSED state
    await TournamentMatch.deleteMany({ tournamentId: tournament._id });

    // 2. Generate Single-Elimination Matches Tree
    const totalRounds = tournament.totalRounds;
    const n = tournament.maxParticipants;
    const matchesByRound: Map<number, ITournamentMatch[]> = new Map();

    // Create empty match documents for rounds (totalRounds down to 1)
    for (let r = totalRounds; r >= 1; r--) {
      const matchesInRound = Math.pow(2, totalRounds - r);
      const matchesList: ITournamentMatch[] = [];

      for (let m = 1; m <= matchesInRound; m++) {
        let label = `Round ${r} Match ${m}`;
        if (r === totalRounds) label = "Final";
        else if (r === totalRounds - 1) label = `Semi Final ${m}`;
        else if (r === totalRounds - 2) label = `Quarter Final ${m}`;

        const match = await TournamentMatch.create({
          tournamentId: tournament._id,
          roundNumber: r,
          matchNumber: m,
          label,
          status: r === 1 ? "READY" : "PENDING",
        });

        matchesList.push(match);
      }
      matchesByRound.set(r, matchesList);
    }

    // Link parent-child (nextMatchId) pointers between rounds
    for (let r = 1; r < totalRounds; r++) {
      const currentMatches = matchesByRound.get(r)!;
      const nextMatches = matchesByRound.get(r + 1)!;

      for (let i = 0; i < currentMatches.length; i++) {
        const nextIndex = Math.floor(i / 2);
        const slot = i % 2 === 0 ? "A" : "B";
        const nextMatch = nextMatches[nextIndex];

        currentMatches[i].nextMatchId = nextMatch._id as Types.ObjectId;
        currentMatches[i].nextMatchSlot = slot;
        await currentMatches[i].save();
      }
    }

    // Populate Round 1 participants according to seed pairing
    const round1Matches = matchesByRound.get(1)!;
    const pairings = getPairings(n);

    for (let i = 0; i < round1Matches.length; i++) {
      const [seedA, seedB] = pairings[i];
      const partA = seedMap.get(seedA)!;
      const partB = seedMap.get(seedB)!;

      round1Matches[i].participantA = {
        userId: partA.userId,
        userName: partA.userName,
        seed: partA.seed,
      };
      round1Matches[i].participantB = {
        userId: partB.userId,
        userName: partB.userName,
        seed: partB.seed,
      };
      round1Matches[i].status = "READY";
      await round1Matches[i].save();
    }

    tournament.status = "SEEDED";
    tournament.currentRound = 1;
    tournament.updatedBy = actor.userId;
    await tournament.save();

    emitTournamentEvent(tournament._id, "tournament.seeded", {
      tournamentId: tournament._id.toString(),
      totalRounds,
      participantCount: n,
    });

    return tournament;
  }

  /**
   * Start seeded tournament and make Round 1 matches ready for competition.
   */
  async startTournament(tournamentId: string, actor: ActorCtx) {
    const tournament = await Tournament.findById(oid(tournamentId));
    if (!tournament) throw new NotFoundError("Tournament not found");

    if (tournament.status !== "SEEDED" && tournament.status !== "REGISTRATION_CLOSED") {
      throw new BadRequestError("Tournament must be SEEDED before starting");
    }

    tournament.status = "IN_PROGRESS";
    tournament.currentRound = 1;
    tournament.updatedBy = actor.userId;
    await tournament.save();

    emitTournamentEvent(tournament._id, "tournament.started", {
      tournamentId: tournament._id.toString(),
      currentRound: 1,
    });

    emitTournamentEvent(tournament._id, "tournament.round_started", {
      tournamentId: tournament._id.toString(),
      roundNumber: 1,
    });

    return tournament;
  }

  /**
   * Initialize a 1v1 Battle for a READY TournamentMatch.
   */
  async startMatchBattle(matchId: string) {
    const match = await TournamentMatch.findById(oid(matchId));
    if (!match) throw new NotFoundError("Tournament match not found");

    if (!match.participantA || !match.participantB) {
      throw new BadRequestError("Match does not have two assigned participants");
    }

    if (match.status === "LIVE" && match.battleId) {
      const existingBattle = await Battle.findById(match.battleId);
      return { match, battle: existingBattle };
    }

    // Create Battle challenge between participantA and participantB
    const creatorCtx = {
      id: match.participantA.userId,
      name: match.participantA.userName,
      email: `${match.participantA.userId}@tournament.local`,
    };

    const battle = await battleService.createChallenge(creatorCtx, {
      opponentId: match.participantB.userId,
      difficulty: "medium",
      problemCount: 2,
      durationSeconds: 1200,
      battleMode: "unranked", // Tournament progression controls ranking
    });

    // Auto accept challenge for tournament match
    const acceptedBattle = await battleService.acceptChallenge(
      (battle._id as Types.ObjectId).toString(),
      match.participantB.userId
    );

    match.battleId = acceptedBattle._id as Types.ObjectId;
    match.status = "LIVE";
    match.startedAt = new Date();
    await match.save();

    emitTournamentEvent(match.tournamentId, "tournament.match_started", {
      tournamentId: match.tournamentId.toString(),
      matchId: match._id.toString(),
      battleId: (acceptedBattle._id as Types.ObjectId).toString(),
      roundNumber: match.roundNumber,
      participantA: match.participantA,
      participantB: match.participantB,
    });

    return { match, battle: acceptedBattle };
  }

  /**
   * Idempotent progression handler when a Battle completes.
   */
  async processMatchBattleCompletion(battleId: string) {
    const bId = oid(battleId, "battleId");
    const battle = await Battle.findById(bId);
    if (!battle) return null;

    if (!["FINISHED", "RESULT_PUBLISHED", "FORFEITED"].includes(battle.status)) {
      return null;
    }

    // Atomic claim check
    const match = await TournamentMatch.findOneAndUpdate(
      { battleId: bId, status: { $in: ["READY", "LIVE"] } },
      { $set: { status: "COMPLETED", completedAt: new Date() } },
      { new: true }
    );

    if (!match) {
      // Match already completed idempotently!
      return null;
    }

    const winnerId = battle.winnerId ? battle.winnerId.toString() : "";
    const loserId =
      winnerId === match.participantA?.userId
        ? match.participantB?.userId
        : match.participantA?.userId;

    match.winnerId = winnerId;
    match.loserId = loserId;
    await match.save();

    const tId = match.tournamentId;
    const tournament = await Tournament.findById(tId);
    if (!tournament) return null;

    // Update Winner participant stats
    await TournamentParticipant.findOneAndUpdate(
      { tournamentId: tId, userId: winnerId },
      { $inc: { wins: 1 }, $set: { status: "ACTIVE" } }
    );

    // Update Loser participant stats
    if (loserId) {
      await TournamentParticipant.findOneAndUpdate(
        { tournamentId: tId, userId: loserId },
        {
          $inc: { losses: 1 },
          $set: { status: "ELIMINATED", eliminatedRound: match.roundNumber },
        }
      );
    }

    emitTournamentEvent(tId, "tournament.match_completed", {
      tournamentId: tId.toString(),
      matchId: match._id.toString(),
      roundNumber: match.roundNumber,
      winnerId,
      loserId,
    });

    // Advance winner to next match if present
    if (match.nextMatchId && match.nextMatchSlot) {
      const winnerParticipant =
        winnerId === match.participantA?.userId
          ? match.participantA
          : match.participantB;

      const slotKey = match.nextMatchSlot === "A" ? "participantA" : "participantB";

      const updatedNextMatch = await TournamentMatch.findByIdAndUpdate(
        match.nextMatchId,
        { $set: { [slotKey]: winnerParticipant } },
        { new: true }
      );

      emitTournamentEvent(tId, "tournament.player_advanced", {
        tournamentId: tId.toString(),
        winnerId,
        nextMatchId: match.nextMatchId.toString(),
        slot: match.nextMatchSlot,
      });

      // If both slots filled, mark next match READY
      if (
        updatedNextMatch &&
        updatedNextMatch.participantA?.userId &&
        updatedNextMatch.participantB?.userId &&
        updatedNextMatch.status === "PENDING"
      ) {
        updatedNextMatch.status = "READY";
        await updatedNextMatch.save();
      }
    }

    // Check Round Completion & Tournament Champion
    const roundMatches = await TournamentMatch.find({
      tournamentId: tId,
      roundNumber: tournament.currentRound,
    });

    const allRoundCompleted = roundMatches.every((m) => m.status === "COMPLETED");

    if (allRoundCompleted) {
      if (tournament.currentRound >= tournament.totalRounds) {
        // Tournament Final completed -> Crown Champion!
        tournament.status = "COMPLETED";
        tournament.championId = winnerId;
        tournament.championName =
          winnerId === match.participantA?.userId
            ? match.participantA?.userName
            : match.participantB?.userName;

        await tournament.save();

        await TournamentParticipant.findOneAndUpdate(
          { tournamentId: tId, userId: winnerId },
          { $set: { status: "CHAMPION" } }
        );

        emitTournamentEvent(tId, "tournament.completed", {
          tournamentId: tId.toString(),
          championId: winnerId,
          championName: tournament.championName,
        });
      } else {
        // Advance Tournament Round
        tournament.currentRound += 1;
        await tournament.save();

        emitTournamentEvent(tId, "tournament.round_started", {
          tournamentId: tId.toString(),
          roundNumber: tournament.currentRound,
        });
      }
    }

    return { match, tournament };
  }

  async getBracket(slug: string) {
    const tournament = await Tournament.findOne({
      slug: slug.toLowerCase().trim(),
      status: { $ne: "DRAFT" },
    });
    if (!tournament) throw new NotFoundError("Tournament not found");

    const matches = await TournamentMatch.find({ tournamentId: tournament._id })
      .sort({ roundNumber: 1, matchNumber: 1 })
      .lean();

    return {
      tournament: tournament.toJSON(),
      matches,
    };
  }

  async getResults(slug: string) {
    const tournament = await Tournament.findOne({
      slug: slug.toLowerCase().trim(),
    });
    if (!tournament) throw new NotFoundError("Tournament not found");

    const participants = await TournamentParticipant.find({
      tournamentId: tournament._id,
    })
      .sort({ wins: -1, losses: 1, seed: 1 })
      .lean();

    return {
      tournament: tournament.toJSON(),
      champion: tournament.championId
        ? { id: tournament.championId, name: tournament.championName }
        : null,
      participants,
    };
  }

  async getMyTournamentSummary(userId: string) {
    const uid = String(userId || "").trim();
    if (!uid) return { tournamentsEntered: 0, items: [] };

    const parts = await TournamentParticipant.find({ userId: uid })
      .sort({ registeredAt: -1 })
      .lean();

    const tIds = parts.map((p) => p.tournamentId);
    const tournaments = tIds.length
      ? await Tournament.find({ _id: { $in: tIds } })
          .select("title slug status startTime format championName")
          .lean()
      : [];

    const tMap = new Map(tournaments.map((t) => [t._id.toString(), t]));

    const items = parts.map((p) => {
      const t = tMap.get(p.tournamentId.toString());
      return {
        tournamentId: p.tournamentId.toString(),
        title: t?.title || "",
        slug: t?.slug || "",
        status: t?.status || "",
        seed: p.seed,
        userStatus: p.status,
        wins: p.wins,
        losses: p.losses,
        registeredAt: p.registeredAt,
      };
    });

    return {
      tournamentsEntered: parts.length,
      items,
    };
  }
}

export const tournamentService = new TournamentService();
