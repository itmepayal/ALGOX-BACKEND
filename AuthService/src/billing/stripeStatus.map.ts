/**
 * Maps Stripe subscription / invoice states → ledger SubscriptionStatus.
 */

import type { SubscriptionStatus } from "../models/subscription.model";

export function mapStripeSubscriptionStatus(
  stripeStatus: string | null | undefined
): SubscriptionStatus {
  switch (String(stripeStatus || "").toLowerCase()) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "paused":
      return "PAUSED";
    case "canceled":
    case "cancelled":
      return "CANCELLED";
    case "incomplete_expired":
      return "EXPIRED";
    case "incomplete":
      // Not entitled until first invoice succeeds — never grant grace/PAST_DUE.
      return "EXPIRED";
    default:
      // Unknown Stripe states fail closed (no premium access).
      return "EXPIRED";
  }
}

export function unixToDate(sec: number | null | undefined): Date | null {
  if (sec == null || !Number.isFinite(Number(sec))) return null;
  return new Date(Number(sec) * 1000);
}
