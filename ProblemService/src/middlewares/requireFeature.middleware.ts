import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.middleware";
import { UnauthorizedError } from "../utils/errors/app.error";
import {
  resolveEntitlements,
  hasFeature,
} from "../utils/entitlementClient";
import { PremiumRequiredError } from "../utils/problemAccess";

/**
 * Backend feature gate for ProblemService routes.
 * Resolves entitlements from AuthService SoT (never trusts JWT claims alone).
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
        return next(
          new PremiumRequiredError(
            "This feature requires an active Premium subscription.",
            { feature, accessTier: snap.accessTier }
          )
        );
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
