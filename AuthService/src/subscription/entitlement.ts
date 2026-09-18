/**
 * Subscription / entitlement foundation.
 *
 * Platform role (user/admin/staff) and subscription plan are separate concepts.
 * Access tiers GUEST | FREE | PREMIUM are *derived* — never stored as the sole source of truth.
 */

/** Catalog plan ids. Extend later (e.g. PREMIUM_PLUS) without renaming FREE/PREMIUM. */
export type SubscriptionPlanId = "FREE" | "PREMIUM";

/**
 * Entitlement lifecycle for the assigned plan.
 * FREE users use status "none" (no paid entitlement) or may omit paid fields.
 */
export type EntitlementStatus =
  | "none"
  | "active"
  | "canceled"
  | "past_due"
  | "expired"
  | "grace";

/** How the entitlement was granted — never payment secrets. */
export type EntitlementSource =
  | "default"
  | "admin_grant"
  | "promo"
  | "billing";

/** Derived product access state (computed, not persisted as a boolean). */
export type AccessTier = "GUEST" | "FREE" | "PREMIUM";

export interface UserSubscription {
  plan: SubscriptionPlanId;
  status: EntitlementStatus;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  gracePeriodEnd?: Date | null;
  source?: EntitlementSource;
  /** Opaque billing reference (Stripe subscription id, etc.) — never returned to clients. */
  externalRef?: string | null;
  updatedAt?: Date | null;
}

/** Safe subset exposed to clients / admin UI. */
export interface PublicSubscription {
  plan: SubscriptionPlanId;
  status: EntitlementStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  gracePeriodEnd: string | null;
  source: EntitlementSource;
}

export const DEFAULT_SUBSCRIPTION: UserSubscription = {
  plan: "FREE",
  status: "none",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  gracePeriodEnd: null,
  source: "default",
  externalRef: null,
  updatedAt: null,
};

const PAID_PLANS: ReadonlySet<SubscriptionPlanId> = new Set(["PREMIUM"]);

function asDate(v: unknown): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Normalize missing/legacy documents to FREE defaults without requiring a migration. */
export function normalizeSubscription(
  raw: Partial<UserSubscription> | null | undefined
): UserSubscription {
  const plan =
    raw?.plan === "PREMIUM" || raw?.plan === "FREE" ? raw.plan : "FREE";
  const status: EntitlementStatus =
    raw?.status === "active" ||
    raw?.status === "canceled" ||
    raw?.status === "past_due" ||
    raw?.status === "expired" ||
    raw?.status === "grace" ||
    raw?.status === "none"
      ? raw.status
      : plan === "FREE"
        ? "none"
        : "none";
  const source: EntitlementSource =
    raw?.source === "admin_grant" ||
    raw?.source === "promo" ||
    raw?.source === "billing" ||
    raw?.source === "default"
      ? raw.source
      : "default";

  return {
    plan,
    status,
    currentPeriodStart: asDate(raw?.currentPeriodStart) ?? null,
    currentPeriodEnd: asDate(raw?.currentPeriodEnd) ?? null,
    cancelAtPeriodEnd: Boolean(raw?.cancelAtPeriodEnd),
    gracePeriodEnd: asDate(raw?.gracePeriodEnd) ?? null,
    source,
    externalRef: raw?.externalRef ?? null,
    updatedAt: asDate(raw?.updatedAt) ?? null,
  };
}

/**
 * Active paid entitlement — supports expiry, grace, and future plans.
 * FREE plan never counts as premium.
 */
export function hasActivePremiumEntitlement(
  raw: Partial<UserSubscription> | null | undefined,
  now: Date = new Date()
): boolean {
  const sub = normalizeSubscription(raw);
  if (!PAID_PLANS.has(sub.plan)) return false;

  const t = now.getTime();
  if (sub.status === "grace") {
    const graceEnd = sub.gracePeriodEnd?.getTime();
    if (graceEnd != null && graceEnd >= t) return true;
    // Grace without end date: treat as active only until period end if present
  }

  if (sub.status !== "active" && sub.status !== "grace") return false;

  const periodEnd = sub.currentPeriodEnd?.getTime();
  if (periodEnd != null && periodEnd < t) {
    // Expired period — still premium only during grace window
    const graceEnd = sub.gracePeriodEnd?.getTime();
    return graceEnd != null && graceEnd >= t;
  }

  // null currentPeriodEnd = open-ended admin/promo grant
  return true;
}

/** Guest when unauthenticated; otherwise FREE or PREMIUM from entitlement. */
export function resolveAccessTier(
  user: { subscription?: Partial<UserSubscription> | null } | null | undefined,
  now: Date = new Date()
): AccessTier {
  if (!user) return "GUEST";
  if (hasActivePremiumEntitlement(user.subscription, now)) return "PREMIUM";
  return "FREE";
}

export function toPublicSubscription(
  raw: Partial<UserSubscription> | null | undefined
): PublicSubscription {
  const sub = normalizeSubscription(raw);
  return {
    plan: sub.plan,
    status: sub.status,
    currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
    gracePeriodEnd: sub.gracePeriodEnd?.toISOString() ?? null,
    source: sub.source || "default",
  };
}
