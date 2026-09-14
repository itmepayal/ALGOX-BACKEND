import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { serverConfig } from "../config";
import { UnauthorizedError, ForbiddenError } from "../utils/errors/app.error";
import {
  hasAnyPermission,
  isStaffRole,
  normalizeRole,
  type Permission,
  type UserRole,
} from "../rbac/permissions";

export interface JwtUser {
  userId: string;
  email: string;
  role: UserRole | string;
  /** Auth-issued permission snapshot — preferred over local ROLE_PERMISSIONS. */
  permissions?: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: JwtUser;
}

export interface AuthenticatedAdminRequest extends AuthenticatedRequest {}

function userHasAny(
  user: JwtUser,
  permissions: Permission[]
): boolean {
  if (user.permissions && user.permissions.length > 0) {
    const set = new Set(user.permissions);
    return permissions.some((p) => set.has(p));
  }
  return hasAnyPermission(user.role, permissions);
}

export const authenticateJwt = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(new UnauthorizedError("Authentication required"));
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, serverConfig.JWT_SECRET) as JwtUser;

    if (!decoded?.userId) {
      return next(new UnauthorizedError("Invalid authorization token"));
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: normalizeRole(decoded.role),
      permissions: Array.isArray(decoded.permissions)
        ? decoded.permissions
        : undefined,
    };
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired authorization token"));
  }
};

export const optionalAuthenticateJwt = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, serverConfig.JWT_SECRET) as JwtUser;
    if (decoded?.userId) {
      req.user = {
        userId: decoded.userId,
        email: decoded.email,
        role: normalizeRole(decoded.role),
        permissions: Array.isArray(decoded.permissions)
          ? decoded.permissions
          : undefined,
      };
    }
  } catch {
    // ignore
  }
  next();
};

export const authenticateAdmin = (
  req: AuthenticatedAdminRequest,
  _res: Response,
  next: NextFunction
): void => {
  authenticateJwt(req, _res, (err?: any) => {
    if (err) return next(err);
    if (
      !isStaffRole(req.user?.role) ||
      !userHasAny(req.user!, ["problems:view"])
    ) {
      return next(
        new ForbiddenError("Forbidden. Insufficient permissions for this action.")
      );
    }
    next();
  });
};

function userHasPermission(user: JwtUser, permission: Permission): boolean {
  if (user.permissions && user.permissions.length > 0) {
    return user.permissions.includes(permission);
  }
  return hasAnyPermission(user.role, [permission]);
}

export const requirePermission = (...permissions: Permission[]) => {
  return (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }
    if (!userHasAny(req.user, permissions)) {
      return next(
        new ForbiddenError("Access forbidden: Insufficient permissions")
      );
    }
    return next();
  };
};

/**
 * When the request body includes `testcases`, require the matching
 * testcases:* permission (create on POST, update otherwise).
 * No-op when testcases are not being written.
 */
export const requireTestcaseWritePermission = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return next(new UnauthorizedError("Authentication required"));
  }
  if (req.body?.testcases === undefined) {
    return next();
  }
  const needed: Permission =
    req.method === "POST" ? "testcases:create" : "testcases:update";
  if (!userHasPermission(req.user, needed)) {
    return next(
      new ForbiddenError("Access forbidden: Insufficient permissions")
    );
  }
  return next();
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

export const requireInternalSecret = (
  req: Request,
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
  return next(new UnauthorizedError("Invalid or missing internal service secret"));
};
