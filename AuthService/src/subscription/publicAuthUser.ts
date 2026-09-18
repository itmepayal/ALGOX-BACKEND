import { toPublicSubscription } from "./entitlement";
import { toPublicEntitlements } from "./engine";

/** Safe user fields for auth responses — never includes externalRef or secrets. */
export function toPublicAuthUser(u: any) {
  const subscription = toPublicSubscription(u?.subscription);
  const entitlements = toPublicEntitlements({
    subscription: u?.subscription,
    featureGrants: u?.featureGrants,
  });
  return {
    id: u._id?.toString?.() || u.id,
    name: u.name,
    email: u.email,
    avatar: u.avatar || "",
    role: u.role,
    status: u.status || "active",
    isEmailVerified: Boolean(u.isEmailVerified),
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
    subscription,
    accessTier: entitlements.accessTier,
    /** Features entitled for UI hints — backend still enforces. */
    features: entitlements.features,
  };
}
