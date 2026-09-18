/**
 * Maps Subscription ledger → User.subscription entitlement snapshot.
 * Entitlement hot paths keep reading User; billing SoT is Subscription.
 */

import type { ISubscription, SubscriptionStatus } from "../models/subscription.model";
import type {
  EntitlementSource,
  EntitlementStatus,
  UserSubscription,
} from "./entitlement";

export function mapProviderToEntitlementSource(
  provider: string | undefined
): EntitlementSource {
  if (provider === "admin") return "admin_grant";
  if (provider === "promo") return "promo";
  if (provider === "stripe" || provider === "manual") return "billing";
  return "default";
}

export function mapSubscriptionStatusToEntitlement(
  status: SubscriptionStatus,
  opts?: { cancelAtPeriodEnd?: boolean }
): EntitlementStatus {
  switch (status) {
    case "ACTIVE":
    case "TRIALING":
      return "active";
    case "PAST_DUE":
      return "grace";
    case "PAUSED":
    case "REFUNDED":
    case "EXPIRED":
      return "expired";
    case "CANCELLED":
      // Still entitled until period end when cancel_at_period_end
      if (opts?.cancelAtPeriodEnd) return "active";
      return "canceled";
    default:
      return "none";
  }
}

/** Build User.subscription denormalized snapshot from a Subscription doc. */
export function projectEntitlementSnapshot(
  sub: Pick<
    ISubscription,
    | "plan"
    | "status"
    | "provider"
    | "providerSubscriptionId"
    | "currentPeriodStart"
    | "currentPeriodEnd"
    | "cancelAtPeriodEnd"
  > | null
): UserSubscription {
  if (!sub || sub.plan === "FREE") {
    return {
      plan: "FREE",
      status: "none",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      gracePeriodEnd: null,
      source: "default",
      externalRef: null,
      updatedAt: new Date(),
    };
  }

  const entitlementStatus = mapSubscriptionStatusToEntitlement(sub.status, {
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
  });

  return {
    plan: "PREMIUM",
    status: entitlementStatus,
    currentPeriodStart: sub.currentPeriodStart ?? null,
    currentPeriodEnd: sub.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
    gracePeriodEnd:
      sub.status === "PAST_DUE" ? sub.currentPeriodEnd ?? null : null,
    source: mapProviderToEntitlementSource(sub.provider),
    externalRef: sub.providerSubscriptionId ?? null,
    updatedAt: new Date(),
  };
}
