import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { User } from "../models/user.model";
import { SecurityLog } from "../models/securityLog.model";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import {
  UnauthorizedError,
  BadRequestError,
} from "../utils/errors/app.error";
import { writeAdminAudit } from "../utils/helpers/audit.helper";
import { toPublicEntitlements } from "./engine";
import { toPublicSubscription } from "./entitlement";
import { subscriptionService } from "./subscription.service";
import {
  toSafeSubscription,
  toSafeSubscriptionEvent,
} from "./publicSubscription";
import { billingCheckoutService } from "../billing/checkout.service";
import {
  subscriptionActionBodySchema,
  subscriptionHistoryQuerySchema,
} from "../validators/subscription.validator";
import { rejectClientEntitlementMutation } from "./transitions";
import { rejectSpoofedUserId } from "../utils/helpers/ownership.helper";

function clientMeta(req: AuthenticatedRequest) {
  return {
    ip: req.ip || req.socket?.remoteAddress,
    userAgent: req.get("user-agent") || undefined,
  };
}

async function auditLifecycle(
  userId: string,
  email: string | undefined,
  action: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  meta: { ip?: string; userAgent?: string }
) {
  try {
    await SecurityLog.create({
      userId,
      action,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  } catch {
    /* never block */
  }
  await writeAdminAudit({
    actorId: userId,
    actorEmail: email,
    action,
    resource: "subscription",
    resourceId: userId,
    before,
    after,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

export class SubscriptionController {
  /** Current live subscription (safe) + entitlement snapshot. */
  async getMine(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }
      rejectClientEntitlementMutation(
        req.body as Record<string, unknown> | undefined
      );
      rejectSpoofedUserId(req.user.userId, (req.body as any)?.userId);
      // Lazy expire before returning snapshot
      await subscriptionService.syncUserEntitlementSnapshot(req.user.userId);
      const userId = req.user.userId;
      const [live, user] = await Promise.all([
        subscriptionService.getLiveForUser(userId),
        User.findById(userId).select("subscription featureGrants email").lean(),
      ]);
      if (!user) throw new UnauthorizedError("User not found");

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Subscription retrieved",
        data: {
          subscription: toSafeSubscription(live),
          entitlement: toPublicSubscription((user as any).subscription),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /** Feature entitlements for the authenticated user only. */
  async getEntitlements(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }
      rejectClientEntitlementMutation(
        req.body as Record<string, unknown> | undefined
      );
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

  /** Historical subscriptions + safe lifecycle events (no webhook payloads). */
  async getHistory(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }
      rejectSpoofedUserId(
        req.user.userId,
        (req.query as any)?.userId,
        "userId"
      );
      const query = subscriptionHistoryQuerySchema.parse(req.query);
      const { subscriptions, events } =
        await subscriptionService.listHistoryForUser(
          req.user.userId,
          query.limit
        );

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Subscription history retrieved",
        data: {
          subscriptions: subscriptions.map((s) => toSafeSubscription(s)),
          events: events.map((e) => toSafeSubscriptionEvent(e)),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /** Idempotent cancel-at-period-end. Never accepts plan/status from client. */
  async cancel(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }
      subscriptionActionBodySchema.parse(req.body ?? {});
      rejectClientEntitlementMutation(
        req.body as Record<string, unknown> | undefined
      );

      const userId = req.user.userId;
      const before = toSafeSubscription(
        await subscriptionService.getLiveForUser(userId)
      );

      const result = await subscriptionService.cancelAtPeriodEnd(userId, {
        reason: "user_cancel",
      });

      // Sync to payment provider when mapped (Stripe); sandbox is local-only
      if (
        result.changed &&
        result.subscription?.provider === "stripe" &&
        result.subscription.providerSubscriptionId
      ) {
        try {
          await billingCheckoutService.providerCancelAtPeriodEnd(
            result.subscription.providerSubscriptionId
          );
        } catch (err) {
          // Local cancel already applied; provider sync failure should surface
          throw err;
        }
      }

      const after = toSafeSubscription(result.subscription);
      const meta = clientMeta(req);

      if (result.changed) {
        await auditLifecycle(
          userId,
          req.user.email,
          "subscription.cancel",
          { subscription: before },
          { subscription: after },
          meta
        );
      }

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: result.idempotent
          ? "Cancellation already recorded"
          : "Subscription will cancel at period end",
        data: {
          subscription: after,
          idempotent: result.idempotent,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /** Idempotent resume when cancel-at-period-end was scheduled. */
  async resume(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }
      subscriptionActionBodySchema.parse(req.body ?? {});

      const userId = req.user.userId;
      const before = toSafeSubscription(
        await subscriptionService.getLiveForUser(userId)
      );

      const result = await subscriptionService.resume(userId, {
        reason: "user_resume",
      });

      if (
        result.changed &&
        result.subscription?.provider === "stripe" &&
        result.subscription.providerSubscriptionId
      ) {
        await billingCheckoutService.providerResume(
          result.subscription.providerSubscriptionId
        );
      }

      const after = toSafeSubscription(result.subscription);
      const meta = clientMeta(req);

      if (result.changed) {
        await auditLifecycle(
          userId,
          req.user.email,
          "subscription.resume",
          { subscription: before },
          { subscription: after },
          meta
        );
      }

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: result.idempotent
          ? "Subscription already active"
          : "Subscription resumed",
        data: {
          subscription: after,
          idempotent: result.idempotent,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Intentionally not implemented — clients must never activate premium.
   * Present only to return a clear validation/forbidden error if hit via misconfig.
   */
  async rejectActivate(
    _req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> {
    next(
      new BadRequestError(
        "Clients cannot create or activate subscriptions",
        { code: "SUBSCRIPTION_ACTIVATE_FORBIDDEN" }
      )
    );
  }
}

export const subscriptionController = new SubscriptionController();
