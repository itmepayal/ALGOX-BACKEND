import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { serverConfig } from "../config";

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

export interface JwtUser {
  userId: string;
  email: string;
  role: string;
  permissions?: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: JwtUser;
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
      role: decoded.role || "user",
      permissions: Array.isArray(decoded.permissions)
        ? decoded.permissions
        : undefined,
    };
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired authorization token"));
  }
};

/** Prefer Auth JWT permission snapshot; fall back to admin/super_admin roles. */
export const requireLeaderboardAdmin = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user) return next(new UnauthorizedError("Authentication required"));
  const perms = req.user.permissions;
  if (perms?.length) {
    if (
      perms.includes("settings:update") ||
      perms.includes("users:delete")
    ) {
      return next();
    }
    return next(
      new ForbiddenError("Access forbidden: Insufficient permissions")
    );
  }
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return next(
      new ForbiddenError("Access forbidden: Insufficient permissions")
    );
  }
  next();
};
