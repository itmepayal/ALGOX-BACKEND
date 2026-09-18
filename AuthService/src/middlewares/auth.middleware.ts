import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
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

/** Constant-time compare for internal secrets (length mismatch → not equal). */
function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    // Keep work roughly constant; result is always false when lengths differ.
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
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

/** Shared service-to-service secret (x-internal-secret). Fail-closed; never log the value. */
export const requireInternalSecret = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  const providedRaw =
    req.headers["x-internal-secret"] || req.headers["x-realtime-secret"];
  const provided = typeof providedRaw === "string" ? providedRaw.trim() : "";
  const expected = (serverConfig.INTERNAL_SERVICE_SECRET || "").trim();

  if (!expected) {
    return next(
      new UnauthorizedError("Internal service authentication is not configured")
    );
  }

  if (provided && secretsEqual(provided, expected)) {
    return next();
  }

  // Authenticated staff without the service secret → forged S2S rejected
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
