import crypto from "crypto";
import Stripe from "stripe";
import { User } from "../models/user.model";
import { Subscription } from "../models/subscription.model";
import {
  BadRequestError,
  NotFoundError,
} from "../utils/errors/app.error";
import { getBillingConfig } from "./billing.config";
import { sandboxStore } from "./sandbox.store";
import { createCashfreePremiumOrder } from "./cashfree.client";

function assertBillingEnabled(enabled: boolean, message: string) {
  if (!enabled) {
    throw new BadRequestError(message, { code: "BILLING_DISABLED" });
  }
}

let stripeSingleton: Stripe | null = null;

export function getStripeClient(): Stripe {
  const cfg = getBillingConfig();
  if (cfg.provider !== "stripe" || !cfg.secretKey) {
    throw new BadRequestError("Stripe billing is not configured", {
      code: "BILLING_DISABLED",
    });
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(cfg.secretKey, {
      apiVersion: "2025-02-24.acacia",
      typescript: true,
    });
  }
  return stripeSingleton;
}

export function resetStripeClient(): void {
  stripeSingleton = null;
}

export type CheckoutResult = {
  sessionId: string;
  url: string;
  provider: "stripe" | "sandbox" | "cashfree";
  /** Cashfree-only: payment_session_id for optional JS SDK. */
  paymentSessionId?: string;
};

/**
 * Server-side Premium checkout. Never trusts client payment state.
 */
export class BillingCheckoutService {
  async createPremiumCheckout(input: {
    userId: string;
    email: string;
  }): Promise<CheckoutResult> {
    const cfg = getBillingConfig();
    assertBillingEnabled(
      cfg.enabled,
      "Premium billing is not enabled on this environment"
    );

    const user = await User.findById(input.userId).select("email subscription");
    if (!user) throw new NotFoundError("User not found");

    const live = await Subscription.findOne({
      userId: input.userId,
      endedAt: null,
      plan: "PREMIUM",
    });
    if (
      live &&
      (live.status === "ACTIVE" || live.status === "TRIALING") &&
      !live.cancelAtPeriodEnd
    ) {
      throw new BadRequestError("Premium subscription already active", {
        code: "ALREADY_SUBSCRIBED",
      });
    }

    if (cfg.provider === "sandbox") {
      const sessionId = `cs_test_sandbox_${crypto.randomBytes(8).toString("hex")}`;
      const customerId = `cus_sandbox_${input.userId.slice(-8)}`;
      const subscriptionId = `sub_sandbox_${crypto.randomBytes(6).toString("hex")}`;
      sandboxStore.put({
        id: sessionId,
        userId: input.userId,
        email: input.email || user.email,
        customerId,
        subscriptionId,
        priceId: cfg.premiumPriceId,
        status: "open",
        createdAt: Math.floor(Date.now() / 1000),
      });
      const url = cfg.successUrl.includes("{CHECKOUT_SESSION_ID}")
        ? cfg.successUrl.replace("{CHECKOUT_SESSION_ID}", sessionId)
        : `${cfg.successUrl}${cfg.successUrl.includes("?") ? "&" : "?"}session_id=${sessionId}`;
      return { sessionId, url, provider: "sandbox" };
    }

    if (cfg.provider === "cashfree") {
      const order = await createCashfreePremiumOrder({
        userId: input.userId,
        email: input.email || user.email,
        customerName: (user as any).name,
      });
      return {
        sessionId: order.orderId,
        url: order.url,
        provider: "cashfree",
        paymentSessionId: order.paymentSessionId,
      };
    }

    const stripe = getStripeClient();

    // Reuse Stripe customer if we already mapped one on a prior subscription
    let customerId: string | undefined;
    const prior = await Subscription.findOne({
      userId: input.userId,
      provider: "stripe",
      providerCustomerId: { $exists: true, $type: "string" },
    })
      .sort({ createdAt: -1 })
      .select("providerCustomerId");
    if (prior?.providerCustomerId) {
      customerId = prior.providerCustomerId;
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: input.email || user.email,
        metadata: { userId: input.userId },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: input.userId,
      line_items: [{ price: cfg.premiumPriceId, quantity: 1 }],
      success_url: cfg.successUrl,
      cancel_url: cfg.cancelUrl,
      metadata: { userId: input.userId },
      subscription_data: {
        metadata: { userId: input.userId },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new BadRequestError("Checkout session missing redirect URL");
    }

    return {
      sessionId: session.id,
      url: session.url,
      provider: "stripe",
    };
  }

  /** Propagate cancel-at-period-end to Stripe when applicable. */
  async providerCancelAtPeriodEnd(providerSubscriptionId: string): Promise<void> {
    const cfg = getBillingConfig();
    if (!cfg.enabled || cfg.provider === "sandbox") return;
    if (cfg.provider !== "stripe") return;
    const stripe = getStripeClient();
    await stripe.subscriptions.update(providerSubscriptionId, {
      cancel_at_period_end: true,
    });
  }

  async providerResume(providerSubscriptionId: string): Promise<void> {
    const cfg = getBillingConfig();
    if (!cfg.enabled || cfg.provider === "sandbox") return;
    if (cfg.provider !== "stripe") return;
    const stripe = getStripeClient();
    await stripe.subscriptions.update(providerSubscriptionId, {
      cancel_at_period_end: false,
    });
  }
}

export const billingCheckoutService = new BillingCheckoutService();
