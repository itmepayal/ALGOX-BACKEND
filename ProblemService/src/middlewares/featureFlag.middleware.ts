import { Request, Response, NextFunction } from "express";
import {
  getRemoteFeatureFlags,
  type FeatureFlagKey,
} from "../utils/featureFlags";
import { serverConfig } from "../config";

export const requireFeatureFlag = (flag: FeatureFlagKey) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authUrl =
        (serverConfig as any).AUTH_SERVICE_URL || "http://localhost:3001";
      const { flags, allowAdminBypass } = await getRemoteFeatureFlags(authUrl);
      const role = (req as any).user?.role;
      const staff =
        role === "admin" ||
        role === "super_admin" ||
        role === "moderator" ||
        role === "content_manager";

      if (flag === "maintenance") {
        if (flags.maintenance && !(allowAdminBypass && staff)) {
          res.status(503).json({
            success: false,
            message: "Platform is under maintenance",
          });
          return;
        }
        return next();
      }

      if (flags[flag] === false) {
        res.status(503).json({
          success: false,
          message: `Feature '${flag}' is currently disabled`,
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};
