/**
 * Detect impossible / abusive subscription lifecycle transitions.
 * Provider webhooks and admin paths must pass through assertAllowedTransition.
 */

import type { SubscriptionStatus } from "../models/subscription.model";
import { BadRequestError } from "../utils/errors/app.error";

/** Terminal ledger statuses — no further commercial reactivation via same row. */
export const TERMINAL_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "EXPIRED",
  "REFUNDED",
]);

/**
 * Allowed from→to edges. Missing edge = impossible (reject).
 * Same-status is always allowed (idempotent webhook).
 */
const ALLOWED: Record<SubscriptionStatus, ReadonlySet<SubscriptionStatus>> = {
  ACTIVE: new Set([
    "ACTIVE",
    "TRIALING",
    "PAST_DUE",
    "CANCELLED",
    "PAUSED",
    "EXPIRED",
    "REFUNDED",
  ]),
  TRIALING: new Set([
    "TRIALING",
    "ACTIVE",
    "PAST_DUE",
    "CANCELLED",
    "EXPIRED",
    "REFUNDED",
  ]),
  PAST_DUE: new Set([
    "PAST_DUE",
    "ACTIVE",
    "CANCELLED",
    "EXPIRED",
    "REFUNDED",
    "PAUSED",
  ]),
  PAUSED: new Set(["PAUSED", "ACTIVE", "CANCELLED", "EXPIRED", "REFUNDED"]),
  CANCELLED: new Set([
    "CANCELLED",
    "ACTIVE", // resume / new period via provider
    "EXPIRED",
    "REFUNDED",
  ]),
  EXPIRED: new Set(["EXPIRED", "ACTIVE", "TRIALING"]), // new checkout only via new live row
  REFUNDED: new Set(["REFUNDED", "ACTIVE", "TRIALING"]),
};

export function isAllowedSubscriptionTransition(
  from: SubscriptionStatus | null | undefined,
  to: SubscriptionStatus
): boolean {
  if (!from) return true; // first insert
  if (from === to) return true;
  const set = ALLOWED[from];
  return Boolean(set?.has(to));
}

export function assertAllowedTransition(
  from: SubscriptionStatus | null | undefined,
  to: SubscriptionStatus,
  opts?: { context?: string }
): void {
  if (isAllowedSubscriptionTransition(from, to)) return;
  throw new BadRequestError("Impossible subscription status transition", {
    code: "IMPOSSIBLE_SUBSCRIPTION_TRANSITION",
    from: from ?? null,
    to,
    context: opts?.context || "subscription",
  });
}

/**
 * Client-supplied plan/status patches are never accepted on user APIs.
 * Strip known abuse fields from arbitrary bodies.
 */
export const CLIENT_FORBIDDEN_SUBSCRIPTION_KEYS = [
  "plan",
  "status",
  "accessTier",
  "features",
  "featureGrants",
  "externalRef",
  "providerSubscriptionId",
  "providerCustomerId",
  "currentPeriodEnd",
  "currentPeriodStart",
  "gracePeriodEnd",
  "trialStart",
  "trialEnd",
  "endedAt",
] as const;

export function rejectClientEntitlementMutation(
  body: Record<string, unknown> | null | undefined
): void {
  if (!body || typeof body !== "object") return;
  for (const key of CLIENT_FORBIDDEN_SUBSCRIPTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      throw new BadRequestError(
        "Client cannot set entitlement or subscription fields",
        { code: "CLIENT_ENTITLEMENT_MUTATION_REJECTED", field: key }
      );
    }
  }
}
