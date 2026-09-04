import { UserStats, IUserStats } from "../models/userStats.model";

export class LeaderboardRepository {
  async getGlobalLeaderboard(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [rankings, total] = await Promise.all([
      UserStats.find().sort({ totalSolved: -1, rating: -1 }).skip(skip).limit(limit),
      UserStats.countDocuments(),
    ]);

    return {
      rankings,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserStats(userId: string): Promise<IUserStats | null> {
    return await UserStats.findOne({ userId });
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
    return stats;
  }
}
