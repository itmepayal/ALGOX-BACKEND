import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, JwtPayload } from "../utils/helpers/jwt.util";
import { UnauthorizedError, ForbiddenError } from "../utils/errors/app.error";
import {
  isStaffRole,
  normalizeRole,
  type Permission,
  type UserRole,
} from "../rbac/permissions";
import {
  hasAnyPermissionResolved,
  hasPermissionResolved,
} from "../services/rolePermission.service";
import { serverConfig } from "../config";

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export const authenticateJwt = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Access token required"));
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      ...decoded,
      role: normalizeRole(decoded.role),
    };
    return next();
  } catch {
    return next(new UnauthorizedError("Invalid or expired token"));
  }
};

export const authorizeRoles = (...roles: UserRole[]) => {
  return (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }

    const role = normalizeRole(req.user.role);
    if (!roles.includes(role)) {
      return next(
        new ForbiddenError("Access forbidden: Insufficient permissions")
      );
    }

    return next();
  };
};

/** Require at least one permission (DB role overrides applied). */
export const requirePermission = (...permissions: Permission[]) => {
  return (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }
    if (!hasAnyPermissionResolved(req.user.role, permissions)) {
      return next(
        new ForbiddenError("Access forbidden: Insufficient permissions")
      );
    }
    return next();
  };
};

export const requireStaff = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return next(new UnauthorizedError("Authentication required"));
  }
  if (!isStaffRole(req.user.role)) {
    return next(new ForbiddenError("Access forbidden: Staff only"));
  }
  return next();
};

/** Shared service-to-service secret (x-internal-secret). */
export const requireInternalSecret = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  const provided =
    req.headers["x-internal-secret"] || req.headers["x-realtime-secret"];
  const expected = serverConfig.INTERNAL_SERVICE_SECRET;
  if (!expected) {
    return next(
      new UnauthorizedError("Internal service authentication is not configured")
    );
  }
  if (typeof provided === "string" && provided === expected) {
    return next();
  }
  // Authenticated staff without the service secret → forged ingest rejected
  if (req.user) {
    return next(
      new ForbiddenError("Access forbidden: Internal service secret required")
    );
  }
  return next(new UnauthorizedError("Invalid or missing internal service secret"));
};

export {
  hasPermissionResolved as hasPermission,
  hasAnyPermissionResolved as hasAnyPermission,
  isStaffRole,
  normalizeRole,
};
