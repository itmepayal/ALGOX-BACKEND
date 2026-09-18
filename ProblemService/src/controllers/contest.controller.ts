import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { contestService } from "../services/contest.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";

export class ContestController {
  listPublic = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const data = await contestService.listPublicContests();
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contests retrieved",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  getBySlug = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const slug = String(req.params.slug);
      const data = await contestService.getPublicBySlug(
        slug,
        req.user?.userId
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contest retrieved",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  register = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const slug = String(req.params.slug);
      const userId = req.user!.userId;
      const data = await contestService.register(slug, userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Registered for contest",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  /** Own contest performance — real participant + leaderboard rows only. */
  mySummary = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }
      const data = await contestService.getMyContestSummary(userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contest summary retrieved",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  leaderboard = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const slug = String(req.params.slug);
      const data = await contestService.getPublicLeaderboard(
        slug,
        req.user?.userId,
        {
          page: req.query.page ? Number(req.query.page) : 1,
          limit: req.query.limit ? Number(req.query.limit) : 50,
        }
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contest leaderboard retrieved",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  /** Service-to-service: SubmissionService checks contest window before enqueue. */
  assertAllowsSubmission = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const { assertContestAllowsSubmission } = await import(
        "../utils/helpers/contestSubmission.helper"
      );
      const userId =
        typeof req.query.userId === "string"
          ? req.query.userId
          : (req.body?.userId as string | undefined);
      await assertContestAllowsSubmission(
        String(req.params.contestId),
        userId
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contest accepts submissions",
        data: { allowed: true },
      });
    } catch (e) {
      next(e);
    }
  };

  /** Service-to-service: Evaluation worker records ACCEPTED contest submissions. */
  recordAcceptedSubmission = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const contestId = String(req.params.contestId);
      const { submissionId, userId, problemId } = req.body || {};
      if (!submissionId || !userId || !problemId) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: "submissionId, userId, and problemId are required",
        });
        return;
      }
      const data = await contestService.recordAcceptedSubmission({
        contestId,
        submissionId: String(submissionId),
        userId: String(userId),
        problemId: String(problemId),
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Contest submission recorded",
        data,
      });
    } catch (e) {
      next(e);
    }
  };
}

export const contestController = new ContestController();
