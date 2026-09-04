import { LeaderboardRepository } from "../repositories/leaderboard.repository";
import { NotFoundError } from "../utils/errors/app.error";
import { LEADERBOARD_MESSAGES } from "../utils/constants";
import redis from "../config/redis.config";

export class LeaderboardService {
  constructor(private leaderboardRepository: LeaderboardRepository) {}

  async getGlobalLeaderboard(page: number, limit: number) {
    const result = await this.leaderboardRepository.getGlobalLeaderboard(page, limit);
    return result;
  }

  async getUserStats(userId: string) {
    const stats = await this.leaderboardRepository.getUserStats(userId);
    if (!stats) {
      throw new NotFoundError("User stats not found");
    }
    return stats;
  }

  async recordSolvedProblem(
    userId: string,
    userName: string,
    userEmail: string,
    difficulty: "easy" | "medium" | "hard"
  ) {
    const existing = await this.leaderboardRepository.getUserStats(userId);
    const solvedEasy = (existing?.solvedEasy || 0) + (difficulty === "easy" ? 1 : 0);
    const solvedMedium = (existing?.solvedMedium || 0) + (difficulty === "medium" ? 1 : 0);
    const solvedHard = (existing?.solvedHard || 0) + (difficulty === "hard" ? 1 : 0);
    const totalSolved = solvedEasy + solvedMedium + solvedHard;

    const stats = await this.leaderboardRepository.upsertUserStats(userId, {
      userName,
      userEmail,
      solvedEasy,
      solvedMedium,
      solvedHard,
      totalSolved,
    });

    // Update Redis Leaderboard Sorted Set
    await redis.zadd("global_leaderboard", {
      score: totalSolved,
      member: userId,
    });

    return stats;
  }
}
