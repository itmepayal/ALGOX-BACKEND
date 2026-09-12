import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, JwtPayload } from "../utils/helpers/jwt.util";
import { UnauthorizedError, ForbiddenError } from "../utils/errors/app.error";
import {
  hasAnyPermission,
  hasPermission,
  isStaffRole,
  normalizeRole,
  type Permission,
  type UserRole,
} from "../rbac/permissions";

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
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }

    const role = normalizeRole(req.user.role);
    if (!roles.includes(role)) {
      return next(new ForbiddenError("Access forbidden: Insufficient permissions"));
    }

    return next();
  };
};

/** Require the user to hold at least one of the listed permissions. */
export const requirePermission = (...permissions: Permission[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }
    if (!hasAnyPermission(req.user.role, permissions)) {
      return next(new ForbiddenError("Access forbidden: Insufficient permissions"));
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

export { hasPermission, hasAnyPermission, isStaffRole, normalizeRole };
