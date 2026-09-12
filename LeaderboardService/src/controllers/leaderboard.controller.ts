import { Request, Response, NextFunction } from "express";
import { LeaderboardService } from "../services/leaderboard.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS, LEADERBOARD_MESSAGES } from "../utils/constants";

export class LeaderboardController {
  constructor(private leaderboardService: LeaderboardService) {}

  async getGlobalLeaderboard(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;
      const period = String(req.query.period || "global");
      const result = await this.leaderboardService.getLeaderboard(
        page,
        limit,
        period
      );

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message:
          period === "global"
            ? LEADERBOARD_MESSAGES.LEADERBOARD_RETRIEVED
            : `Leaderboard retrieved (${period})`,
        data: result.rankings,
        meta: {
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
          period: result.period || period,
          ...(result.from ? { from: result.from } : {}),
          ...(result.to ? { to: result.to } : {}),
          ...(result.message ? { message: result.message } : {}),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = String(req.params.userId);
      const stats = await this.leaderboardService.getUserStats(userId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: LEADERBOARD_MESSAGES.USER_STATS_RETRIEVED,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  async recordSolvedProblem(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId, userName, userEmail, difficulty } = req.body;
      const stats = await this.leaderboardService.recordSolvedProblem(
        userId,
        userName,
        userEmail,
        difficulty
      );

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: LEADERBOARD_MESSAGES.STATS_UPDATED,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
}
