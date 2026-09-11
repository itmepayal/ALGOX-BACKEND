import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { serverConfig } from "../config";
import { UnauthorizedError, ForbiddenError } from "../utils/errors/app.error";

export interface JwtUser {
  userId: string;
  email: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtUser;
}

export interface AuthenticatedAdminRequest extends AuthenticatedRequest {}

/**
 * Require a valid access token. User id is taken from JWT only — never from body.
 */
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
    };
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired authorization token"));
  }
};

/**
 * Attach user if token present; otherwise continue anonymously.
 */
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
        role: decoded.role,
      };
    }
  } catch {
    // ignore invalid token for optional auth
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
    if (req.user?.role !== "admin") {
      return next(
        new ForbiddenError("Forbidden. Only Admin users can perform this action.")
      );
    }
    next();
  });
};
