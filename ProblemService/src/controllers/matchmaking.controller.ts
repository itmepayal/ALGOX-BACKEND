import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { matchmakingService } from "../services/matchmaking.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";

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

export class MatchmakingController {
  joinQueue = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const { difficulty, topic, battleMode } = req.body || {};
      const result = await matchmakingService.joinQueue(user, {
        difficulty,
        topic,
        battleMode,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message:
          result.status === "MATCHED"
            ? "Opponent matched! Battle created."
            : "Joined matchmaking queue. Searching for opponent...",
        data: result,
      });
    } catch (e) {
      next(e);
    }
  };

  cancelQueue = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const result = await matchmakingService.cancelQueue(user.id);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Matchmaking queue search cancelled",
        data: result,
      });
    } catch (e) {
      next(e);
    }
  };

  getStatus = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = requireUser(req);
      const result = await matchmakingService.getStatus(user.id);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Matchmaking status retrieved",
        data: result,
      });
    } catch (e) {
      next(e);
    }
  };
}

export const matchmakingController = new MatchmakingController();
