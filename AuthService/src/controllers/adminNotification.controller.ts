import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { adminNotificationService } from "../services/adminNotification.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  type: z.string().max(64).optional(),
  target: z.enum(["user", "role", "broadcast"]),
  userId: z.string().optional(),
  roles: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

export class AdminNotificationController {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const result = await adminNotificationService.list({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        userId: req.query.userId ? String(req.query.userId) : undefined,
        type: req.query.type ? String(req.query.type) : undefined,
        read: req.query.read ? String(req.query.read) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Notifications retrieved",
        data: result.notifications,
        meta: result.meta,
      });
    } catch (err) {
      next(err);
    }
  }

  async create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const body = createSchema.parse(req.body || {});
      const data = await adminNotificationService.create(
        { userId: req.user.userId, email: req.user.email },
        body,
        { ip: req.ip, userAgent: req.get("user-agent") || undefined }
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: data.scheduled ? "Notification scheduled" : "Notifications sent",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async remove(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const data = await adminNotificationService.remove(
        { userId: req.user.userId, email: req.user.email },
        String(req.params.id),
        { ip: req.ip, userAgent: req.get("user-agent") || undefined }
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Notification deleted",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async listCampaigns(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const result = await adminNotificationService.listCampaigns({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        status: req.query.status ? String(req.query.status) : undefined,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Campaigns retrieved",
        data: result.campaigns,
        meta: result.meta,
      });
    } catch (err) {
      next(err);
    }
  }

  async cancelCampaign(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const data = await adminNotificationService.cancelCampaign(
        { userId: req.user.userId, email: req.user.email },
        String(req.params.id),
        { ip: req.ip, userAgent: req.get("user-agent") || undefined }
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Campaign cancelled",
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const adminNotificationController = new AdminNotificationController();
