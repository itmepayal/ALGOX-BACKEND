import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { battleService } from "../services/battle.service";
import { eloService } from "../services/elo.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { BadRequestError, UnauthorizedError } from "../utils/errors/app.error";

function requireUser(req: AuthenticatedRequest) {
  if (!req.user?.userId) {
    throw new UnauthorizedError("Authentication required");
  }
  const email = req.user.email || "";
  const name = email ? email.split("@")[0] : "Student";
  return {
    id: req.user.userId,
    name,
    email,
  };
}

export class BattleController {
  searchStudents = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const query = String(req.query.q || req.query.query || "");
      const students = await battleService.searchStudents(query, user.id);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Students search results",
        data: students,
      });
    } catch (e) {
      next(e);
    }
  };

  createChallenge = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const { opponentId, difficulty, problemCount, durationSeconds } = req.body || {};
      const battle = await battleService.createChallenge(user, {
        opponentId,
        difficulty,
        problemCount,
        durationSeconds,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Battle challenge created",
        data: battle,
      });
    } catch (e) {
      next(e);
    }
  };

  acceptChallenge = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const battleId = String(req.params.id);
      const battle = await battleService.acceptChallenge(battleId, user.id);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Battle challenge accepted",
        data: battle,
      });
    } catch (e) {
      next(e);
    }
  };

  declineChallenge = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const battleId = String(req.params.id);
      const battle = await battleService.declineChallenge(battleId, user.id);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Battle challenge declined",
        data: battle,
      });
    } catch (e) {
      next(e);
    }
  };

  cancelChallenge = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const battleId = String(req.params.id);
      const battle = await battleService.cancelChallenge(battleId, user.id);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Battle challenge cancelled",
        data: battle,
      });
    } catch (e) {
      next(e);
    }
  };

  joinLobby = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const battleId = String(req.params.id);
      const result = await battleService.joinLobby(battleId, user.id);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Joined battle lobby",
        data: result,
      });
    } catch (e) {
      next(e);
    }
  };

  setReady = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const battleId = String(req.params.id);
      const isReady = req.body?.isReady !== false;
      const result = await battleService.setReady(battleId, user.id, isReady);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Battle ready state updated",
        data: result,
      });
    } catch (e) {
      next(e);
    }
  };

  getBattleProblems = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const battleId = String(req.params.id);
      const problems = await battleService.getBattleProblems(battleId, user.id);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Battle problems retrieved",
        data: problems,
      });
    } catch (e) {
      next(e);
    }
  };

  getBattleById = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const battleId = String(req.params.id);
      const battle = await battleService.getBattleById(battleId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Battle details",
        data: battle,
      });
    } catch (e) {
      next(e);
    }
  };

  getBattleResult = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const battleId = String(req.params.id);
      const result = await battleService.getBattleResult(battleId, user.id);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Battle result",
        data: result,
      });
    } catch (e) {
      next(e);
    }
  };

  getBattleStats = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const stats = await battleService.getBattleStats(user.id);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Battle statistics retrieved",
        data: stats,
      });
    } catch (e) {
      next(e);
    }
  };

  getMyBattles = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const filter = req.query.filter
        ? String(req.query.filter)
        : String(req.query.status || "all");

      const result = await battleService.getMyBattles(user.id, {
        page,
        limit,
        filter,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "User battles retrieved",
        data: {
          incoming: result.incoming,
          active: result.active,
          history: result.history,
          pagination: result.pagination,
        },
        meta: result.pagination,
      });
    } catch (e) {
      next(e);
    }
  };

  forfeitBattle = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const battleId = String(req.params.id);
      const battle = await battleService.forfeitBattle(battleId, user.id);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Battle forfeited",
        data: battle,
      });
    } catch (e) {
      next(e);
    }
  };

  recordSubmission = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { battleId } = req.params;
      const { userId, problemId, submissionId, status, executionTimeMs, memoryMb } =
        req.body || {};

      if (!userId || !problemId || !submissionId || !status) {
        throw new BadRequestError(
          "userId, problemId, submissionId, and status are required"
        );
      }

      await battleService.recordSubmissionVerdict(String(battleId), {
        userId: String(userId),
        problemId: String(problemId),
        submissionId: String(submissionId),
        status: String(status),
        executionTimeMs,
        memoryMb,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Battle submission verdict recorded",
      });
    } catch (e) {
      next(e);
    }
  };

  getRatingStats = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const stats = await eloService.getRatingStats(user.id);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Competitive rating statistics retrieved",
        data: stats,
      });
    } catch (e) {
      next(e);
    }
  };

  getRatingHistory = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const result = await eloService.getRatingHistory(user.id, {
        page,
        limit,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Competitive rating history retrieved",
        data: result,
        meta: result.pagination,
      });
    } catch (e) {
      next(e);
    }
  };

  getLeaderboard = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      requireUser(req);
      const page = req.query.page ? Number(req.query.page) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;

      const result = await eloService.getLeaderboard({ page, limit });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Competitive leaderboard retrieved successfully",
        data: result.items,
        meta: result.pagination,
      });
    } catch (e) {
      next(e);
    }
  };

  getMyRank = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const result = await eloService.getMyLeaderboardRank(user.id);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "My competitive rank retrieved successfully",
        data: result,
      });
    } catch (e) {
      next(e);
    }
  };
}

export const battleController = new BattleController();
