import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { notificationService } from "../services/notification.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";
import { listNotificationsQuerySchema } from "../validators/notification.validator";

export class NotificationController {
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required");
      const query = listNotificationsQuerySchema.parse(req.query);
      const result = await notificationService.listForUser(req.user.userId, query);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Notifications retrieved",
        data: result.notifications,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async unreadCount(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required");
      const data = await notificationService.unreadCount(req.user.userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Unread count retrieved",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async markRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required");
      const data = await notificationService.markRead(
        req.user.userId,
        String(req.params.id)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Notification marked as read",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async markAllRead(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required");
      const data = await notificationService.markAllRead(req.user.userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "All notifications marked as read",
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
