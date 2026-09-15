import { UserStats, IUserStats } from "../models/userStats.model";
import { SolveEvent } from "../models/solveEvent.model";
import redis from "../config/redis.config";
import { Types } from "mongoose";

export type LeaderboardPeriod =
  | "global"
  | "daily"
  | "weekly"
  | "monthly"
  | "contest";

function periodWindow(period: "daily" | "weekly" | "monthly"): {
  from: Date;
  to: Date;
} {
  const to = new Date();
  const from = new Date(to);
  if (period === "daily") {
    from.setUTCHours(0, 0, 0, 0);
  } else if (period === "weekly") {
    const day = from.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    from.setUTCDate(from.getUTCDate() - diff);
    from.setUTCHours(0, 0, 0, 0);
  } else {
    from.setUTCDate(1);
    from.setUTCHours(0, 0, 0, 0);
  }
  return { from, to };
}

export class LeaderboardRepository {
  async getGlobalLeaderboard(page: number = 1, limit: number = 10) {
    const start = (page - 1) * limit;
    const stop = start + limit - 1;

    try {
      const rawRankings = (await redis.zrange("global_leaderboard", start, stop, {
        rev: true,
        withScores: true,
      })) as Array<string | number>;

      const total = await redis.zcard("global_leaderboard");

      if (rawRankings && rawRankings.length > 0) {
        const userIds: string[] = [];
        const userScoreMap = new Map<string, number>();

        for (let i = 0; i < rawRankings.length; i += 2) {
          const userId = String(rawRankings[i]);
          const score = Number(rawRankings[i + 1]);
          userIds.push(userId);
          userScoreMap.set(userId, score);
        }

        const statsList = await UserStats.find({ userId: { $in: userIds } });
        const statsMap = new Map<string, IUserStats>();
        statsList.forEach((stat) => {
          statsMap.set(stat.userId.toString(), stat);
        });

        const leaderboardData = userIds.map((userId, idx) => {
          const stats = statsMap.get(userId);
          return {
            rank: start + idx + 1,
            userId,
            userName: stats?.userName || "Anonymous",
            solvedEasy: stats?.solvedEasy || 0,
            solvedMedium: stats?.solvedMedium || 0,
            solvedHard: stats?.solvedHard || 0,
            totalSolved: stats?.totalSolved || 0,
            rating: stats?.rating || 1500,
            score: userScoreMap.get(userId) || 0,
          };
        });

        return {
          rankings: leaderboardData,
          total,
          page,
          totalPages: Math.ceil(total / limit),
        };
      }
    } catch {
    }

    const skip = (page - 1) * limit;
    const [rankings, total] = await Promise.all([
      UserStats.find({ rankingSuspended: { $ne: true } })
        .sort({ totalSolved: -1, rating: -1 })
        .skip(skip)
        .limit(limit),
      UserStats.countDocuments({ rankingSuspended: { $ne: true } }),
    ]);

    const formattedRankings = rankings.map((user: IUserStats, idx: number) => ({
      rank: skip + idx + 1,
      userId: user.userId.toString(),
      userName: user.userName,
      solvedEasy: user.solvedEasy,
      solvedMedium: user.solvedMedium,
      solvedHard: user.solvedHard,
      totalSolved: user.totalSolved,
      rating: user.rating,
      score:
        (user.solvedEasy || 0) * 10 +
        (user.solvedMedium || 0) * 20 +
        (user.solvedHard || 0) * 30 +
        (user.rating || 1500),
    }));

    return {
      rankings: formattedRankings,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Rank by SolveEvent counts in the period window.
   * Returns empty rankings (never invented ranks) when no events exist.
   */
  async getPeriodLeaderboard(
    period: "daily" | "weekly" | "monthly",
    page: number = 1,
    limit: number = 10
  ) {
    const { from, to } = periodWindow(period);
    const skip = (page - 1) * limit;

    const grouped = await SolveEvent.aggregate([
      { $match: { solvedAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: "$userId",
          totalSolved: { $sum: 1 },
          solvedEasy: {
            $sum: { $cond: [{ $eq: ["$difficulty", "easy"] }, 1, 0] },
          },
          solvedMedium: {
            $sum: { $cond: [{ $eq: ["$difficulty", "medium"] }, 1, 0] },
          },
          solvedHard: {
            $sum: { $cond: [{ $eq: ["$difficulty", "hard"] }, 1, 0] },
          },
        },
      },
      {
        $addFields: {
          score: {
            $add: [
              { $multiply: ["$solvedEasy", 10] },
              { $multiply: ["$solvedMedium", 20] },
              { $multiply: ["$solvedHard", 30] },
            ],
          },
        },
      },
      { $sort: { score: -1, totalSolved: -1, _id: 1 } },
    ]);

    if (!grouped.length) {
      return {
        rankings: [],
        total: 0,
        page,
        totalPages: 0,
        period,
        from: from.toISOString(),
        to: to.toISOString(),
      };
    }

    const total = grouped.length;
    const pageSlice = grouped.slice(skip, skip + limit);
    const userIds = pageSlice.map((r) => r._id);
    const statsList = await UserStats.find({ userId: { $in: userIds } });
    const statsMap = new Map(
      statsList.map((s) => [s.userId.toString(), s] as const)
    );

    const rankings = pageSlice.map((row, idx) => {
      const userId = String(row._id);
      const stats = statsMap.get(userId);
      return {
        rank: skip + idx + 1,
        userId,
        userName: stats?.userName || "Anonymous",
        solvedEasy: row.solvedEasy,
        solvedMedium: row.solvedMedium,
        solvedHard: row.solvedHard,
        totalSolved: row.totalSolved,
        rating: stats?.rating || 1500,
        score: row.score,
      };
    });

    return {
      rankings,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      period,
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }

  async recordSolveEvent(
    userId: string,
    difficulty: "easy" | "medium" | "hard",
    solvedAt: Date = new Date(),
    problemId?: string | null
  ) {
    if (!Types.ObjectId.isValid(userId)) return null;
    return SolveEvent.create({
      userId: new Types.ObjectId(userId),
      difficulty,
      solvedAt,
      ...(problemId ? { problemId: String(problemId) } : {}),
    });
  }

  /** True if this user already has a unique solve credit for the problem. */
  async hasSolvedProblem(userId: string, problemId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(userId) || !problemId) return false;
    const existing = await SolveEvent.exists({
      userId: new Types.ObjectId(userId),
      problemId: String(problemId),
    });
    return Boolean(existing);
  }

  async getUserStats(userId: string): Promise<(Record<string, any>) | null> {
    const stats = await UserStats.findOne({ userId });
    if (!stats) return null;

    try {
      const redisRank = await redis.zrevrank("global_leaderboard", userId);
      if (redisRank !== null && redisRank !== undefined) {
        return {
          ...stats.toObject(),
          globalRank: redisRank + 1,
        };
      }
    } catch {
    }

    return stats.toObject();
  }

  async upsertUserStats(
    userId: string,
    data: Partial<IUserStats>
  ): Promise<IUserStats> {
    const stats = await UserStats.findOneAndUpdate(
      { userId },
      { $set: data },
      { new: true, upsert: true }
    );

    try {
      const score =
        (stats.solvedEasy || 0) * 10 +
        (stats.solvedMedium || 0) * 20 +
        (stats.solvedHard || 0) * 30 +
        (stats.rating || 1500);

      await redis.zadd("global_leaderboard", {
        score,
        member: userId,
      });
    } catch {
    }

    return stats;
  }
}
