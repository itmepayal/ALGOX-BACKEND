import { LeaderboardRepository } from "../repositories/leaderboard.repository";
import { NotFoundError } from "../utils/errors/app.error";
import redis from "../config/redis.config";

export class LeaderboardService {
  private CACHE_TTL_SECONDS = 15;

  constructor(private leaderboardRepository: LeaderboardRepository) {}

  async getGlobalLeaderboard(page: number, limit: number) {
    const cacheKey = `leaderboard_page:${page}:limit:${limit}`;

    // Fix 4: Pagination & Short-TTL Caching of Leaderboard Responses
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return typeof cachedData === "string" ? JSON.parse(cachedData) : cachedData;
      }
    } catch {
      // Cache miss or error, fallback to repository
    }

    const result = await this.leaderboardRepository.getGlobalLeaderboard(page, limit);

    try {
      await redis.set(cacheKey, JSON.stringify(result), {
        ex: this.CACHE_TTL_SECONDS,
      });
    } catch {
      // Non-blocking catch
    }

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

    // Invalidate top page cache on updates so users see fresh data quickly
    try {
      await redis.del("leaderboard_page:1:limit:10");
    } catch {
      // Non-blocking
    }

    return stats;
  }
}

