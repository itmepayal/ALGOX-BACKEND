import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { virtualContestService } from "../services/virtualContest.service";
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

export class VirtualContestController {
  start = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await virtualContestService.start(
        requireUserId(req),
        {
          contestSlug: String(req.body?.contestSlug || ""),
          mode: req.body?.mode,
        },
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Virtual contest started",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  active = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await virtualContestService.getActive(
        requireUserId(req),
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data ? "Active virtual contest" : "No active virtual contest",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  getById = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await virtualContestService.getById(
        requireUserId(req),
        String(req.params.sessionId),
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Virtual contest session",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  complete = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await virtualContestService.complete(
        requireUserId(req),
        String(req.params.sessionId),
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Virtual contest completed",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  abandon = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await virtualContestService.abandon(
        requireUserId(req),
        String(req.params.sessionId),
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Virtual contest abandoned",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  analytics = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await virtualContestService.analytics(
        requireUserId(req),
        String(req.params.sessionId),
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Virtual contest analytics",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  allowsSubmission = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId =
        typeof req.query.userId === "string" ? req.query.userId : undefined;
      const problemId =
        typeof req.query.problemId === "string" ? req.query.problemId : undefined;
      const data = await virtualContestService.assertAllowsSubmission(
        String(req.params.sessionId),
        userId,
        problemId
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Virtual contest accepts submissions",
        data,
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
      const {
        submissionId,
        userId,
        problemId,
        status,
        testCasesPassed,
        totalTestCases,
      } = req.body || {};
      if (!submissionId || !userId || !problemId || !status) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "submissionId, userId, problemId, and status are required",
        });
        return;
      }
      const data = await virtualContestService.recordSubmission({
        sessionId: String(req.params.sessionId),
        submissionId: String(submissionId),
        userId: String(userId),
        problemId: String(problemId),
        status: String(status),
        testCasesPassed,
        totalTestCases,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Virtual contest submission recorded",
        data,
      });
    } catch (e) {
      next(e);
    }
  };
}

export const virtualContestController = new VirtualContestController();
