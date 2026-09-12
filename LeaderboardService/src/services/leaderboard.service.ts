import { LeaderboardRepository } from "../repositories/leaderboard.repository";
import { NotFoundError, BadRequestError } from "../utils/errors/app.error";
import redis from "../config/redis.config";

const PERIODS = new Set(["global", "daily", "weekly", "monthly", "contest"]);

export class LeaderboardService {
  private CACHE_TTL_SECONDS = 15;

  constructor(private leaderboardRepository: LeaderboardRepository) {}

  async getLeaderboard(
    page: number,
    limit: number,
    period: string = "global"
  ) {
    const normalized = String(period || "global").toLowerCase();
    if (!PERIODS.has(normalized)) {
      throw new BadRequestError(
        "Invalid period. Use global|daily|weekly|monthly|contest"
      );
    }

    if (normalized === "contest") {
      return {
        rankings: [],
        total: 0,
        page,
        totalPages: 0,
        period: "contest",
        message:
          "Contest leaderboards are served by ProblemService contest APIs until ContestLeaderboard is wired here.",
      };
    }

    if (normalized === "global") {
      return this.getGlobalLeaderboard(page, limit);
    }

    const cacheKey = `leaderboard_page:${normalized}:${page}:limit:${limit}`;
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return typeof cachedData === "string"
          ? JSON.parse(cachedData)
          : cachedData;
      }
    } catch {
    }

    const result = await this.leaderboardRepository.getPeriodLeaderboard(
      normalized as "daily" | "weekly" | "monthly",
      page,
      limit
    );

    try {
      await redis.set(cacheKey, JSON.stringify(result), {
        ex: this.CACHE_TTL_SECONDS,
      });
    } catch {
    }

    return result;
  }

  async getGlobalLeaderboard(page: number, limit: number) {
    const cacheKey = `leaderboard_page:${page}:limit:${limit}`;

    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return typeof cachedData === "string" ? JSON.parse(cachedData) : cachedData;
      }
    } catch {
    }

    const result = await this.leaderboardRepository.getGlobalLeaderboard(page, limit);

    try {
      await redis.set(cacheKey, JSON.stringify(result), {
        ex: this.CACHE_TTL_SECONDS,
      });
    } catch {
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

    // Period boards: append SolveEvent for daily/weekly/monthly windows
    try {
      await this.leaderboardRepository.recordSolveEvent(userId, difficulty);
    } catch {
      // Non-blocking — global stats already updated
    }

    try {
      await redis.del("leaderboard_page:1:limit:10");
      await redis.del("leaderboard_page:daily:1:limit:10");
      await redis.del("leaderboard_page:weekly:1:limit:10");
      await redis.del("leaderboard_page:monthly:1:limit:10");
    } catch {
    }

    return stats;
  }
}
