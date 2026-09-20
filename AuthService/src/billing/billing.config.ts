/**
 * Billing configuration — Stripe, Cashfree, or sandbox.
 * Never log secret values. Never expose secret keys to clients.
 */

import { isStrictSecretsMode } from "../config";

export type BillingProviderKind =
  | "stripe"
  | "cashfree"
  | "sandbox"
  | "disabled";

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

  /** Cashfree App ID (x-client-id). */
  cashfreeAppId: string;
  /** Cashfree secret key (x-client-secret) — also used for webhook HMAC. */
  cashfreeSecretKey: string;
  /** sandbox | production */
  cashfreeEnv: "sandbox" | "production";
  cashfreeApiVersion: string;
  /** Premium order amount in major currency units (e.g. 499 INR). */
  cashfreePremiumAmount: number;
  cashfreePremiumCurrency: string;
  /** Days of Premium entitlement after a successful Cashfree payment. */
  cashfreePremiumDays: number;
  cashfreeSuccessUrl: string;
  cashfreeCancelUrl: string;
};

function env(key: string): string {
  return (process.env[key] || "").trim();
}

/**
 * Resolve billing config.
 * - BILLING_PROVIDER=disabled → off
 * - BILLING_PROVIDER=sandbox → local signed webhooks + fake checkout
 * - BILLING_PROVIDER=stripe or STRIPE_SECRET_KEY set → Stripe
 * - BILLING_PROVIDER=cashfree or CASHFREE_APP_ID set → Cashfree
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
  const maxEventAgeSec = Number(env("STRIPE_WEBHOOK_MAX_AGE_SEC") || 86400);

  const cashfreeAppId = env("CASHFREE_APP_ID");
  const cashfreeSecretKey = env("CASHFREE_SECRET_KEY");
  // Accept CASHFREE_ENV or CASHFREE_ENVIRONMENT (SANDBOX / PRODUCTION)
  const cashfreeEnvRaw = (
    env("CASHFREE_ENV") ||
    env("CASHFREE_ENVIRONMENT") ||
    "sandbox"
  ).toLowerCase();
  const cashfreeEnv =
    cashfreeEnvRaw === "production" || cashfreeEnvRaw === "prod"
      ? "production"
      : "sandbox";
  // Latest Cashfree Payments API version per official docs (do not mix versions).
  const cashfreeApiVersion = env("CASHFREE_API_VERSION") || "2025-01-01";
  const cashfreePremiumAmount = Number(env("CASHFREE_PREMIUM_AMOUNT") || 499);
  const cashfreePremiumCurrency = (
    env("CASHFREE_PREMIUM_CURRENCY") || "INR"
  ).toUpperCase();
  const cashfreePremiumDays = Math.max(
    1,
    Number(env("CASHFREE_PREMIUM_DAYS") || 30)
  );
  const cashfreeSuccessUrl =
    env("CASHFREE_SUCCESS_URL") ||
    "http://localhost:5173/?billing=success&order_id={order_id}";
  const cashfreeCancelUrl =
    env("CASHFREE_CANCEL_URL") || "http://localhost:5173/?billing=cancel";

  let provider: BillingProviderKind = "disabled";
  if (explicit === "disabled" || explicit === "off" || explicit === "none") {
    provider = "disabled";
  } else if (explicit === "sandbox") {
    provider = "sandbox";
  } else if (explicit === "cashfree" || (cashfreeAppId && cashfreeSecretKey)) {
    provider = "cashfree";
  } else if (explicit === "stripe" || secretKey) {
    provider = "stripe";
  } else if (!isStrictSecretsMode() && env("BILLING_SANDBOX") === "true") {
    provider = "sandbox";
  }

  const cashfreeBlock = {
    cashfreeAppId,
    cashfreeSecretKey,
    cashfreeEnv: cashfreeEnv as "sandbox" | "production",
    cashfreeApiVersion,
    cashfreePremiumAmount: Number.isFinite(cashfreePremiumAmount)
      ? cashfreePremiumAmount
      : 499,
    cashfreePremiumCurrency,
    cashfreePremiumDays,
    cashfreeSuccessUrl,
    cashfreeCancelUrl,
  };

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

  if (provider === "cashfree" && isStrictSecretsMode()) {
    if (!cashfreeAppId || !cashfreeSecretKey) {
      throw new Error(
        "CASHFREE_APP_ID and CASHFREE_SECRET_KEY are required when billing provider is cashfree"
      );
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
      ...cashfreeBlock,
    };
  }

  if (provider === "cashfree") {
    return {
      provider: "cashfree",
      enabled: Boolean(cashfreeAppId && cashfreeSecretKey),
      secretKey: "",
      webhookSecret: "",
      premiumPriceId: "",
      successUrl: cashfreeSuccessUrl,
      cancelUrl: cashfreeCancelUrl,
      publishableKey: "",
      maxEventAgeSec: Number.isFinite(maxEventAgeSec) ? maxEventAgeSec : 86400,
      ...cashfreeBlock,
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
      ...cashfreeBlock,
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
    ...cashfreeBlock,
    cashfreeAppId: "",
    cashfreeSecretKey: "",
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
    publishableKey:
      cfg.provider === "stripe" ? cfg.publishableKey || null : null,
    /** Cashfree client mode for JS SDK if used — never the secret. */
    cashfreeEnv: cfg.provider === "cashfree" ? cfg.cashfreeEnv : null,
  };
}

export function cashfreeApiBase(cfg: BillingConfig = getBillingConfig()): string {
  return cfg.cashfreeEnv === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}
