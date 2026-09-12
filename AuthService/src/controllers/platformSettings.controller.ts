import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { platformSettingsService } from "../services/platformSettings.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";

export class PlatformSettingsController {
  async getAdmin(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const data = await platformSettingsService.getAdminSettings();
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Platform settings retrieved",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getPublic(_req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await platformSettingsService.getPublicSettings();
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Public settings retrieved",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required");
      const data = await platformSettingsService.updateSettings({
        patch: req.body || {},
        actor: {
          userId: req.user.userId,
          email: req.user.email,
          role: String(req.user.role),
        },
        ip: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Platform settings updated",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async reset(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required");
      const data = await platformSettingsService.resetToDefaults({
        actor: {
          userId: req.user.userId,
          email: req.user.email,
          role: String(req.user.role),
        },
        ip: req.ip,
        userAgent: req.get("user-agent") || undefined,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Platform settings reset to defaults",
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const platformSettingsController = new PlatformSettingsController();
