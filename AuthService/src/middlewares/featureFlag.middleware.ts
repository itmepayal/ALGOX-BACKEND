import { Request, Response, NextFunction } from "express";
import { platformSettingsService } from "../services/platformSettings.service";
import type { FeatureFlagKey } from "../utils/helpers/featureFlags.helper";
import { AuthenticatedRequest } from "./auth.middleware";
import { isStaffRole } from "../rbac/permissions";
import { verifyAccessToken } from "../utils/helpers/jwt.util";

const MAINTENANCE_MESSAGE = "AlgoPath is temporarily under maintenance.";

function maintenancePayload(message?: string) {
  return {
    success: false,
    code: "MAINTENANCE_MODE",
    message: message || MAINTENANCE_MESSAGE,
  };
}

function peekRole(req: Request): string | undefined {
  const existing = (req as AuthenticatedRequest).user?.role;
  if (existing) return String(existing);
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return undefined;
    const decoded = verifyAccessToken(authHeader.split(" ")[1]);
    return decoded?.role ? String(decoded.role) : undefined;
  } catch {
    return undefined;
  }
}

/** Paths that must remain reachable during maintenance. */
function isMaintenanceExempt(req: Request): boolean {
  const raw = `${req.baseUrl || ""}${req.path || ""}`.toLowerCase();
  const url = String(req.originalUrl || raw).toLowerCase();

  if (url.includes("/health")) return true;
  if (url.includes("/auth/admin")) return true;
  if (url.includes("/auth/public/settings")) return true;
  if (url.includes("/auth/login")) return true;
  if (url.includes("/auth/refresh")) return true;
  if (url.includes("/auth/forgot-password")) return true;
  if (url.includes("/auth/reset-password")) return true;
  if (url.includes("/internal")) return true;
  return false;
}

/**
 * Centralized maintenance gate for AuthService product routes.
 * Admin / health / login / public settings stay available.
 */
export const blockWhenMaintenance = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (isMaintenanceExempt(req)) return next();

    const settings = await platformSettingsService.getPublicSettings();
    const on =
      Boolean(settings.featureFlags?.maintenance) ||
      Boolean(settings.maintenanceMode);
    if (!on) return next();

    const role = peekRole(req);
    if (settings.allowAdminBypass && isStaffRole(role)) return next();

    res.status(503).json(
      maintenancePayload(settings.maintenanceMessage || MAINTENANCE_MESSAGE)
    );
  } catch (err) {
    next(err);
  }
};

/**
 * Gate a route on PlatformSettings.featureFlags (and synced legacy booleans).
 * Staff may bypass maintenance when allowAdminBypass is true.
 */
export const requireFeatureFlag = (flag: FeatureFlagKey) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const settings = await platformSettingsService.getPublicSettings();
      const flags = settings.featureFlags;
      const role = peekRole(req);
      const staffBypass =
        Boolean(settings.allowAdminBypass) && isStaffRole(role);

      if (flag === "maintenance") {
        if (flags.maintenance && !staffBypass) {
          res.status(503).json(
            maintenancePayload(
              settings.maintenanceMessage || MAINTENANCE_MESSAGE
            )
          );
          return;
        }
        return next();
      }

      if (flags[flag] === false) {
        res.status(503).json({
          success: false,
          code: "FEATURE_DISABLED",
          message: `Feature '${flag}' is currently disabled`,
        });
        return;
      }
      return next();
    } catch (err) {
      next(err);
    }
  };
};
