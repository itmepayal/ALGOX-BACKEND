import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { aiReviewService } from "../services/aiReview.service";
import { aiCodeReviewRequestSchema } from "../validators/ai.validator";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";

function requireUserId(req: AuthenticatedRequest): string {
  const id = req.user?.userId;
  if (!id) throw new UnauthorizedError("Authentication required");
  return id;
}

function authHeader(req: AuthenticatedRequest): string | null {
  const h = req.headers.authorization;
  return typeof h === "string" ? h : null;
}

export class AiReviewController {
  /**
   * POST /api/v1/ai/review
   * Generates or retrieves an AI Code Review for a given submission.
   */
  async generateReview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = aiCodeReviewRequestSchema.parse(req.body || {});
      const userId = requireUserId(req);
      const data = await aiReviewService.generateCodeReview(
        userId,
        body.submissionId,
        body.refresh,
        authHeader(req)
      );

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.cached ? "Retrieved stored AI Code Review" : "AI Code Review generated successfully",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/ai/review/:submissionId
   * Retrieves existing stored AI Code Review for a submission.
   */
  async getExistingReview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { submissionId } = req.params;
      const userId = requireUserId(req);
      const data = await aiReviewService.getExistingReview(userId, submissionId);

      if (!data) {
        sendResponse({
          res,
          statusCode: HTTP_STATUS.NOT_FOUND,
          message: "No existing AI Code Review found for this submission",
          data: null,
        });
        return;
      }

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "AI Code Review retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}


export const aiReviewController = new AiReviewController();
