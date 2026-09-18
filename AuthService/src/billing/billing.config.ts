/**
 * Billing / Stripe configuration — all credentials from environment.
 * Never log secret values. Never expose secret keys to clients.
 */

import { isStrictSecretsMode } from "../config";

export type BillingProviderKind = "stripe" | "sandbox" | "disabled";

export type BillingConfig = {
  provider: BillingProviderKind;
  enabled: boolean;
  /** Stripe secret key (sk_…) — server only. */
  secretKey: string;
  /** Webhook signing secret (whsec_…). */
  webhookSecret: string;
  /** Recurring Premium price id (price_…). */
  premiumPriceId: string;
  successUrl: string;
  cancelUrl: string;
  /** Optional pk_… — safe to expose to frontend. */
  publishableKey: string;
  /** Reject Stripe events older than this (replay window). */
  maxEventAgeSec: number;
};

function env(key: string): string {
  return (process.env[key] || "").trim();
}

/**
 * Resolve billing config.
 * - BILLING_PROVIDER=disabled → off
 * - BILLING_PROVIDER=sandbox → local signed webhooks + fake checkout (no Stripe network)
 * - BILLING_PROVIDER=stripe or STRIPE_SECRET_KEY set → Stripe
 * Strict/production: stripe requires all secrets when enabled.
 */
export function resolveBillingConfig(): BillingConfig {
  const explicit = (env("BILLING_PROVIDER") || "").toLowerCase();
  const secretKey = env("STRIPE_SECRET_KEY");
  const webhookSecret = env("STRIPE_WEBHOOK_SECRET");
  const premiumPriceId = env("STRIPE_PRICE_PREMIUM");
  const successUrl =
    env("STRIPE_SUCCESS_URL") ||
    "http://localhost:5173/billing/success?session_id={CHECKOUT_SESSION_ID}";
  const cancelUrl =
    env("STRIPE_CANCEL_URL") || "http://localhost:5173/billing/cancel";
  const publishableKey = env("STRIPE_PUBLISHABLE_KEY");
  // Default 24h replay window (was 48h). Override via STRIPE_WEBHOOK_MAX_AGE_SEC.
  const maxEventAgeSec = Number(env("STRIPE_WEBHOOK_MAX_AGE_SEC") || 86400);

  let provider: BillingProviderKind = "disabled";
  if (explicit === "disabled" || explicit === "off" || explicit === "none") {
    provider = "disabled";
  } else if (explicit === "sandbox") {
    provider = "sandbox";
  } else if (explicit === "stripe" || secretKey) {
    provider = "stripe";
  } else if (!isStrictSecretsMode() && env("BILLING_SANDBOX") === "true") {
    provider = "sandbox";
  }

  if (provider === "stripe" && isStrictSecretsMode()) {
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is required when billing provider is stripe");
    }
    if (!webhookSecret) {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET is required when billing provider is stripe"
      );
    }
    if (!premiumPriceId) {
      throw new Error(
        "STRIPE_PRICE_PREMIUM is required when billing provider is stripe"
      );
    }
    if (secretKey.includes("changeme") || secretKey === "sk_test_placeholder") {
      throw new Error("STRIPE_SECRET_KEY must not use a placeholder in production");
    }
  }

  if (provider === "sandbox") {
    return {
      provider: "sandbox",
      enabled: true,
      secretKey: secretKey || "sk_test_sandbox",
      webhookSecret: webhookSecret || "whsec_sandbox_algopath_test",
      premiumPriceId: premiumPriceId || "price_sandbox_premium",
      successUrl,
      cancelUrl,
      publishableKey: publishableKey || "pk_test_sandbox",
      maxEventAgeSec: Number.isFinite(maxEventAgeSec) ? maxEventAgeSec : 86400,
    };
  }

  if (provider === "stripe") {
    return {
      provider: "stripe",
      enabled: Boolean(secretKey && webhookSecret && premiumPriceId),
      secretKey,
      webhookSecret,
      premiumPriceId,
      successUrl,
      cancelUrl,
      publishableKey,
      maxEventAgeSec: Number.isFinite(maxEventAgeSec) ? maxEventAgeSec : 86400,
    };
  }

  return {
    provider: "disabled",
    enabled: false,
    secretKey: "",
    webhookSecret: "",
    premiumPriceId: "",
    successUrl,
    cancelUrl,
    publishableKey: "",
    maxEventAgeSec: 86400,
  };
}

let cached: BillingConfig | null = null;

export function getBillingConfig(): BillingConfig {
  if (!cached) cached = resolveBillingConfig();
  return cached;
}

/** Test helper — reset cache after env changes. */
export function resetBillingConfigCache(): void {
  cached = null;
}

/** Public-safe billing status for clients (no secrets). */
export function toPublicBillingConfig(cfg: BillingConfig = getBillingConfig()) {
  return {
    enabled: cfg.enabled,
    provider: cfg.provider === "disabled" ? "none" : cfg.provider,
    publishableKey: cfg.publishableKey || null,
  };
}
