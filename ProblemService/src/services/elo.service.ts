import { Types } from "mongoose";
import { Battle } from "../models/battle.model";
import { UserSnapshot } from "../models/user.model";
import { RatingHistory } from "../models/ratingHistory.model";
import { emitRealtimeEvent } from "../utils/helpers/realtimeEmit";
import logger from "../config/logger.config";

export const ELO_K_FACTOR = Number(process.env.ELO_K_FACTOR) || 32;
export const DEFAULT_RATING = 1000;
export const MIN_RATING = 100;

export interface EloCalcOutput {
  previousRating: number;
  newRating: number;
  ratingChange: number;
  peakRating: number;
}

export function calculateElo(
  ratingA: number,
  ratingB: number,
  scoreA: number, // 1 for win, 0.5 for draw, 0 for loss
  kFactor: number = ELO_K_FACTOR
) {
  const scoreB = 1 - scoreA;
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 / (1 + Math.pow(10, (ratingA - ratingB) / 400));

  const changeA = Math.round(kFactor * (scoreA - expectedA));
  const changeB = Math.round(kFactor * (scoreB - expectedB));

  const newRatingA = Math.max(MIN_RATING, ratingA + changeA);
  const newRatingB = Math.max(MIN_RATING, ratingB + changeB);

  return {
    playerA: {
      previousRating: ratingA,
      newRating: newRatingA,
      ratingChange: newRatingA - ratingA,
    },
    playerB: {
      previousRating: ratingB,
      newRating: newRatingB,
      ratingChange: newRatingB - ratingB,
    },
  };
}

export class EloService {
  /**
   * Idempotent & Concurrency-Safe Rating Settlement for completed Battles.
   */
  async settleBattleElo(battleId: string) {
    const bId = new Types.ObjectId(battleId);

    // 1. Fetch battle document
    const battle = await Battle.findById(bId);
    if (!battle) return null;

    // Only RANKED, finished/forfeited battles qualify for rating
    if (
      battle.battleMode !== "ranked" ||
      !["FINISHED", "RESULT_PUBLISHED", "FORFEITED"].includes(battle.status)
    ) {
      return null;
    }

    // 2. Atomic Idempotency Check: Claim settlement lock by setting isRated = true
    const claimedBattle = await Battle.findOneAndUpdate(
      { _id: bId, isRated: false },
      { $set: { isRated: true } },
      { new: true }
    );

    if (!claimedBattle) {
      // Already settled! Return existing settlement audit records idempotently
      const existingHistory = await RatingHistory.find({ battleId: bId }).lean();
      return {
        alreadySettled: true,
        settlements: existingHistory,
      };
    }

    // 3. Fetch current user rating snapshots
    const [creatorUser, opponentUser] = await Promise.all([
      UserSnapshot.findById(battle.creatorId).lean(),
      UserSnapshot.findById(battle.opponentId).lean(),
    ]);

    const creatorRating = (creatorUser as any)?.rating ?? DEFAULT_RATING;
    const creatorPeak = (creatorUser as any)?.peakRating ?? DEFAULT_RATING;
    const opponentRating = (opponentUser as any)?.rating ?? DEFAULT_RATING;
    const opponentPeak = (opponentUser as any)?.peakRating ?? DEFAULT_RATING;

    // 4. Determine outcome score
    let scoreA = 0.5; // Default Draw
    let resultA: "WIN" | "LOSS" | "DRAW" = "DRAW";
    let resultB: "WIN" | "LOSS" | "DRAW" = "DRAW";

    if (battle.winnerId) {
      if (battle.winnerId.toString() === battle.creatorId.toString()) {
        scoreA = 1.0;
        resultA = "WIN";
        resultB = "LOSS";
      } else if (battle.winnerId.toString() === battle.opponentId.toString()) {
        scoreA = 0.0;
        resultA = "LOSS";
        resultB = "WIN";
      }
    }

    // 5. Compute Elo changes
    const elo = calculateElo(creatorRating, opponentRating, scoreA);

    const newCreatorPeak = Math.max(creatorPeak, elo.playerA.newRating);
    const newOpponentPeak = Math.max(opponentPeak, elo.playerB.newRating);

    // 6. Persist User Ratings atomically
    await Promise.all([
      UserSnapshot.findByIdAndUpdate(battle.creatorId, {
        $set: { rating: elo.playerA.newRating },
        $max: { peakRating: newCreatorPeak },
      }),
      UserSnapshot.findByIdAndUpdate(battle.opponentId, {
        $set: { rating: elo.playerB.newRating },
        $max: { peakRating: newOpponentPeak },
      }),
    ]);

    // 7. Persist Rating History audit records
    const historyEntries = await RatingHistory.create([
      {
        userId: battle.creatorId,
        battleId: battle._id,
        opponentId: battle.opponentId,
        opponentName: battle.opponentName,
        previousRating: creatorRating,
        newRating: elo.playerA.newRating,
        ratingChange: elo.playerA.ratingChange,
        opponentRatingBefore: opponentRating,
        opponentRatingAfter: elo.playerB.newRating,
        result: resultA,
        battleMode: battle.battleMode,
      },
      {
        userId: battle.opponentId,
        battleId: battle._id,
        opponentId: battle.creatorId,
        opponentName: battle.creatorName,
        previousRating: opponentRating,
        newRating: elo.playerB.newRating,
        ratingChange: elo.playerB.ratingChange,
        opponentRatingBefore: creatorRating,
        opponentRatingAfter: elo.playerA.newRating,
        result: resultB,
        battleMode: battle.battleMode,
      },
    ]);

    logger.info("BATTLE ELO SETTLED", {
      battleId: battle._id.toString(),
      creator: { id: battle.creatorId.toString(), change: elo.playerA.ratingChange, newRating: elo.playerA.newRating },
      opponent: { id: battle.opponentId.toString(), change: elo.playerB.ratingChange, newRating: elo.playerB.newRating },
    });

    // 8. Emit Realtime Rating Update Event
    const eventPayload = {
      battleId: battle._id.toString(),
      playerA: {
        userId: battle.creatorId.toString(),
        previousRating: creatorRating,
        newRating: elo.playerA.newRating,
        ratingChange: elo.playerA.ratingChange,
      },
      playerB: {
        userId: battle.opponentId.toString(),
        previousRating: opponentRating,
        newRating: elo.playerB.newRating,
        ratingChange: elo.playerB.ratingChange,
      },
    };

    emitRealtimeEvent({
      event: "battle:rating_updated",
      room: `battle:${battle._id.toString()}`,
      payload: eventPayload,
    });

    emitRealtimeEvent({
      event: "battle:rating_updated",
      room: `user:${battle.creatorId.toString()}`,
      payload: eventPayload,
    });

    emitRealtimeEvent({
      event: "battle:rating_updated",
      room: `user:${battle.opponentId.toString()}`,
      payload: eventPayload,
    });

    return {
      alreadySettled: false,
      settlements: historyEntries,
      elo,
    };
  }

  /**
   * Get competitive rating statistics for user profile.
   */
  async getRatingStats(userId: string) {
    const uid = new Types.ObjectId(userId);
    const user = await UserSnapshot.findById(userId).lean();

    const currentRating = (user as any)?.rating ?? DEFAULT_RATING;
    const peakRating = (user as any)?.peakRating ?? DEFAULT_RATING;

    const history = await RatingHistory.find({ userId: uid })
      .sort({ createdAt: -1 })
      .lean();

    const rankedBattles = history.length;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    let totalChange = 0;

    for (const h of history) {
      if (h.result === "WIN") wins++;
      else if (h.result === "LOSS") losses++;
      else draws++;
      totalChange += h.ratingChange;
    }

    const winRate =
      rankedBattles > 0 ? Number(((wins / rankedBattles) * 100).toFixed(1)) : 0;
    const avgRatingChange =
      rankedBattles > 0 ? Number((totalChange / rankedBattles).toFixed(1)) : 0;

    // Calculate ranked win streaks
    let currentStreak = 0;
    let bestStreak = 0;
    let tempStreak = 0;

    // History is descending (newest first)
    if (history.length > 0) {
      let countingCurrent = true;
      for (const h of history) {
        if (h.result === "WIN") {
          if (countingCurrent) currentStreak++;
          tempStreak++;
          if (tempStreak > bestStreak) bestStreak = tempStreak;
        } else {
          countingCurrent = false;
          tempStreak = 0;
        }
      }
    }

    const rank = await this.getUserRank(userId);

    return {
      rank,
      currentRating,
      peakRating,
      rankedBattles,
      wins,
      losses,
      draws,
      winRate,
      currentStreak,
      bestStreak,
      avgRatingChange,
    };
  }

  /**
   * Get 1-based global competitive rank for a user based on rating DESC, peakRating DESC, _id ASC.
   */
  async getUserRank(userId: string): Promise<number> {
    const user = await UserSnapshot.findById(userId).lean();
    if (!user || user.status === "disabled" || user.deletedAt) return 0;

    const rating = (user as any).rating ?? DEFAULT_RATING;
    const peakRating = (user as any).peakRating ?? DEFAULT_RATING;

    const higherCount = await UserSnapshot.countDocuments({
      status: "active",
      deletedAt: null,
      $or: [
        { rating: { $gt: rating } },
        { rating, peakRating: { $gt: peakRating } },
        { rating, peakRating, _id: { $lt: user._id } },
      ],
    });

    return higherCount + 1;
  }

  /**
   * Global Competitive Leaderboard (Paginated, deterministic ordering rating DESC, peakRating DESC, _id ASC).
   */
  async getLeaderboard(options: { page?: number; limit?: number } = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      UserSnapshot.find({ status: "active", deletedAt: null })
        .sort({ rating: -1, peakRating: -1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .select("_id name avatar role status rating peakRating")
        .lean(),
      UserSnapshot.countDocuments({ status: "active", deletedAt: null }),
    ]);

    const userIds = users.map((u) => u._id);

    // Batch aggregate ranked battle stats for page users (No N+1!)
    const statsAgg = await RatingHistory.aggregate([
      { $match: { userId: { $in: userIds } } },
      {
        $group: {
          _id: "$userId",
          rankedBattles: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ["$result", "WIN"] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $eq: ["$result", "LOSS"] }, 1, 0] } },
          draws: { $sum: { $cond: [{ $eq: ["$result", "DRAW"] }, 1, 0] } },
        },
      },
    ]);

    const statsMap = new Map<
      string,
      { rankedBattles: number; wins: number; losses: number; draws: number; winRate: number }
    >();

    for (const s of statsAgg) {
      const totalB = s.rankedBattles || 0;
      const wins = s.wins || 0;
      const winRate = totalB > 0 ? Number(((wins / totalB) * 100).toFixed(1)) : 0;
      statsMap.set(s._id.toString(), {
        rankedBattles: totalB,
        wins,
        losses: s.losses || 0,
        draws: s.draws || 0,
        winRate,
      });
    }

    const items = users.map((u, index) => {
      const rank = skip + index + 1;
      const userStats = statsMap.get(u._id.toString()) || {
        rankedBattles: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
      };

      return {
        rank,
        user: {
          id: u._id.toString(),
          name: u.name,
          avatar: u.avatar || "",
          role: u.role || "user",
        },
        rating: u.rating ?? DEFAULT_RATING,
        peakRating: u.peakRating ?? DEFAULT_RATING,
        ...userStats,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Get current user's competitive rank and stats.
   */
  async getMyLeaderboardRank(userId: string) {
    return this.getRatingStats(userId);
  }

  /**
   * Get paginated rating history for a user.
   */
  async getRatingHistory(
    userId: string,
    options: { page?: number; limit?: number } = {}
  ) {
    const uid = new Types.ObjectId(userId);
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      RatingHistory.find({ userId: uid })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RatingHistory.countDocuments({ userId: uid }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      history,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }
}

export const eloService = new EloService();
