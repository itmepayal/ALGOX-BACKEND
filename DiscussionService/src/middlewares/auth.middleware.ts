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
      role: normalizeRole(decoded.role),
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
        };
      }
    }
  } catch {
    // ignore
  }
  next();
};

export const requirePermission = (...permissions: Permission[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError("Authentication required"));
    if (!hasAnyPermission(req.user.role, permissions)) {
      return next(new ForbiddenError("Access forbidden: Insufficient permissions"));
    }
    return next();
  };
};
