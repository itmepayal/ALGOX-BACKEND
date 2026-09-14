import { Request, Response, NextFunction } from "express";
import { platformSettingsService } from "../services/platformSettings.service";
import type { FeatureFlagKey } from "../utils/helpers/featureFlags.helper";
import { AuthenticatedRequest } from "./auth.middleware";
import { isStaffRole } from "../rbac/permissions";

class ServiceUnavailableError extends Error {
  statusCode = 503;
  constructor(message: string) {
    super(message);
    this.name = "ServiceUnavailableError";
  }
}

/**
 * Gate a route on PlatformSettings.featureFlags (and synced legacy booleans).
 * Staff may bypass maintenance when allowAdminBypass is true.
 */
export const requireFeatureFlag = (flag: FeatureFlagKey) => {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const settings = await platformSettingsService.getPublicSettings();
      const flags = settings.featureFlags;
      const role = (req as AuthenticatedRequest).user?.role;
      const staffBypass =
        Boolean(settings.allowAdminBypass) && isStaffRole(role);

      if (flag === "maintenance") {
        if (flags.maintenance && !staffBypass) {
          return next(
            new ServiceUnavailableError(
              settings.maintenanceMessage ||
                "Platform is under maintenance"
            )
          );
        }
        return next();
      }

      if (flags[flag] === false) {
        return next(
          new ServiceUnavailableError(`Feature '${flag}' is currently disabled`)
        );
      }
      return next();
    } catch (err) {
      next(err);
    }
  };
};
