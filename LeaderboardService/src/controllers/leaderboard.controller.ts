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

  async rebuild(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const actor = (req as any).user;
      const result = await this.leaderboardService.rebuildRedisLeaderboard();
      const { RankingAudit } = await import("../models/rankingAudit.model");
      await RankingAudit.create({
        actorId: actor?.userId,
        actorEmail: actor?.email,
        action: "leaderboard.rebuild",
        after: result,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Leaderboard rebuilt from MongoDB stats",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async resetUser(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const actor = (req as any).user;
      const userId = String(req.params.userId);
      const result = await this.leaderboardService.resetUserRanking(userId);
      const { RankingAudit } = await import("../models/rankingAudit.model");
      await RankingAudit.create({
        actorId: actor?.userId,
        actorEmail: actor?.email,
        action: "leaderboard.reset_user",
        userId,
        before: (result.before || undefined) as Record<string, unknown> | undefined,
        after: result.after as unknown as Record<string, unknown>,
        note: req.body?.note,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "User ranking reset",
        data: { userId, reset: true },
      });
    } catch (error) {
      next(error);
    }
  }

  async suspendEntry(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const actor = (req as any).user;
      const userId = String(req.params.userId);
      const suspended = req.body?.suspended !== false;
      const result = await this.leaderboardService.setRankingSuspended(
        userId,
        suspended
      );
      const { RankingAudit } = await import("../models/rankingAudit.model");
      await RankingAudit.create({
        actorId: actor?.userId,
        actorEmail: actor?.email,
        action: suspended
          ? "leaderboard.suspend_entry"
          : "leaderboard.unsuspend_entry",
        userId,
        before: (result.before || undefined) as Record<string, unknown> | undefined,
        after: result.after as unknown as Record<string, unknown>,
        note: req.body?.note,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: suspended
          ? "Ranking entry suspended"
          : "Ranking entry restored",
        data: { userId, rankingSuspended: suspended },
      });
    } catch (error) {
      next(error);
    }
  }

  async listAudit(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { RankingAudit } = await import("../models/rankingAudit.model");
      const [total, rows] = await Promise.all([
        RankingAudit.countDocuments({}),
        RankingAudit.find({})
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
      ]);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Ranking audit history",
        data: rows,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
