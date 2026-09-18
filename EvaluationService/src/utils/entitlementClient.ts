/**
 * Resolve entitlements from AuthService (DB SoT). JWT alone is never a grant.
 */
import axios from "axios";
import { serverConfig } from "../config";

export type EntitlementSnapshot = {
  accessTier: "GUEST" | "FREE" | "PREMIUM";
  features: Set<string>;
};

const EMPTY: EntitlementSnapshot = {
  accessTier: "GUEST",
  features: new Set(),
};

export async function resolveEntitlements(
  authorization?: string | null
): Promise<EntitlementSnapshot> {
  const auth =
    typeof authorization === "string" && authorization.startsWith("Bearer ")
      ? authorization
      : null;
  if (!auth) return EMPTY;

  try {
    const base = String(serverConfig.AUTH_SERVICE_URL || "http://localhost:3001").replace(
      /\/$/,
      ""
    );
    const res = await axios.get(`${base}/api/v1/auth/entitlements/me`, {
      headers: { Authorization: auth },
      timeout: 4000,
      validateStatus: () => true,
    });
    if (res.status !== 200 || !res.data?.data) return EMPTY;
    const data = res.data.data;
    const features = Array.isArray(data.features)
      ? new Set<string>(data.features.map(String))
      : new Set<string>();
    const tier = String(data.accessTier || "FREE").toUpperCase();
    return {
      accessTier:
        tier === "PREMIUM" ? "PREMIUM" : tier === "GUEST" ? "GUEST" : "FREE",
      features,
    };
  } catch {
    return EMPTY;
  }
}

export function hasFeature(
  snap: EntitlementSnapshot,
  feature: string
): boolean {
  return snap.features.has(feature);
}
