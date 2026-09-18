import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { User } from "../models/user.model";
import { ForbiddenError, UnauthorizedError } from "../utils/errors/app.error";
import { canAccessFeature } from "./engine";
import { isKnownFeature } from "./features";
import { subscriptionService } from "./subscription.service";

/**
 * Consistent premium-required error.
 * details.code is promoted by the error middleware.
 */
export class PremiumRequiredError extends ForbiddenError {
  constructor(feature: string, accessTier: string) {
    super("Premium entitlement required", {
      code: "PREMIUM_REQUIRED",
      feature,
      accessTier,
    });
    this.name = "PremiumRequiredError";
  }
}

export class UnknownFeatureError extends ForbiddenError {
  constructor(feature: string) {
    super("Unknown feature", {
      code: "UNKNOWN_FEATURE",
      feature,
    });
    this.name = "UnknownFeatureError";
  }
}

/**
 * Backend security boundary for product features.
 * Loads subscription from DB (JWT is not the entitlement source of truth).
 * Lazy-syncs expired periods so cancelled/expired Premium loses access.
 *
 * Usage: authenticateJwt, requireEntitlement("premium.editorial")
 */
export function requireEntitlement(feature: string) {
  return async (
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.user?.userId) {
        return next(new UnauthorizedError("Authentication required"));
      }

      if (!isKnownFeature(feature)) {
        return next(new UnknownFeatureError(feature));
      }

      // Ensure expired periods / cancelled-after-end lose access before check
      try {
        await subscriptionService.syncUserEntitlementSnapshot(req.user.userId);
      } catch {
        /* fail open to DB read below — never grant on sync error */
      }

      const user = await User.findById(req.user.userId)
        .select("subscription featureGrants")
        .lean();

      if (!user) {
        return next(new UnauthorizedError("User not found"));
      }

      const decision = canAccessFeature(
        {
          subscription: (user as any).subscription,
          featureGrants: (user as any).featureGrants,
        },
        feature
      );

      if (!decision.allowed) {
        if (decision.reason === "unknown_feature") {
          return next(new UnknownFeatureError(feature));
        }
        return next(
          new PremiumRequiredError(feature, decision.accessTier)
        );
      }

      // Attach for handlers (optional)
      (req as AuthenticatedRequest & { entitlement?: typeof decision }).entitlement =
        decision;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
