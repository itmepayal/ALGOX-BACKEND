import { Response, NextFunction } from "express";
import {
  AuthenticatedRequest,
  UnauthorizedError,
  ForbiddenError,
} from "./auth.middleware";
import {
  resolveEntitlements,
  hasFeature,
} from "../utils/entitlementClient";

export class PremiumRequiredError extends ForbiddenError {
  code = "PREMIUM_REQUIRED";
  feature: string;

  constructor(
    feature: string,
    message = "This feature requires an active Premium subscription."
  ) {
    super(message);
    this.name = "PremiumRequiredError";
    this.feature = feature;
  }
}

/**
 * Backend feature gate for ContentService routes.
 * Resolves entitlements from AuthService SoT.
 */
export function requireFeature(feature: string) {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user?.userId) {
        return next(new UnauthorizedError("Authentication required"));
      }
      const snap = await resolveEntitlements(
        typeof req.headers.authorization === "string"
          ? req.headers.authorization
          : null
      );
      if (!hasFeature(snap, feature)) {
        return next(new PremiumRequiredError(feature));
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
