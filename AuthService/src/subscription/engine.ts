/**
 * Entitlement engine — centralized feature access decisions.
 * Never scatter user.isPremium checks; call canAccessFeature / resolveEntitledFeatures.
 */

import {
  hasActivePremiumEntitlement,
  normalizeSubscription,
  resolveAccessTier,
  type AccessTier,
  type UserSubscription,
} from "./entitlement";
import {
  FEATURE_IDS,
  featuresForPlan,
  isKnownFeature,
  type FeatureId,
  type PlanId,
} from "./features";

export interface EntitlementSubject {
  subscription?: Partial<UserSubscription> | null;
  /** Extra feature grants (promo / admin) beyond plan — future-ready. */
  featureGrants?: string[] | null;
}

export interface EntitlementDecision {
  allowed: boolean;
  feature: string;
  known: boolean;
  accessTier: AccessTier;
  reason:
    | "allowed"
    | "unauthenticated"
    | "unknown_feature"
    | "premium_required";
}

function effectivePlan(
  sub: Partial<UserSubscription> | null | undefined,
  now: Date
): PlanId {
  if (hasActivePremiumEntitlement(sub, now)) return "PREMIUM";
  return "FREE";
}

/**
 * Resolve the set of features the subject may access.
 * Unknown grants are ignored (fail safe).
 */
export function resolveEntitledFeatures(
  subject: EntitlementSubject | null | undefined,
  now: Date = new Date()
): FeatureId[] {
  if (!subject) return [];

  const plan = effectivePlan(subject.subscription, now);
  const fromPlan = featuresForPlan(plan);
  const grants = (subject.featureGrants || [])
    .map(String)
    .filter(isKnownFeature);

  const set = new Set<FeatureId>([...fromPlan, ...grants]);
  // Stable order matching FEATURE_IDS
  return FEATURE_IDS.filter((f) => set.has(f));
}

export function canAccessFeature(
  subject: EntitlementSubject | null | undefined,
  feature: string,
  now: Date = new Date()
): EntitlementDecision {
  const accessTier = resolveAccessTier(
    subject ? { subscription: subject.subscription } : null,
    now
  );

  if (!subject) {
    return {
      allowed: false,
      feature,
      known: isKnownFeature(feature),
      accessTier: "GUEST",
      reason: "unauthenticated",
    };
  }

  if (!isKnownFeature(feature)) {
    return {
      allowed: false,
      feature,
      known: false,
      accessTier,
      reason: "unknown_feature",
    };
  }

  const entitled = resolveEntitledFeatures(subject, now);
  if (entitled.includes(feature)) {
    return {
      allowed: true,
      feature,
      known: true,
      accessTier,
      reason: "allowed",
    };
  }

  return {
    allowed: false,
    feature,
    known: true,
    accessTier,
    reason: "premium_required",
  };
}

/** Safe public payload for /me and entitlements endpoints. */
export function toPublicEntitlements(
  subject: EntitlementSubject | null | undefined,
  now: Date = new Date()
) {
  const accessTier = resolveAccessTier(
    subject ? { subscription: subject.subscription } : null,
    now
  );
  const features = resolveEntitledFeatures(subject, now);
  return {
    accessTier,
    features,
    /** Plan catalog id used for policy (not a security claim by itself). */
    plan: normalizeSubscription(subject?.subscription).plan,
  };
}
