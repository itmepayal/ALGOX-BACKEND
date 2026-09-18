import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { challengeService } from "../services/challenge.service";
import {
  adminChallengeSchema,
  completeChallengeSchema,
  internalQualifySchema,
  streakGoalsSchema,
  timezoneSchema,
} from "../validators/challenge.validator";
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

export class ChallengeController {
  async getToday(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await challengeService.getTodayForUser(
        req.user?.userId || null,
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Daily challenge retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async getByDate(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const dateKey = String(req.params.dateKey || "");
      const data = await challengeService.getByDateKey(
        dateKey,
        req.user?.userId || null,
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Challenge retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async history(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const from = String(req.query.from || "");
      const to = String(req.query.to || "");
      const data = await challengeService.listHistory(
        from,
        to,
        req.user?.userId || null,
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Challenge history retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async complete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      // Reject spoofed date / timestamp fields before parsing
      if (
        req.body?.dateKey !== undefined ||
        req.body?.completedAt !== undefined ||
        req.body?.timezone !== undefined
      ) {
        throw new BadRequestError(
          "Client dateKey/completedAt/timezone are not accepted; server assigns qualifying day"
        );
      }
      const body = completeChallengeSchema.parse(req.body || {});
      const data = await challengeService.completeToday(
        requireUserId(req),
        authHeader(req),
        { submissionId: body.submissionId }
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.duplicate
          ? "Challenge already completed today"
          : "Daily challenge completed",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async streak(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await challengeService.getStreakView(requireUserId(req));
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Streak retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async setTimezone(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const body = timezoneSchema.parse(req.body);
      const data = await challengeService.setTimezone(
        requireUserId(req),
        body.timezone
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Timezone updated",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async setGoals(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = streakGoalsSchema.parse(req.body);
      const data = await challengeService.setGoals(requireUserId(req), body);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Goals updated",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async freeze(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await challengeService.useFreeze(
        requireUserId(req),
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Streak freeze applied",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async calendar(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const from = String(req.query.from || "");
      const to = String(req.query.to || "");
      const data = await challengeService.getCalendar(
        requireUserId(req),
        from,
        to
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Challenge calendar retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async badges(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await challengeService.getBadges(requireUserId(req));
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Badges retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async adminUpsert(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const dateKey = String(req.params.dateKey || "");
      const body = adminChallengeSchema.parse(req.body);
      const data = await challengeService.upsertAdminChallenge(dateKey, body);
      const { writeAdminAudit } = await import(
        "../utils/helpers/audit.helper"
      );
      await writeAdminAudit({
        actorId: String(req.user?.userId || ""),
        actorEmail: req.user?.email,
        action: "challenge.admin_upsert",
        resource: "daily_challenge",
        resourceId: dateKey,
        after: data as unknown as Record<string, unknown>,
        ip: req.ip,
        userAgent: req.get("user-agent") || undefined,
        authorization: req.headers.authorization,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Daily challenge saved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async adminGetByDate(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const dateKey = String(req.params.dateKey || "");
      const data = await challengeService.adminGetByDate(dateKey);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Daily challenge retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async internalQualify(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const body = internalQualifySchema.parse(req.body);
      const data = await challengeService.qualifyInternal(
        body.userId,
        body.problemId,
        body.submissionId
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Challenge qualified",
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const challengeController = new ChallengeController();
