import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { srsService } from "../services/srs.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";

function requireUserId(req: AuthenticatedRequest): string {
  const id = req.user?.userId;
  if (!id) {
    const err: any = new Error("Authentication required");
    err.statusCode = 401;
    throw err;
  }
  return id;
}

function authHeader(req: AuthenticatedRequest) {
  return typeof req.headers.authorization === "string"
    ? req.headers.authorization
    : null;
}

export class SrsController {
  queue = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = requireUserId(req);
      const data = await srsService.getQueue(userId, authHeader(req), {
        bucket: req.query.bucket ? String(req.query.bucket) : undefined,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Revision queue retrieved",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  enroll = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = requireUserId(req);
      const problemId = String(req.params.problemId || req.body?.problemId || "");
      const data = await srsService.enroll(
        userId,
        problemId,
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.created ? "Revision card created" : "Revision card updated",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  syncFromSolved = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = requireUserId(req);
      const problemIds = Array.isArray(req.body?.problemIds)
        ? req.body.problemIds.map((id: unknown) => String(id || ""))
        : undefined;
      const data = await srsService.syncFromSolved(userId, authHeader(req), {
        problemIds,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Revision cards synced from solved problems",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  importCandidates = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = requireUserId(req);
      const data = await srsService.listImportCandidates(
        userId,
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Import candidates retrieved",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  review = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = requireUserId(req);
      const problemId = String(req.params.problemId || "");
      // Client timestamps are ignored for scheduling
      const { feedback } = req.body || {};
      const data = await srsService.review(
        userId,
        problemId,
        feedback,
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Review recorded",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  reschedule = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = requireUserId(req);
      const problemId = String(req.params.problemId || "");
      const data = await srsService.reschedule(
        userId,
        problemId,
        {
          nextReviewAt: req.body?.nextReviewAt,
          delayDays: req.body?.delayDays,
        },
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Review rescheduled",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  setStatus = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = requireUserId(req);
      const problemId = String(req.params.problemId || "");
      const data = await srsService.setStatus(
        userId,
        problemId,
        req.body?.status,
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Revision status updated",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  getTimezone = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = requireUserId(req);
      const timezone = await srsService.getTimezone(userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Timezone retrieved",
        data: { timezone },
      });
    } catch (e) {
      next(e);
    }
  };

  setTimezone = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = requireUserId(req);
      const data = await srsService.setTimezone(
        userId,
        String(req.body?.timezone || "")
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Timezone updated",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  /** S2S: Evaluation worker seeds card on ACCEPTED official submit. */
  seedOnSolveInternal = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { userId, problemId, difficulty } = req.body || {};
      if (!userId || !problemId) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "userId and problemId are required",
        });
        return;
      }
      const data = await srsService.seedOnSolve({
        userId: String(userId),
        problemId: String(problemId),
        difficulty: difficulty ? String(difficulty) : undefined,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.created ? "SRS card seeded" : "SRS card already existed",
        data,
      });
    } catch (e) {
      next(e);
    }
  };
}

export const srsController = new SrsController();
