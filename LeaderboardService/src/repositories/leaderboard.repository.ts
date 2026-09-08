import { UserStats, IUserStats } from "../models/userStats.model";
import redis from "../config/redis.config";

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
      UserStats.find().sort({ totalSolved: -1, rating: -1 }).skip(skip).limit(limit),
      UserStats.countDocuments(),
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
