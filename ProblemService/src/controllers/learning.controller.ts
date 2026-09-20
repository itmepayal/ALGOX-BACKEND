import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { learningService } from "../services/learning.service";
import {
  dailyGoalsSchema,
  dailyPlanSchema,
  startSessionSchema,
  sessionActivitySchema,
  sessionActivityInternalSchema,
} from "../validators/learning.validator";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";

function requireUserId(req: AuthenticatedRequest): string {
  const id = req.user?.userId;
  if (!id) throw new UnauthorizedError("Authentication required");
  return id;
}

export class LearningController {
  async getGoals(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await learningService.getGoals(requireUserId(req));
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Learning goals retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async putGoals(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = dailyGoalsSchema.parse(req.body);
      const data = await learningService.putGoals(requireUserId(req), body);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Learning goals saved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async getPlan(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const dateKey = String(req.params.dateKey || "");
      const data = await learningService.getPlan(requireUserId(req), dateKey);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Daily plan retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async listPlans(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const from = String(req.query.from || "");
      const to = String(req.query.to || "");
      const data = await learningService.listPlansInRange(
        requireUserId(req),
        from,
        to
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Daily plans retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async putPlan(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const dateKey = String(req.params.dateKey || "");
      const body = dailyPlanSchema.parse({ ...req.body, date: dateKey });
      const data = await learningService.putPlan(requireUserId(req), body);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Daily plan saved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async listSessions(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const data = await learningService.listSessions(requireUserId(req), {
        limit,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Study sessions retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async getActive(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const data = await learningService.getActiveSession(requireUserId(req));
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Active study session retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async startSession(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const body = startSessionSchema.parse(req.body || {});
      const data = await learningService.startSession(
        requireUserId(req),
        body.topic
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Study session started",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async pauseSession(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const data = await learningService.pauseSession(requireUserId(req));
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Study session paused",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async resumeSession(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const data = await learningService.resumeSession(requireUserId(req));
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Study session resumed",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async endSession(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const data = await learningService.endSession(requireUserId(req));
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Study session ended",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async recordActivity(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const body = sessionActivitySchema.parse(req.body);
      const data = await learningService.recordActivity(
        requireUserId(req),
        body.problemId,
        Boolean(body.solved)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Study session activity recorded",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * S2S: Evaluation worker records attempt/ACCEPTED against the user's active
   * study session (no-op when none). Idempotent via Set semantics on problem IDs.
   */
  async recordActivityInternal(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const body = sessionActivityInternalSchema.parse(req.body);
      const data = await learningService.recordActivity(
        body.userId,
        body.problemId,
        Boolean(body.solved)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data
          ? "Study session activity recorded"
          : "No active study session",
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const learningController = new LearningController();
