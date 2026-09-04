import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, JwtPayload } from "../utils/helpers/jwt.util";
import { UnauthorizedError, ForbiddenError } from "../utils/errors/app.error";

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export const authenticateJwt = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Access token required"));
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    return next();
  } catch (err) {
    return next(new UnauthorizedError("Invalid or expired token"));
  }
};

export const authorizeRoles = (...roles: Array<"user" | "admin">) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError("Authentication required"));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError("Access forbidden: Insufficient permissions"));
    }

    return next();
  };
};
