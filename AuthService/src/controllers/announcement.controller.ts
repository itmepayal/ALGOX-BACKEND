import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { announcementService } from "../services/announcement.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";
import {
  createAnnouncementSchema,
  listAnnouncementsQuerySchema,
  scheduleAnnouncementSchema,
  updateAnnouncementSchema,
} from "../validators/announcement.validator";

function actorFrom(req: AuthenticatedRequest) {
  if (!req.user?.userId) throw new UnauthorizedError("Authentication required");
  return {
    userId: req.user.userId,
    email: req.user.email,
    role: String(req.user.role),
  };
}

function metaFrom(req: AuthenticatedRequest) {
  return {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
  };
}

export class AnnouncementController {
  async listAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const query = listAnnouncementsQuerySchema.parse(req.query);
      const result = await announcementService.listAdmin(query);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Announcements retrieved",
        data: result.announcements,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await announcementService.getById(String(req.params.id));
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Announcement retrieved",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = createAnnouncementSchema.parse(req.body);
      const data = await announcementService.create(
        actorFrom(req),
        body,
        metaFrom(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Announcement created",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = updateAnnouncementSchema.parse(req.body);
      const data = await announcementService.update(
        actorFrom(req),
        String(req.params.id),
        body,
        metaFrom(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Announcement updated",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async schedule(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const body = scheduleAnnouncementSchema.parse(req.body);
      const data = await announcementService.schedule(
        actorFrom(req),
        String(req.params.id),
        body.scheduledAt,
        metaFrom(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Announcement scheduled",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async publish(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await announcementService.publish(
        actorFrom(req),
        String(req.params.id),
        metaFrom(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Announcement published",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async expire(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await announcementService.expire(
        actorFrom(req),
        String(req.params.id),
        metaFrom(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Announcement expired",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async archive(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await announcementService.archive(
        actorFrom(req),
        String(req.params.id),
        metaFrom(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Announcement archived",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async listForUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required");
      const data = await announcementService.listForUser(
        req.user.userId,
        String(req.user.role)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Announcements retrieved",
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const announcementController = new AnnouncementController();
