import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { serverConfig } from "../config";
import {
  hasAnyPermission,
  normalizeRole,
  type Permission,
  type UserRole,
} from "../rbac/permissions";

export class UnauthorizedError extends Error {
  statusCode = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class BadRequestError extends Error {
  statusCode = 400;
  constructor(message = "Bad Request") {
    super(message);
    this.name = "BadRequestError";
  }
}

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

/** Attach user when Bearer present; never fails the request. */
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
    next();
  };
};
