import { UserStats, IUserStats } from "../models/userStats.model";
import redis from "../config/redis.config";

export class LeaderboardRepository {
  async getGlobalLeaderboard(page: number = 1, limit: number = 10) {
    const start = (page - 1) * limit;
    const stop = start + limit - 1;

    try {
      // Fetch top user IDs and scores from Redis Sorted Set (ZSET)
      const rawRankings = (await redis.zrange("global_leaderboard", start, stop, {
        rev: true,
        withScores: true,
      })) as Array<string | number>;

      const total = await redis.zcard("global_leaderboard");

      if (rawRankings && rawRankings.length > 0) {
        const leaderboardData = [];
        for (let i = 0; i < rawRankings.length; i += 2) {
          const userId = String(rawRankings[i]);
          const score = Number(rawRankings[i + 1]);
          const stats = await UserStats.findOne({ userId });

          leaderboardData.push({
            rank: start + Math.floor(i / 2) + 1,
            userId,
            userName: stats?.userName || "Anonymous",
            solvedEasy: stats?.solvedEasy || 0,
            solvedMedium: stats?.solvedMedium || 0,
            solvedHard: stats?.solvedHard || 0,
            totalSolved: stats?.totalSolved || 0,
            rating: stats?.rating || 1500,
            score,
          });
        }

        return {
          rankings: leaderboardData,
          total,
          page,
          totalPages: Math.ceil(total / limit),
        };
      }
    } catch {
      // Fallback to MongoDB query if Redis fails or is unpopulated
    }

    const skip = (page - 1) * limit;
    const [rankings, total] = await Promise.all([
      UserStats.find().sort({ totalSolved: -1, rating: -1 }).skip(skip).limit(limit),
      UserStats.countDocuments(),
    ]);

    const formattedRankings = rankings.map((user, idx) => ({
      rank: skip + idx + 1,
      userId: user.userId.toString(),
      userName: user.userName,
      solvedEasy: user.solvedEasy,
      solvedMedium: user.solvedMedium,
      solvedHard: user.solvedHard,
      totalSolved: user.totalSolved,
      rating: user.rating,
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
      // Fallback
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

    // Update Redis Sorted Set for sub-millisecond ranking
    try {
      const score = (data.totalSolved || 0) * 10 + (data.rating || 1500);
      await redis.zadd("global_leaderboard", {
        score,
        member: userId,
      });
    } catch {
      // Non-blocking catch
    }

    return stats;
  }
}
