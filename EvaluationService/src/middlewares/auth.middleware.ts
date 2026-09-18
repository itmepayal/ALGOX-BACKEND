import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { serverConfig } from "../config";
import { UnauthorizedError } from "../utils/errors/app.error";

export interface JwtUser {
  userId: string;
  email?: string;
  role?: string;
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
      role: decoded.role,
      permissions: Array.isArray(decoded.permissions)
        ? decoded.permissions
        : undefined,
    };
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired authorization token"));
  }
};

/** JWT for product clients, or shared internal secret for service-to-service. */
export const authenticateJwtOrInternal = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  const provided =
    req.headers["x-internal-secret"] || req.headers["x-realtime-secret"];
  const expected = serverConfig.INTERNAL_SERVICE_SECRET;
  if (typeof provided === "string" && expected && provided === expected) {
    return next();
  }
  return authenticateJwt(req, _res, next);
};

/** Service-to-service only — clients must use /run or SubmissionService. */
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
  return next(new UnauthorizedError("Internal service authentication required"));
};
