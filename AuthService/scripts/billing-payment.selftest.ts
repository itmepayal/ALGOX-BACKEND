/**
 * Phase 05 — Premium payment integration selftest (sandbox mode).
 * Run: cd server/AuthService && BILLING_PROVIDER=sandbox npx ts-node --transpile-only scripts/billing-payment.selftest.ts
 */
process.env.BILLING_PROVIDER = process.env.BILLING_PROVIDER || "sandbox";
process.env.STRIPE_WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET || "whsec_sandbox_algopath_test";

import dotenv from "dotenv";
import mongoose from "mongoose";
import Stripe from "stripe";
import http from "http";
import {
  resetBillingConfigCache,
  getBillingConfig,
} from "../src/billing/billing.config";
import { billingCheckoutService } from "../src/billing/checkout.service";
import { billingWebhookService } from "../src/billing/webhook.service";
import { sandboxStore } from "../src/billing/sandbox.store";
import { User } from "../src/models/user.model";
import { Subscription } from "../src/models/subscription.model";
import { SubscriptionEvent } from "../src/models/subscriptionEvent.model";
import { subscriptionService } from "../src/subscription/subscription.service";

dotenv.config();
resetBillingConfigCache();

const PORT = Number(process.env.AUTH_PORT || process.env.PORT || 3001);
const WHSEC = getBillingConfig().webhookSecret;

function signEvent(event: Record<string, unknown>): {
  raw: Buffer;
  header: string;
} {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: WHSEC,
  });
  return { raw: Buffer.from(payload), header };
}

async function deliver(event: Record<string, unknown>) {
  const { raw, header } = signEvent(event);
  return billingWebhookService.processRawWebhook(raw, header);
}

function request(
  path: string,
  method: string,
  headers: Record<string, string> = {},
  body?: Buffer | unknown
): Promise<{ code: number; json: any; raw: string }> {
  return new Promise((resolve) => {
    const isBuf = Buffer.isBuffer(body);
    const data =
      body === undefined ? null : isBuf ? body : Buffer.from(JSON.stringify(body));
    const req = http.request(
      {
        hostname: "localhost",
        port: PORT,
        path,
        method,
        headers: {
          ...(data
            ? {
                "Content-Type": "application/json",
                "Content-Length": data.length,
              }
            : {}),
          ...headers,
        },
      },
      (res) => {
        let b = "";
        res.on("data", (d) => (b += d));
        res.on("end", () => {
          let json: any = null;
          try {
            json = JSON.parse(b);
          } catch {
            /* ignore */
          }
          resolve({ code: res.statusCode || 0, json, raw: b.slice(0, 600) });
        });
      }
    );
    req.on("error", (e) => resolve({ code: 0, json: null, raw: String(e) }));
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  let passed = 0;
  let failed = 0;
  const check = (name: string, ok: boolean, detail?: string) => {
    if (!ok) {
      console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
      failed += 1;
      return;
    }
    console.log(`PASS: ${name}`);
    passed += 1;
  };

  const cfg = getBillingConfig();
  check("billing enabled (sandbox)", cfg.enabled && cfg.provider === "sandbox");

  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    console.error("MONGO_URL required");
    process.exit(1);
  }
  await mongoose.connect(mongoUrl);

  const stamp = Date.now();
  const email = `billing05-${stamp}@example.invalid`;
  let userId = "";

  try {
    const user = await User.create({
      name: "Billing Selftest",
      email,
      password: "BillingPhase05!",
      isEmailVerified: true,
    });
    userId = String(user._id);

    const checkout = await billingCheckoutService.createPremiumCheckout({
      userId,
      email,
    });
    check("checkout returns session + url", Boolean(checkout.sessionId && checkout.url));
    check("checkout provider sandbox", checkout.provider === "sandbox");
    const sand = sandboxStore.get(checkout.sessionId);
    check("sandbox session stored", Boolean(sand?.subscriptionId));

    let snap = await User.findById(userId).lean();
    check(
      "pre-webhook still FREE",
      !snap?.subscription?.plan ||
        snap.subscription.plan === "FREE" ||
        snap.subscription.status === "none"
    );

    let sigFail = false;
    try {
      await billingWebhookService.processRawWebhook(
        Buffer.from("{}"),
        "t=1,v1=deadbeef"
      );
    } catch (e: any) {
      sigFail =
        e?.name === "UnauthorizedError" ||
        /signature/i.test(String(e?.message || ""));
    }
    check("invalid signature rejected", sigFail);

    const successEvent = {
      id: `evt_success_${stamp}`,
      object: "event",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: checkout.sessionId,
          object: "checkout.session",
          mode: "subscription",
          metadata: { userId },
          client_reference_id: userId,
          customer: sand!.customerId,
          subscription: sand!.subscriptionId,
          payment_status: "paid",
        },
      },
    };
    const success = await deliver(successEvent);
    check("success webhook handled", success.handled && !success.duplicate);

    snap = await User.findById(userId).lean();
    check(
      "success → PREMIUM active",
      snap?.subscription?.plan === "PREMIUM" &&
        snap?.subscription?.status === "active",
      JSON.stringify(snap?.subscription)
    );
    check(
      "ledger ACTIVE with provider ids",
      Boolean(
        (await Subscription.findOne({ userId, endedAt: null }))
          ?.providerSubscriptionId
      )
    );

    const dup = await deliver(successEvent);
    check("duplicate webhook detected", dup.duplicate === true);
    check(
      "duplicate does not create second live row",
      (await Subscription.countDocuments({ userId, endedAt: null })) === 1
    );

    await deliver({
      id: `evt_fail_${stamp}`,
      object: "event",
      type: "invoice.payment_failed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `in_fail_${stamp}`,
          object: "invoice",
          subscription: sand!.subscriptionId,
          customer: sand!.customerId,
          status: "open",
        },
      },
    });
    check(
      "failure → PAST_DUE",
      (await Subscription.findOne({ userId, endedAt: null }))?.status ===
        "PAST_DUE"
    );

    const now = Math.floor(Date.now() / 1000);
    await deliver({
      id: `evt_upd_${stamp}`,
      object: "event",
      type: "customer.subscription.updated",
      created: now,
      data: {
        object: {
          id: sand!.subscriptionId,
          object: "subscription",
          status: "active",
          customer: sand!.customerId,
          metadata: { userId },
          current_period_start: now,
          current_period_end: now + 30 * 86400,
          cancel_at_period_end: false,
          items: { data: [{ price: { id: cfg.premiumPriceId } }] },
        },
      },
    });
    check(
      "restored ACTIVE after update",
      (await Subscription.findOne({ userId, endedAt: null }))?.status ===
        "ACTIVE"
    );

    await deliver({
      id: `evt_cancel_${stamp}`,
      object: "event",
      type: "customer.subscription.updated",
      created: now,
      data: {
        object: {
          id: sand!.subscriptionId,
          object: "subscription",
          status: "active",
          customer: sand!.customerId,
          metadata: { userId },
          current_period_start: now,
          current_period_end: now + 10 * 86400,
          cancel_at_period_end: true,
          canceled_at: now,
          items: { data: [{ price: { id: cfg.premiumPriceId } }] },
        },
      },
    });
    const cancelled = await Subscription.findOne({ userId, endedAt: null });
    check(
      "cancel → cancelAtPeriodEnd still live",
      cancelled?.cancelAtPeriodEnd === true && cancelled?.endedAt == null
    );
    const ent = await User.findById(userId).lean();
    check(
      "cancel keeps premium until period end",
      ent?.subscription?.plan === "PREMIUM" &&
        ent?.subscription?.cancelAtPeriodEnd === true
    );

    await deliver({
      id: `evt_del_${stamp}`,
      object: "event",
      type: "customer.subscription.deleted",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: sand!.subscriptionId,
          object: "subscription",
          status: "canceled",
          customer: sand!.customerId,
          metadata: { userId },
          cancel_at_period_end: false,
        },
      },
    });
    check(
      "expiry/delete ends live subscription",
      (await Subscription.countDocuments({ userId, endedAt: null })) === 0
    );
    check(
      "expiry → FREE entitlement",
      (await User.findById(userId).lean())?.subscription?.plan === "FREE"
    );

    await subscriptionService.upsertLiveSubscription({
      userId,
      plan: "PREMIUM",
      status: "ACTIVE",
      provider: "stripe",
      providerCustomerId: `cus_refund_${stamp}`,
      providerSubscriptionId: `sub_refund_${stamp}`,
      currentPeriodEnd: new Date(Date.now() + 86400000),
      eventType: "selftest.regrant",
    });
    await deliver({
      id: `evt_refund_${stamp}`,
      object: "event",
      type: "charge.refunded",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `ch_refund_${stamp}`,
          object: "charge",
          customer: `cus_refund_${stamp}`,
          refunded: true,
          amount: 999,
          amount_refunded: 999,
        },
      },
    });
    check(
      "refund ends subscription",
      (await Subscription.countDocuments({ userId, endedAt: null })) === 0
    );
    check(
      "history preserved",
      (await Subscription.countDocuments({ userId })) >= 2
    );

    const health = await request("/api/v1/health", "GET");
    if (health.code === 200) {
      const guestCheckout = await request(
        "/api/v1/auth/subscription/checkout",
        "POST",
        {},
        {}
      );
      check("guest checkout → 401", guestCheckout.code === 401);

      const badHttp = await request(
        "/api/v1/auth/webhooks/stripe",
        "POST",
        {
          "stripe-signature": "t=1,v1=nope",
          "Content-Type": "application/json",
        },
        Buffer.from(JSON.stringify({ id: "evt_x" }))
      );
      check(
        "HTTP webhook bad signature rejected",
        badHttp.code === 401 || badHttp.code === 400,
        `${badHttp.code}`
      );
    } else {
      console.log("SKIP HTTP checks — AuthService not up");
    }
  } finally {
    if (userId) {
      await Subscription.deleteMany({ userId });
      await SubscriptionEvent.deleteMany({ userId });
      await User.deleteOne({ _id: userId });
    }
    sandboxStore.clear();
    await mongoose.disconnect();
  }

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
