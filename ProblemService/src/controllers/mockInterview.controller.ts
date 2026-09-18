import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { mockInterviewService } from "../services/mockInterview.service";
import {
  attachSubmissionSchema,
  recordInterviewSubmissionSchema,
  startMockInterviewSchema,
} from "../validators/mockInterview.validator";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError, BadRequestError } from "../utils/errors/app.error";

function requireUserId(req: AuthenticatedRequest): string {
  const id = req.user?.userId;
  if (!id) throw new UnauthorizedError("Authentication required");
  return id;
}

function authHeader(req: AuthenticatedRequest): string | null {
  const h = req.headers.authorization;
  return typeof h === "string" ? h : null;
}

export class MockInterviewController {
  async start(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      // Reject client timer spoof fields
      if (
        req.body?.startedAt !== undefined ||
        req.body?.endsAt !== undefined ||
        req.body?.remainingMs !== undefined ||
        req.body?.report !== undefined
      ) {
        throw new BadRequestError(
          "Client timer/result fields are not accepted; server assigns interview window"
        );
      }
      const body = startMockInterviewSchema.parse(req.body || {});
      const data = await mockInterviewService.start(
        requireUserId(req),
        body,
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED || 201,
        message: "Mock interview started",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async active(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await mockInterviewService.getActive(
        requireUserId(req),
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data ? "Active mock interview" : "No active mock interview",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const limit = Number(req.query.limit) || 20;
      const data = await mockInterviewService.listMine(
        requireUserId(req),
        authHeader(req),
        limit
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Mock interviews retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await mockInterviewService.getById(
        String(req.params.sessionId),
        requireUserId(req),
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Mock interview retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async attachSubmission(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (req.body?.status !== undefined || req.body?.testCasesPassed !== undefined) {
        throw new BadRequestError(
          "Judge result fields are not accepted from client; attach a real submissionId"
        );
      }
      const body = attachSubmissionSchema.parse(req.body);
      const data = await mockInterviewService.attachSubmission(
        String(req.params.sessionId),
        requireUserId(req),
        body.problemId,
        body.submissionId,
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Submission attached to interview",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async complete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await mockInterviewService.complete(
        String(req.params.sessionId),
        requireUserId(req),
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Mock interview completed",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async report(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await mockInterviewService.getReport(
        String(req.params.sessionId),
        requireUserId(req),
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Interview report retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async abandon(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await mockInterviewService.abandon(
        String(req.params.sessionId),
        requireUserId(req),
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Mock interview abandoned",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async allowsSubmission(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const userId =
        typeof req.query.userId === "string" ? req.query.userId : undefined;
      const data = await mockInterviewService.assertAllowsSubmission(
        String(req.params.sessionId),
        userId
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Mock interview accepts submissions",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async recordSubmission(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const body = recordInterviewSubmissionSchema.parse(req.body);
      const data = await mockInterviewService.recordInternal(
        String(req.params.sessionId),
        body
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Interview submission recorded",
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const mockInterviewController = new MockInterviewController();
