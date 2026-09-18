import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { serverConfig } from "../config";
import { UnauthorizedError, ForbiddenError } from "../utils/errors/app.error";
import {
  hasAnyPermission,
  normalizeRole,
  type Permission,
  type UserRole,
} from "../rbac/permissions";

export interface JwtUser {
  userId: string;
  email: string;
  role: UserRole | string;
  permissions?: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: JwtUser;
}

function userHasAny(user: JwtUser, permissions: Permission[]): boolean {
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
    if (authHeader?.startsWith("Bearer ")) {
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
    }
  } catch {
    // ignore
  }
  next();
};

export const requirePermission = (...permissions: Permission[]) => {
  return (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) return next(new UnauthorizedError("Authentication required"));
    if (!userHasAny(req.user, permissions)) {
      return next(
        new ForbiddenError("Access forbidden: Insufficient permissions")
      );
    }
    return next();
  };
};

/** Service-to-service auth — fail closed if secret unset or mismatch. Never log secrets. */
export const requireInternalSecret = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const provided =
    req.headers["x-internal-secret"] || req.headers["x-realtime-secret"];
  const expected = (serverConfig.INTERNAL_SERVICE_SECRET || "").trim();
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
