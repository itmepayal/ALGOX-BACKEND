import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { ISuspiciousSubmissionService } from "../services/suspiciousSubmission.service";
import {
  suspiciousListQuerySchema,
  suspiciousReviewBodySchema,
} from "../validators/suspiciousSubmission.validator";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";

export class SuspiciousSubmissionController {
  constructor(private service: ISuspiciousSubmissionService) {}

  private actorFrom(req: AuthenticatedRequest) {
    if (!req.user?.userId) throw new UnauthorizedError("Authentication required");
    return {
      userId: req.user.userId,
      email: req.user.email,
      authorizationHeader: req.headers.authorization,
      ip: req.ip,
      userAgent: req.get("user-agent") || undefined,
    };
  }

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const q = suspiciousListQuerySchema.parse(req.query);
      const result = await this.service.list({
        page: q.page,
        limit: q.limit,
        status: q.status,
        severity: q.severity,
        userId: q.userId,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Suspicious submissions retrieved",
        data: result.items,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const row = await this.service.getById(String(req.params.id));
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Suspicious submission retrieved",
        data: row,
      });
    } catch (err) {
      next(err);
    }
  }

  async markReviewing(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const body = suspiciousReviewBodySchema.parse(req.body || {});
      const row = await this.service.markReviewing(
        String(req.params.id),
        this.actorFrom(req),
        body.resolution
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Marked as REVIEWING",
        data: row,
      });
    } catch (err) {
      next(err);
    }
  }

  async confirm(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = suspiciousReviewBodySchema.parse(req.body || {});
      const row = await this.service.confirm(
        String(req.params.id),
        this.actorFrom(req),
        body.resolution
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Suspicious submission confirmed (no auto-ban)",
        data: row,
      });
    } catch (err) {
      next(err);
    }
  }

  async dismiss(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = suspiciousReviewBodySchema.parse(req.body || {});
      const row = await this.service.dismiss(
        String(req.params.id),
        this.actorFrom(req),
        body.resolution
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Suspicious submission dismissed",
        data: row,
      });
    } catch (err) {
      next(err);
    }
  }
}
