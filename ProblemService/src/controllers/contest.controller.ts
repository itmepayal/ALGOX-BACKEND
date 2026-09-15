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
      await assertContestAllowsSubmission(String(req.params.contestId));
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
}

export const contestController = new ContestController();
