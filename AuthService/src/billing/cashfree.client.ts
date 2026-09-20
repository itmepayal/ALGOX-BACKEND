/**
 * Cashfree Payments PG — create order + verify webhooks.
 * Secrets stay server-side; client only receives payment_session_id (+ optional fallback URL).
 */
import crypto from "crypto";
import axios from "axios";
import {
  cashfreeApiBase,
  getBillingConfig,
  type BillingConfig,
} from "./billing.config";
import { BadRequestError } from "../utils/errors/app.error";
import logger from "../config/logger.config";

export type CashfreeCreateOrderResult = {
  orderId: string;
  paymentSessionId: string;
  /** Prefer Cashfree.js checkout(paymentSessionId). URL is a last-resort fallback. */
  url: string;
  amount: number;
  currency: string;
};

function cashfreeHeaders(cfg: BillingConfig) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "x-api-version": cfg.cashfreeApiVersion,
    "x-client-id": cfg.cashfreeAppId,
    "x-client-secret": cfg.cashfreeSecretKey,
  };
}

function debugCashfree(payload: Record<string, unknown>): void {
  if (process.env.DEBUG_CASHFREE !== "true") return;
  logger.info("[CASHFREE DEBUG]", payload);
}

export function buildCashfreeOrderId(userId: string): string {
  const short = String(userId).replace(/[^a-zA-Z0-9]/g, "").slice(-10);
  const rnd = crypto.randomBytes(4).toString("hex");
  // Cashfree order_id: alphanumeric + underscore, max ~50
  return `ALGOPATH_${short}_${Date.now()}_${rnd}`.slice(0, 50);
}

/**
 * Verify Cashfree webhook HMAC.
 * signature = Base64(HMAC-SHA256(timestamp + rawBody, secretKey))
 */
export function verifyCashfreeWebhookSignature(input: {
  rawBody: string | Buffer;
  signature: string | undefined;
  timestamp: string | undefined;
  secretKey: string;
  maxAgeSec?: number;
}): void {
  const { rawBody, signature, timestamp, secretKey } = input;
  if (!signature || !timestamp) {
    throw new BadRequestError("Missing Cashfree webhook signature headers", {
      code: "WEBHOOK_SIGNATURE_MISSING",
    });
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    throw new BadRequestError("Invalid Cashfree webhook timestamp", {
      code: "WEBHOOK_TIMESTAMP_INVALID",
    });
  }
  const maxAge = input.maxAgeSec ?? 86400;
  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (ageSec > maxAge) {
    throw new BadRequestError("Cashfree webhook event too old", {
      code: "WEBHOOK_REPLAY_REJECTED",
    });
  }

  const body =
    typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const expected = crypto
    .createHmac("sha256", secretKey)
    .update(timestamp + body)
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new BadRequestError("Cashfree webhook signature mismatch", {
      code: "WEBHOOK_SIGNATURE_INVALID",
    });
  }
}

function sanitizePhone(raw?: string | null): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  // Cashfree requires a valid phone; sandbox accepts a fixed test number.
  return "9999999999";
}

export async function createCashfreePremiumOrder(input: {
  userId: string;
  email: string;
  customerName?: string;
}): Promise<CashfreeCreateOrderResult> {
  const cfg = getBillingConfig();
  if (cfg.provider !== "cashfree" || !cfg.enabled) {
    throw new BadRequestError("Cashfree billing is not configured", {
      code: "BILLING_DISABLED",
    });
  }
  if (!cfg.cashfreeAppId || !cfg.cashfreeSecretKey) {
    throw new BadRequestError("Cashfree credentials missing", {
      code: "BILLING_DISABLED",
    });
  }

  const orderId = buildCashfreeOrderId(input.userId);
  const returnUrl = cfg.cashfreeSuccessUrl.includes("{order_id}")
    ? cfg.cashfreeSuccessUrl.replace(/\{order_id\}/g, orderId)
    : `${cfg.cashfreeSuccessUrl}${cfg.cashfreeSuccessUrl.includes("?") ? "&" : "?"}order_id=${orderId}`;

  const customerId = `user_${String(input.userId).replace(/[^a-zA-Z0-9_-]/g, "").slice(-40)}`;
  const email =
    input.email && input.email.includes("@")
      ? input.email
      : "user@algopath.local";
  const name = (input.customerName || "AlgoPath User").trim().slice(0, 100) || "AlgoPath User";

  const payload = {
    order_id: orderId,
    order_amount: cfg.cashfreePremiumAmount,
    order_currency: cfg.cashfreePremiumCurrency,
    customer_details: {
      customer_id: customerId.slice(0, 50),
      customer_name: name,
      customer_email: email,
      customer_phone: sanitizePhone(null),
    },
    order_meta: {
      return_url: returnUrl,
    },
    order_note: "AlgoPath Premium",
    order_tags: {
      userId: String(input.userId),
      plan: "PREMIUM",
      product: "algopath_premium",
    },
  };

  const endpointPath = "/orders";
  const url = `${cashfreeApiBase(cfg)}${endpointPath}`;

  debugCashfree({
    provider: "cashfree",
    operation: "create_order",
    environment: cfg.cashfreeEnv,
    baseUrl: cashfreeApiBase(cfg),
    endpointPath,
    method: "POST",
    apiVersion: cfg.cashfreeApiVersion,
    appIdPresent: Boolean(cfg.cashfreeAppId),
    secretPresent: Boolean(cfg.cashfreeSecretKey),
    orderId,
    amount: cfg.cashfreePremiumAmount,
    currency: cfg.cashfreePremiumCurrency,
  });

  let res;
  try {
    res = await axios.post(url, payload, {
      headers: cashfreeHeaders(cfg),
      timeout: 20000,
      validateStatus: () => true,
    });
  } catch (err: any) {
    logger.warn("[cashfree] create_order network failure", {
      provider: "cashfree",
      operation: "create_order",
      environment: cfg.cashfreeEnv,
      endpointPath,
      apiVersion: cfg.cashfreeApiVersion,
      errorMessage: String(err?.message || "network_error").slice(0, 200),
    });
    throw new BadRequestError(
      err?.message || "Cashfree create order network failure",
      { code: "CASHFREE_NETWORK_ERROR" }
    );
  }

  if (res.status < 200 || res.status >= 300) {
    const errCode = res.data?.code || res.data?.error_code || null;
    const errType = res.data?.type || null;
    const msg =
      res.data?.message ||
      res.data?.message_text ||
      (Array.isArray(res.data?.message) ? res.data.message.join("; ") : null) ||
      `Cashfree create order failed (${res.status})`;

    logger.warn("[cashfree] create_order failed", {
      provider: "cashfree",
      operation: "create_order",
      environment: cfg.cashfreeEnv,
      httpStatus: res.status,
      endpointPath,
      apiVersion: cfg.cashfreeApiVersion,
      errorCode: errCode,
      errorType: errType,
      errorMessage: String(msg).slice(0, 300),
    });

    throw new BadRequestError(String(msg).slice(0, 300), {
      code: "CASHFREE_ORDER_FAILED",
      status: res.status,
      cashfreeCode: errCode,
      cashfreeType: errType,
    });
  }

  const paymentSessionId = String(
    res.data?.payment_session_id || res.data?.paymentSessionId || ""
  );
  if (!paymentSessionId) {
    throw new BadRequestError("Cashfree response missing payment_session_id", {
      code: "CASHFREE_ORDER_INVALID",
    });
  }

  debugCashfree({
    provider: "cashfree",
    operation: "create_order",
    responseStatus: res.status,
    orderId: String(res.data?.order_id || orderId),
    hasPaymentSessionId: true,
  });

  // Official web flow uses Cashfree.js checkout(paymentSessionId).
  // Keep a non-API URL empty — clients must not GET /pg/view/sessions/checkout.
  return {
    orderId: String(res.data?.order_id || orderId),
    paymentSessionId,
    url: returnUrl,
    amount: cfg.cashfreePremiumAmount,
    currency: cfg.cashfreePremiumCurrency,
  };
}

/** Fetch order status (server-side confirmation after return_url). */
export async function fetchCashfreeOrder(orderId: string): Promise<{
  orderId: string;
  orderStatus: string;
  orderAmount: number | null;
  orderTags: Record<string, string>;
}> {
  const cfg = getBillingConfig();
  if (cfg.provider !== "cashfree" || !cfg.enabled) {
    throw new BadRequestError("Cashfree billing is not configured", {
      code: "BILLING_DISABLED",
    });
  }
  const endpointPath = `/orders/${encodeURIComponent(orderId)}`;
  const url = `${cashfreeApiBase(cfg)}${endpointPath}`;
  const res = await axios.get(url, {
    headers: cashfreeHeaders(cfg),
    timeout: 12000,
    validateStatus: () => true,
  });
  if (res.status !== 200) {
    logger.warn("[cashfree] fetch_order failed", {
      provider: "cashfree",
      operation: "fetch_order",
      environment: cfg.cashfreeEnv,
      httpStatus: res.status,
      endpointPath: "/orders/{order_id}",
      apiVersion: cfg.cashfreeApiVersion,
      errorCode: res.data?.code || null,
      errorMessage: String(res.data?.message || "").slice(0, 200),
    });
    throw new BadRequestError("Failed to fetch Cashfree order", {
      code: "CASHFREE_ORDER_LOOKUP_FAILED",
      status: res.status,
    });
  }
  const tags = res.data?.order_tags || {};
  return {
    orderId: String(res.data?.order_id || orderId),
    orderStatus: String(res.data?.order_status || "").toUpperCase(),
    orderAmount:
      typeof res.data?.order_amount === "number" ? res.data.order_amount : null,
    orderTags: Object.fromEntries(
      Object.entries(tags).map(([k, v]) => [String(k), String(v)])
    ),
  };
}
