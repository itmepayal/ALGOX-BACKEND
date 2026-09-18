import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { User } from "../models/user.model";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";
import { toPublicEntitlements } from "./engine";
import { FEATURE_IDS, FEATURE_META } from "./features";
import { subscriptionService } from "./subscription.service";

export class EntitlementController {
  /** Safe entitlement snapshot for UI (not a security boundary). */
  async getMine(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }
      await subscriptionService.syncUserEntitlementSnapshot(req.user.userId);
      const user = await User.findById(req.user.userId)
        .select("subscription featureGrants")
        .lean();
      if (!user) throw new UnauthorizedError("User not found");

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Entitlements retrieved",
        data: toPublicEntitlements({
          subscription: (user as any).subscription,
          featureGrants: (user as any).featureGrants,
        }),
      });
    } catch (err) {
      next(err);
    }
  }

  /** Catalog of known features (ids + labels only). */
  async listCatalog(
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Feature catalog",
        data: {
          features: FEATURE_IDS.map((id) => ({
            id,
            label: FEATURE_META[id].label,
            description: FEATURE_META[id].description,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Probe route protected by requireEntitlement — for verification / future product gates.
   * Handler only runs when entitlement passed.
   */
  async probeAllowed(
    req: AuthenticatedRequest & { entitlement?: { feature: string } },
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const feature = String(req.params.feature || "");
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Access granted",
        data: {
          ok: true,
          feature,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const entitlementController = new EntitlementController();
