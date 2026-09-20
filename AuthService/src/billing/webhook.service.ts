/**
 * Stripe / sandbox webhook verification + lifecycle sync.
 * Entitlements update only after verified provider events — never from client.
 */

import Stripe from "stripe";
import { User } from "../models/user.model";
import { Subscription } from "../models/subscription.model";
import { subscriptionService } from "../subscription/subscription.service";
import {
  BadRequestError,
  UnauthorizedError,
} from "../utils/errors/app.error";
import { writeAdminAudit } from "../utils/helpers/audit.helper";
import { getBillingConfig } from "./billing.config";
import { getStripeClient } from "./checkout.service";
import { sandboxStore } from "./sandbox.store";
import {
  mapStripeSubscriptionStatus,
  unixToDate,
} from "./stripeStatus.map";
import type { SubscriptionStatus } from "../models/subscription.model";
import { assertTrialAllowed } from "../subscription/trialAbuse";
import {
  verifyCashfreeWebhookSignature,
  fetchCashfreeOrder,
} from "./cashfree.client";

export type WebhookProcessResult = {
  received: true;
  duplicate: boolean;
  type: string;
  handled: boolean;
  userId?: string;
};

function asStripeEvent(raw: Buffer, signature: string): Stripe.Event {
  const cfg = getBillingConfig();
  if (!cfg.enabled || !cfg.webhookSecret) {
    throw new BadRequestError("Billing webhooks are not configured", {
      code: "BILLING_DISABLED",
    });
  }

  if (cfg.provider === "sandbox") {
    // Use Stripe's constructEvent with sandbox whsec — same crypto as production.
    return Stripe.webhooks.constructEvent(raw, signature, cfg.webhookSecret);
  }

  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(raw, signature, cfg.webhookSecret);
}

function assertNotReplay(event: Stripe.Event): void {
  const cfg = getBillingConfig();
  const age = Math.floor(Date.now() / 1000) - Number(event.created || 0);
  if (age > cfg.maxEventAgeSec) {
    throw new BadRequestError("Webhook event too old", {
      code: "WEBHOOK_REPLAY_REJECTED",
    });
  }
}

async function resolveUserIdFromStripeSub(
  sub: Stripe.Subscription
): Promise<string | null> {
  const metaUser = sub.metadata?.userId;
  if (metaUser) return String(metaUser);

  if (sub.id) {
    const existing = await Subscription.findOne({
      providerSubscriptionId: sub.id,
    }).select("userId");
    if (existing) return String(existing.userId);
  }

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (customerId) {
    const byCustomer = await Subscription.findOne({
      providerCustomerId: customerId,
    })
      .sort({ createdAt: -1 })
      .select("userId");
    if (byCustomer) return String(byCustomer.userId);

    try {
      const cfg = getBillingConfig();
      if (cfg.provider === "stripe") {
        const stripe = getStripeClient();
        const customer = await stripe.customers.retrieve(customerId);
        if (
          customer &&
          !("deleted" in customer && customer.deleted) &&
          customer.metadata?.userId
        ) {
          return String(customer.metadata.userId);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function applySubscriptionObject(
  sub: Stripe.Subscription,
  providerEventId: string,
  eventType: string
): Promise<{ duplicate: boolean; userId: string }> {
  const userId = await resolveUserIdFromStripeSub(sub);
  if (!userId) {
    throw new BadRequestError("Webhook subscription missing user mapping", {
      code: "WEBHOOK_USER_UNMAPPED",
    });
  }

  const user = await User.findById(userId).select("_id");
  if (!user) {
    throw new BadRequestError("Webhook user not found", {
      code: "WEBHOOK_USER_MISSING",
    });
  }

  const status = mapStripeSubscriptionStatus(sub.status);
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer?.id || null;

  const periodStart = unixToDate(sub.current_period_start);
  const periodEnd = unixToDate(sub.current_period_end);
  const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
  const ended =
    status === "CANCELLED" || status === "EXPIRED" || status === "REFUNDED";

  // Trial abuse: second trial for same user never entitles
  let effectiveStatus = status;
  if (status === "TRIALING") {
    try {
      await assertTrialAllowed(userId);
    } catch {
      effectiveStatus = "EXPIRED";
      await writeAdminAudit({
        actorId: userId,
        action: "billing.trial_abuse_blocked",
        resource: "subscription",
        resourceId: userId,
        before: { stripeStatus: sub.status },
        after: { status: "EXPIRED", code: "TRIAL_ALREADY_USED" },
      });
    }
  }

  // Fully canceled and not in period → end live row
  if (sub.status === "canceled" && !cancelAtPeriodEnd) {
    const dupCheck = await subscriptionService.recordProviderEvent({
      userId,
      providerEventId,
      provider: "stripe",
      type: eventType,
      toStatus: "CANCELLED",
      payload: { stripeStatus: sub.status },
    });
    if (dupCheck.duplicate) {
      return { duplicate: true, userId };
    }
    await subscriptionService.endLiveSubscription(userId, {
      status: "CANCELLED",
      reason: eventType,
    });
    return { duplicate: false, userId };
  }

  const result = await subscriptionService.upsertLiveSubscription({
    userId,
    plan: "PREMIUM",
    status:
      ended && !cancelAtPeriodEnd
        ? status
        : effectiveStatus,
    provider: "stripe",
    providerCustomerId: customerId,
    providerSubscriptionId: sub.id,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd,
    cancelledAt: cancelAtPeriodEnd
      ? unixToDate(sub.canceled_at) || new Date()
      : unixToDate(sub.canceled_at),
    endedAt:
      ended && !cancelAtPeriodEnd
        ? unixToDate(sub.ended_at) || new Date()
        : effectiveStatus === "EXPIRED" && status === "TRIALING"
          ? new Date()
          : null,
    trialStart: unixToDate(sub.trial_start),
    trialEnd: unixToDate(sub.trial_end),
    metadata: {
      stripeStatus: sub.status,
      priceId: sub.items?.data?.[0]?.price?.id,
      trialAbuseBlocked: effectiveStatus === "EXPIRED" && status === "TRIALING",
    },
    eventType,
    providerEventId,
  });

  return { duplicate: result.duplicateEvent, userId };
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  providerEventId: string,
  eventType: string
): Promise<{ duplicate: boolean; userId?: string }> {
  const userId =
    session.metadata?.userId ||
    session.client_reference_id ||
    null;
  if (!userId) {
    throw new BadRequestError("Checkout session missing userId", {
      code: "WEBHOOK_USER_UNMAPPED",
    });
  }

  if (session.mode !== "subscription") {
    return { duplicate: false, userId: String(userId) };
  }

  const subscriptionRef = session.subscription;
  const subscriptionId =
    typeof subscriptionRef === "string"
      ? subscriptionRef
      : subscriptionRef?.id;

  const customerRef = session.customer;
  const customerId =
    typeof customerRef === "string" ? customerRef : customerRef?.id || null;

  // Sandbox / incomplete: activate from session if no subscription object fetch
  const cfg = getBillingConfig();
  if (cfg.provider === "sandbox") {
    const sand = sandboxStore.complete(session.id);
    const subId = subscriptionId || sand?.subscriptionId;
    const cusId = customerId || sand?.customerId || null;
    if (!subId) {
      throw new BadRequestError("Sandbox checkout missing subscription id");
    }
    const now = Math.floor(Date.now() / 1000);
    const result = await subscriptionService.upsertLiveSubscription({
      userId: String(userId),
      plan: "PREMIUM",
      status: "ACTIVE",
      provider: "stripe",
      providerCustomerId: cusId,
      providerSubscriptionId: subId,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date((now + 30 * 86400) * 1000),
      cancelAtPeriodEnd: false,
      metadata: { checkoutSessionId: session.id, sandbox: true },
      eventType,
      providerEventId,
    });
    return { duplicate: result.duplicateEvent, userId: String(userId) };
  }

  if (!subscriptionId) {
    // Payment may still be processing — wait for subscription.created
    await subscriptionService.recordProviderEvent({
      userId: String(userId),
      providerEventId,
      provider: "stripe",
      type: eventType,
      payload: { checkoutSessionId: session.id, pendingSubscription: true },
    });
    return { duplicate: false, userId: String(userId) };
  }

  const stripe = getStripeClient();
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  return applySubscriptionObject(sub, providerEventId, eventType);
}

async function handleInvoiceEvent(
  invoice: Stripe.Invoice,
  providerEventId: string,
  eventType: string,
  failure: boolean
): Promise<{ duplicate: boolean; userId?: string }> {
  const subRef = invoice.subscription;
  const subscriptionId =
    typeof subRef === "string" ? subRef : subRef?.id || null;
  if (!subscriptionId) {
    return { duplicate: false };
  }

  const existing = await Subscription.findOne({
    providerSubscriptionId: subscriptionId,
  });
  let userId = existing ? String(existing.userId) : null;

  const cfg = getBillingConfig();
  let sub: Stripe.Subscription | null = null;
  if (cfg.provider === "stripe") {
    const stripe = getStripeClient();
    sub = await stripe.subscriptions.retrieve(subscriptionId);
    if (!userId) userId = await resolveUserIdFromStripeSub(sub);
  }

  if (!userId) {
    throw new BadRequestError("Invoice webhook missing user mapping", {
      code: "WEBHOOK_USER_UNMAPPED",
    });
  }

  if (failure) {
    const result = await subscriptionService.upsertLiveSubscription({
      userId,
      plan: "PREMIUM",
      status: "PAST_DUE",
      provider: "stripe",
      providerCustomerId:
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id || existing?.providerCustomerId || null,
      providerSubscriptionId: subscriptionId,
      currentPeriodStart: sub
        ? unixToDate(sub.current_period_start)
        : existing?.currentPeriodStart,
      currentPeriodEnd: sub
        ? unixToDate(sub.current_period_end)
        : existing?.currentPeriodEnd,
      cancelAtPeriodEnd: sub
        ? Boolean(sub.cancel_at_period_end)
        : Boolean(existing?.cancelAtPeriodEnd),
      metadata: { lastInvoice: invoice.id, failure: true },
      eventType,
      providerEventId,
    });
    return { duplicate: result.duplicateEvent, userId };
  }

  if (sub) {
    return applySubscriptionObject(sub, providerEventId, eventType);
  }

  // Sandbox success invoice
  const result = await subscriptionService.upsertLiveSubscription({
    userId,
    plan: "PREMIUM",
    status: "ACTIVE",
    provider: "stripe",
    providerSubscriptionId: subscriptionId,
    providerCustomerId:
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id || null,
    eventType,
    providerEventId,
  });
  return { duplicate: result.duplicateEvent, userId };
}

async function handleChargeRefunded(
  charge: Stripe.Charge,
  providerEventId: string,
  eventType: string
): Promise<{ duplicate: boolean; userId?: string }> {
  const invoiceId =
    typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id;
  // Best-effort: find live stripe sub for this customer and mark REFUNDED
  const customerId =
    typeof charge.customer === "string" ? charge.customer : charge.customer?.id;
  if (!customerId) return { duplicate: false };

  const live = await Subscription.findOne({
    providerCustomerId: customerId,
    endedAt: null,
  });
  if (!live) return { duplicate: false };

  const userId = String(live.userId);
  const fullyRefunded =
    charge.refunded ||
    (charge.amount_refunded != null &&
      charge.amount != null &&
      charge.amount_refunded >= charge.amount);

  if (!fullyRefunded) {
    await subscriptionService.recordProviderEvent({
      userId,
      subscriptionId: String(live._id),
      providerEventId,
      provider: "stripe",
      type: eventType,
      payload: { partial: true, invoiceId },
    });
    return { duplicate: false, userId };
  }

  const dup = await subscriptionService.recordProviderEvent({
    userId,
    subscriptionId: String(live._id),
    providerEventId,
    provider: "stripe",
    type: eventType,
    fromStatus: live.status,
    toStatus: "REFUNDED",
  });
  if (dup.duplicate) return { duplicate: true, userId };

  await subscriptionService.endLiveSubscription(userId, {
    status: "REFUNDED",
    reason: eventType,
  });
  return { duplicate: false, userId };
}

export class BillingWebhookService {
  async processRawWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined
  ): Promise<WebhookProcessResult> {
    if (!signatureHeader) {
      throw new UnauthorizedError("Missing Stripe-Signature header", {
        code: "WEBHOOK_SIGNATURE_MISSING",
      });
    }

    let event: Stripe.Event;
    try {
      event = asStripeEvent(rawBody, signatureHeader);
    } catch (err: any) {
      if (err?.statusCode) throw err;
      throw new UnauthorizedError("Invalid webhook signature", {
        code: "WEBHOOK_SIGNATURE_INVALID",
        detail: err?.message,
      });
    }

    assertNotReplay(event);

    const type = event.type;
    const providerEventId = event.id;
    let outcome: { duplicate: boolean; userId?: string; handled?: boolean } = {
      duplicate: false,
      handled: false,
    };

    try {
      switch (type) {
        case "checkout.session.completed": {
          outcome = {
            ...(await handleCheckoutCompleted(
              event.data.object as Stripe.Checkout.Session,
              providerEventId,
              type
            )),
            handled: true,
          };
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          outcome = {
            ...(await applySubscriptionObject(
              event.data.object as Stripe.Subscription,
              providerEventId,
              type
            )),
            handled: true,
          };
          break;
        }
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const userId = await resolveUserIdFromStripeSub(sub);
          if (!userId) break;
          const dup = await subscriptionService.recordProviderEvent({
            userId,
            providerEventId,
            provider: "stripe",
            type,
            toStatus: "CANCELLED" as SubscriptionStatus,
          });
          if (dup.duplicate) {
            outcome = { duplicate: true, userId, handled: true };
            break;
          }
          await subscriptionService.endLiveSubscription(userId, {
            status: "EXPIRED",
            reason: type,
          });
          outcome = { duplicate: false, userId, handled: true };
          break;
        }
        case "invoice.payment_failed": {
          outcome = {
            ...(await handleInvoiceEvent(
              event.data.object as Stripe.Invoice,
              providerEventId,
              type,
              true
            )),
            handled: true,
          };
          break;
        }
        case "invoice.paid":
        case "invoice.payment_succeeded": {
          outcome = {
            ...(await handleInvoiceEvent(
              event.data.object as Stripe.Invoice,
              providerEventId,
              type,
              false
            )),
            handled: true,
          };
          break;
        }
        case "charge.refunded": {
          outcome = {
            ...(await handleChargeRefunded(
              event.data.object as Stripe.Charge,
              providerEventId,
              type
            )),
            handled: true,
          };
          break;
        }
        default:
          // Acknowledge unknown / unhandled event types (avoid Stripe retries)
          outcome = { duplicate: false, handled: false };
          break;
      }
    } catch (err: any) {
      // Duplicate unique index races → treat as success idempotent
      if (err?.details?.code === "DUPLICATE_PROVIDER_EVENT" || err?.code === 11000) {
        return {
          received: true,
          duplicate: true,
          type,
          handled: true,
        };
      }
      throw err;
    }

    if (outcome.handled && outcome.userId && !outcome.duplicate) {
      await writeAdminAudit({
        actorId: outcome.userId,
        action: `billing.webhook.${type}`,
        resource: "subscription",
        resourceId: outcome.userId,
        after: { eventId: providerEventId, type },
      });
    }

    return {
      received: true,
      duplicate: Boolean(outcome.duplicate),
      type,
      handled: Boolean(outcome.handled),
      userId: outcome.userId,
    };
  }

  /**
   * Cashfree PG webhook — HMAC verified on raw body.
   * Grants PREMIUM for CASHFREE_PREMIUM_DAYS on successful payment.
   */
  async processCashfreeWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined,
    timestampHeader: string | undefined
  ): Promise<WebhookProcessResult> {
    const cfg = getBillingConfig();
    if (!cfg.enabled || cfg.provider !== "cashfree") {
      throw new BadRequestError("Cashfree webhooks are not enabled", {
        code: "BILLING_DISABLED",
      });
    }

    try {
      verifyCashfreeWebhookSignature({
        rawBody,
        signature: signatureHeader,
        timestamp: timestampHeader,
        secretKey: cfg.cashfreeSecretKey,
        maxAgeSec: cfg.maxEventAgeSec,
      });
    } catch (err: any) {
      if (err?.statusCode) throw err;
      throw new UnauthorizedError("Invalid Cashfree webhook signature", {
        code: "WEBHOOK_SIGNATURE_INVALID",
        detail: err?.message,
      });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new BadRequestError("Invalid Cashfree webhook JSON", {
        code: "WEBHOOK_PAYLOAD_INVALID",
      });
    }

    const type = String(payload?.type || payload?.event || "cashfree.unknown");
    const data = payload?.data || {};
    const order = data.order || data.order_details || {};
    const payment = data.payment || {};
    const orderId = String(
      order.order_id || payload?.order_id || payment.order_id || ""
    );
    const paymentId = String(
      payment.cf_payment_id || payment.payment_id || orderId || type
    );
    const providerEventId = `cashfree:${type}:${paymentId}`;

    const paymentStatus = String(
      payment.payment_status || order.order_status || ""
    ).toUpperCase();
    const successTypes = new Set([
      "PAYMENT_SUCCESS_WEBHOOK",
      "PAYMENT_SUCCESS",
      "ORDER_PAID",
      "PAYMENT_CHARGES_WEBHOOK",
    ]);
    const isSuccess =
      successTypes.has(type.toUpperCase()) ||
      paymentStatus === "SUCCESS" ||
      paymentStatus === "PAID" ||
      String(order.order_status || "").toUpperCase() === "PAID";

    if (!isSuccess) {
      return {
        received: true,
        duplicate: false,
        type,
        handled: false,
      };
    }

    if (!orderId) {
      throw new BadRequestError("Cashfree webhook missing order_id", {
        code: "WEBHOOK_ORDER_MISSING",
      });
    }

    let userId =
      String(order.order_tags?.userId || order.order_tags?.userid || "") ||
      String(data.customer_details?.customer_id || "");

    // Confirm with Cashfree order API when tags missing
    if (!userId || !/^[a-f0-9]{24}$/i.test(userId)) {
      try {
        const live = await fetchCashfreeOrder(orderId);
        userId = live.orderTags.userId || live.orderTags.userid || userId;
        if (
          live.orderStatus &&
          !["PAID", "ACTIVE"].includes(live.orderStatus)
        ) {
          return {
            received: true,
            duplicate: false,
            type,
            handled: false,
          };
        }
      } catch {
        /* use webhook payload only */
      }
    }

    if (!userId) {
      throw new BadRequestError("Cashfree webhook missing user mapping", {
        code: "WEBHOOK_USER_UNMAPPED",
      });
    }

    const user = await User.findById(userId).select("_id");
    if (!user) {
      throw new BadRequestError("Cashfree webhook user not found", {
        code: "WEBHOOK_USER_MISSING",
      });
    }

    const now = new Date();
    const periodEnd = new Date(
      now.getTime() + cfg.cashfreePremiumDays * 86400000
    );

    let outcome: { duplicate: boolean; userId: string; handled: boolean };
    try {
      const result = await subscriptionService.upsertLiveSubscription({
        userId: String(userId),
        plan: "PREMIUM",
        status: "ACTIVE",
        provider: "cashfree",
        providerCustomerId: String(
          data.customer_details?.customer_id || userId
        ).slice(0, 200),
        providerSubscriptionId: orderId,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        metadata: {
          cashfreeType: type,
          paymentId,
          orderAmount: order.order_amount,
          premiumDays: cfg.cashfreePremiumDays,
        },
        eventType: type,
        providerEventId,
      });
      outcome = {
        duplicate: result.duplicateEvent,
        userId: String(userId),
        handled: true,
      };
    } catch (err: any) {
      if (
        err?.details?.code === "DUPLICATE_PROVIDER_EVENT" ||
        err?.code === 11000
      ) {
        return {
          received: true,
          duplicate: true,
          type,
          handled: true,
          userId: String(userId),
        };
      }
      throw err;
    }

    if (outcome.handled && !outcome.duplicate) {
      await writeAdminAudit({
        actorId: outcome.userId,
        action: `billing.webhook.cashfree.${type}`,
        resource: "subscription",
        resourceId: outcome.userId,
        after: { eventId: providerEventId, type, orderId },
      });
    }

    return {
      received: true,
      duplicate: outcome.duplicate,
      type,
      handled: outcome.handled,
      userId: outcome.userId,
    };
  }

  /**
   * Confirm Cashfree return_url: fetch order and grant if PAID (idempotent).
   * Used when webhooks are delayed — never trusts client "paid" flag alone.
   */
  async confirmCashfreeOrderReturn(input: {
    userId: string;
    orderId: string;
  }): Promise<{ granted: boolean; duplicate: boolean; status: string }> {
    const cfg = getBillingConfig();
    if (cfg.provider !== "cashfree" || !cfg.enabled) {
      throw new BadRequestError("Cashfree billing is not enabled", {
        code: "BILLING_DISABLED",
      });
    }
    const order = await fetchCashfreeOrder(input.orderId);
    const tagUser = order.orderTags.userId || order.orderTags.userid;
    if (tagUser && String(tagUser) !== String(input.userId)) {
      throw new UnauthorizedError("Order does not belong to this user", {
        code: "WEBHOOK_USER_MISMATCH",
      });
    }
    if (!["PAID", "ACTIVE"].includes(order.orderStatus)) {
      return {
        granted: false,
        duplicate: false,
        status: order.orderStatus || "UNKNOWN",
      };
    }

    const now = new Date();
    const periodEnd = new Date(
      now.getTime() + cfg.cashfreePremiumDays * 86400000
    );
    const providerEventId = `cashfree:return:${order.orderId}`;
    const result = await subscriptionService.upsertLiveSubscription({
      userId: input.userId,
      plan: "PREMIUM",
      status: "ACTIVE",
      provider: "cashfree",
      providerCustomerId: input.userId,
      providerSubscriptionId: order.orderId,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      metadata: {
        confirmedVia: "return_url",
        orderStatus: order.orderStatus,
        premiumDays: cfg.cashfreePremiumDays,
      },
      eventType: "cashfree.return_confirm",
      providerEventId,
    });

    return {
      granted: true,
      duplicate: result.duplicateEvent,
      status: order.orderStatus,
    };
  }
}

export const billingWebhookService = new BillingWebhookService();
