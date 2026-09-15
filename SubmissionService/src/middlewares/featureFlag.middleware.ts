import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import {
  getRemoteFeatureFlags,
  type FeatureFlagKey,
} from "../utils/featureFlags";
import { serverConfig } from "../config";

const MAINTENANCE_MESSAGE = "AlgoPath is temporarily under maintenance.";

function isStaff(role: unknown): boolean {
  return (
    role === "admin" ||
    role === "super_admin" ||
    role === "moderator" ||
    role === "content_manager"
  );
}

function peekRole(req: Request): string | undefined {
  if ((req as any).user?.role) return String((req as any).user.role);
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return undefined;
    const token = authHeader.split(" ")[1];
    const secret = (serverConfig as any).JWT_SECRET;
    if (!secret) return undefined;
    const decoded = jwt.verify(token, secret) as { role?: string };
    return decoded?.role ? String(decoded.role) : undefined;
  } catch {
    return undefined;
  }
}

function isMaintenanceExempt(req: Request): boolean {
  const url = String(req.originalUrl || req.url || "").toLowerCase();
  if (url.includes("/health")) return true;
  if (url.includes("/admin")) return true;
  if (url.includes("/internal")) return true;
  return false;
}

export const blockWhenMaintenance = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (isMaintenanceExempt(req)) return next();

    const authUrl =
      (serverConfig as any).AUTH_SERVICE_URL || "http://localhost:3001";
    const { flags, allowAdminBypass } = await getRemoteFeatureFlags(authUrl);
    if (!flags.maintenance) return next();

    const role = peekRole(req);
    if (allowAdminBypass && isStaff(role)) return next();

    res.status(503).json({
      success: false,
      code: "MAINTENANCE_MODE",
      message: MAINTENANCE_MESSAGE,
    });
  } catch (err) {
    next(err);
  }
};

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
      const role = peekRole(req);
      const staff = isStaff(role);

      if (flag === "maintenance") {
        if (flags.maintenance && !(allowAdminBypass && staff)) {
          res.status(503).json({
            success: false,
            code: "MAINTENANCE_MODE",
            message: MAINTENANCE_MESSAGE,
          });
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
      next();
    } catch (err) {
      next(err);
    }
  };
};
