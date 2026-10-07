import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { teamBattleService } from "../services/teamBattle.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError, BadRequestError } from "../utils/errors/app.error";

function requireUserId(req: AuthenticatedRequest): string {
  const id = req.user?.userId;
  if (!id) throw new UnauthorizedError("Authentication required");
  return id;
}

export class TeamBattleController {
  async challengeTeam(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { teamAId, teamBId, durationSeconds } = req.body || {};
      if (!teamAId || !teamBId) {
        throw new BadRequestError("teamAId and teamBId are required");
      }
      const data = await teamBattleService.challengeTeam(userId, teamAId, teamBId, durationSeconds);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Team battle challenge issued successfully",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async acceptBattle(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { id: battleId } = req.params;
      const data = await teamBattleService.acceptBattle(userId, battleId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Team battle challenge accepted",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async selectParticipants(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { id: battleId } = req.params;
      const { teamId, participantUserIds } = req.body || {};
      if (!teamId || !Array.isArray(participantUserIds)) {
        throw new BadRequestError("teamId and participantUserIds array are required");
      }
      const data = await teamBattleService.selectParticipants(userId, battleId, teamId, participantUserIds);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Team battle roster updated",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async startBattle(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { id: battleId } = req.params;
      const data = await teamBattleService.startBattle(userId, battleId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Team battle started",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async finishBattle(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id: battleId } = req.params;
      const data = await teamBattleService.finishBattle(battleId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Team battle completed and ratings updated",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async getBattleById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id: battleId } = req.params;
      const data = await teamBattleService.getBattleById(battleId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Team battle details retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async cancelBattle(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const { id: battleId } = req.params;
      const data = await teamBattleService.cancelBattle(userId, battleId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Team battle cancelled",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async recordSubmission(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id: battleId } = req.params;
      const { userId, problemId, submissionId, status, points } = req.body || {};
      if (!userId || !problemId || !submissionId || !status) {
        throw new BadRequestError("userId, problemId, submissionId, and status are required");
      }
      await teamBattleService.recordSubmissionVerdict(battleId, {
        userId,
        problemId,
        submissionId,
        status,
        points,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Team battle submission verdict recorded",
      });
    } catch (err) {
      next(err);
    }
  }

  async getLeaderboard(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const data = await teamBattleService.getTeamLeaderboard(page, limit);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Team leaderboard retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const teamBattleController = new TeamBattleController();
