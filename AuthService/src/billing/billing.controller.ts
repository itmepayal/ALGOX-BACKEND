import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import {
  UnauthorizedError,
  BadRequestError,
} from "../utils/errors/app.error";
import { writeAdminAudit } from "../utils/helpers/audit.helper";
import { SecurityLog } from "../models/securityLog.model";
import {
  getBillingConfig,
  toPublicBillingConfig,
} from "./billing.config";
import { billingCheckoutService } from "./checkout.service";
import { billingWebhookService } from "./webhook.service";
import { rejectClientEntitlementMutation } from "../subscription/transitions";
import { rejectSpoofedUserId } from "../utils/helpers/ownership.helper";
import { subscriptionActionBodySchema } from "../validators/subscription.validator";

export class BillingController {
  /** Public-safe billing capability (no secrets). */
  async getConfig(
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Billing config",
        data: toPublicBillingConfig(),
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create Premium checkout session (server-side only).
   * Cashfree clients receive paymentSessionId for Cashfree.js checkout().
   */
  async createCheckout(
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
      rejectSpoofedUserId(req.user.userId, (req.body as any)?.userId);

      const cfg = getBillingConfig();
      if (!cfg.enabled) {
        throw new BadRequestError(
          "Premium billing is not enabled on this environment",
          { code: "BILLING_DISABLED" }
        );
      }

      const result = await billingCheckoutService.createPremiumCheckout({
        userId: req.user.userId,
        email: req.user.email,
      });

      try {
        await SecurityLog.create({
          userId: req.user.userId,
          action: "billing.checkout_created",
          ip: req.ip || req.socket?.remoteAddress,
          userAgent: req.get("user-agent") || undefined,
        });
      } catch {
        /* ignore */
      }
      await writeAdminAudit({
        actorId: req.user.userId,
        actorEmail: req.user.email,
        action: "billing.checkout_created",
        resource: "subscription",
        resourceId: req.user.userId,
        after: {
          sessionId: result.sessionId,
          provider: result.provider,
        },
        ip: req.ip || req.socket?.remoteAddress,
        userAgent: req.get("user-agent") || undefined,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Checkout session created",
        data: {
          sessionId: result.sessionId,
          url: result.url,
          provider: result.provider,
          ...(result.paymentSessionId
            ? { paymentSessionId: result.paymentSessionId }
            : {}),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Stripe webhook — signature verified; idempotent by event id.
   * Expects raw Buffer body (mounted before express.json).
   */
  async stripeWebhook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const signature = req.headers["stripe-signature"];
      const raw = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(
            typeof req.body === "string" ? req.body : JSON.stringify(req.body || {})
          );

      const result = await billingWebhookService.processRawWebhook(
        raw,
        typeof signature === "string" ? signature : undefined
      );

      // Always 200 for verified events (including duplicates) so Stripe does not retry
      res.status(200).json({
        success: true,
        received: true,
        duplicate: result.duplicate,
        type: result.type,
        handled: result.handled,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Cashfree webhook — HMAC on raw body (x-webhook-signature + x-webhook-timestamp).
   */
  async cashfreeWebhook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const signature = req.headers["x-webhook-signature"];
      const timestamp = req.headers["x-webhook-timestamp"];
      const raw = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(
            typeof req.body === "string" ? req.body : JSON.stringify(req.body || {})
          );

      const result = await billingWebhookService.processCashfreeWebhook(
        raw,
        typeof signature === "string" ? signature : undefined,
        typeof timestamp === "string" ? timestamp : undefined
      );

      res.status(200).json({
        success: true,
        received: true,
        duplicate: result.duplicate,
        type: result.type,
        handled: result.handled,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * After Cashfree return_url — confirm order server-side (never trust client paid flag).
   */
  async confirmCashfreeReturn(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }
      const orderId = String(
        (req.body as any)?.orderId || (req.query as any)?.order_id || ""
      ).trim();
      if (!orderId) {
        throw new BadRequestError("orderId is required");
      }
      const data = await billingWebhookService.confirmCashfreeOrderReturn({
        userId: req.user.userId,
        orderId,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.granted
          ? "Premium entitlement confirmed"
          : "Payment not completed yet",
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const billingController = new BillingController();
