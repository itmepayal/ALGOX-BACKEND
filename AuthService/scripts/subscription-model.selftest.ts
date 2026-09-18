/**
 * Phase 03 — Subscription data model selftest.
 * Run: cd server/AuthService && npx ts-node --transpile-only scripts/subscription-model.selftest.ts
 *
 * Uses MONGO_URL when set (creates disposable users, cleans up).
 * Schema/projection checks always run without DB.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import {
  Subscription,
  SUBSCRIPTION_STATUSES,
  LIVE_SUBSCRIPTION_STATUSES,
} from "../src/models/subscription.model";
import { SubscriptionEvent } from "../src/models/subscriptionEvent.model";
import { User } from "../src/models/user.model";
import { subscriptionService } from "../src/subscription/subscription.service";
import {
  projectEntitlementSnapshot,
  mapSubscriptionStatusToEntitlement,
} from "../src/subscription/projectSnapshot";
import { DEFAULT_SUBSCRIPTION } from "../src/subscription/entitlement";

dotenv.config();

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

  // --- Schema / enum unit checks (no DB) ---
  check(
    "statuses include required lifecycle set",
    SUBSCRIPTION_STATUSES.includes("ACTIVE") &&
      SUBSCRIPTION_STATUSES.includes("TRIALING") &&
      SUBSCRIPTION_STATUSES.includes("PAST_DUE") &&
      SUBSCRIPTION_STATUSES.includes("CANCELLED") &&
      SUBSCRIPTION_STATUSES.includes("EXPIRED") &&
      SUBSCRIPTION_STATUSES.includes("PAUSED") &&
      SUBSCRIPTION_STATUSES.includes("REFUNDED")
  );

  check(
    "live statuses exclude terminal CANCELLED/EXPIRED/REFUNDED",
    LIVE_SUBSCRIPTION_STATUSES.every((s) =>
      ["ACTIVE", "TRIALING", "PAST_DUE", "PAUSED"].includes(s)
    )
  );

  const paths = Subscription.schema.paths;
  check("schema has userId", Boolean(paths.userId));
  check("schema has plan/status/provider", Boolean(paths.plan && paths.status && paths.provider));
  check(
    "schema has provider ids + period + cancel fields",
    Boolean(
      paths.providerCustomerId &&
        paths.providerSubscriptionId &&
        paths.startDate &&
        paths.currentPeriodStart &&
        paths.currentPeriodEnd &&
        paths.cancelAtPeriodEnd &&
        paths.cancelledAt &&
        paths.endedAt &&
        paths.trialStart &&
        paths.trialEnd &&
        paths.metadata
    )
  );
  check(
    "no card/cvv/secret fields on Subscription",
    !paths.cardNumber &&
      !paths.cvv &&
      !paths.cvc &&
      !paths.paymentMethodSecret &&
      !paths.clientSecret
  );

  const idx = Subscription.schema.indexes();
  const idxStr = JSON.stringify(idx);
  check("index covers userId", idxStr.includes('"userId"'));
  check(
    "index covers providerSubscriptionId",
    idxStr.includes('"providerSubscriptionId"')
  );
  check("index covers status", idxStr.includes('"status"'));
  check(
    "index covers currentPeriodEnd",
    idxStr.includes('"currentPeriodEnd"')
  );
  check(
    "partial unique live subscription per user",
    idx.some(
      (i: any) =>
        i[1]?.name === "uniq_live_subscription_per_user" ||
        (i[1]?.unique && i[1]?.partialFilterExpression?.endedAt === null)
    )
  );

  const evIdx = SubscriptionEvent.schema.indexes();
  check(
    "SubscriptionEvent unique providerEventId (partial)",
    evIdx.some(
      (i: any) =>
        i[1]?.name === "uniq_provider_event_id" &&
        (i[1]?.partialFilterExpression?.providerEventId || i[1]?.sparse)
    )
  );

  check(
    "ACTIVE projects to entitlement active",
    mapSubscriptionStatusToEntitlement("ACTIVE") === "active"
  );
  check(
    "PAST_DUE projects to grace",
    mapSubscriptionStatusToEntitlement("PAST_DUE") === "grace"
  );
  check(
    "CANCELLED + cancelAtPeriodEnd still active entitlement",
    mapSubscriptionStatusToEntitlement("CANCELLED", {
      cancelAtPeriodEnd: true,
    }) === "active"
  );

  const snap = projectEntitlementSnapshot({
    plan: "PREMIUM",
    status: "ACTIVE",
    provider: "admin",
    providerSubscriptionId: "sub_test",
    currentPeriodStart: new Date("2026-01-01"),
    currentPeriodEnd: new Date("2026-02-01"),
    cancelAtPeriodEnd: false,
  } as any);
  check("snapshot plan PREMIUM", snap.plan === "PREMIUM");
  check("snapshot source admin_grant", snap.source === "admin_grant");
  check("snapshot externalRef set", snap.externalRef === "sub_test");

  const freeSnap = projectEntitlementSnapshot(null);
  check(
    "null subscription → FREE defaults",
    freeSnap.plan === "FREE" && freeSnap.status === "none"
  );
  check(
    "DEFAULT_SUBSCRIPTION remains FREE/none",
    DEFAULT_SUBSCRIPTION.plan === "FREE" &&
      DEFAULT_SUBSCRIPTION.status === "none"
  );

  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    console.log("SKIP: DB integration (MONGO_URL unset)");
    console.log(`\n${passed} PASS, ${failed} FAIL, DB skipped`);
    process.exit(failed ? 1 : 0);
  }

  await mongoose.connect(mongoUrl);
  const stamp = Date.now();
  const email = `sub-model-selftest-${stamp}@example.invalid`;
  let userId = "";

  try {
    await Subscription.syncIndexes();
    await SubscriptionEvent.syncIndexes();
    check("syncIndexes Subscription + Event", true);

    const user = await User.create({
      name: "Sub Model Selftest",
      email,
      password: "SelftestPass1!",
      isEmailVerified: true,
    });
    userId = String(user._id);

    const beforeSub = { ...(user.subscription as any)?.toObject?.() || user.subscription };
    check(
      "existing user starts FREE/unaffected shape",
      beforeSub?.plan === "FREE" || beforeSub?.plan === undefined || beforeSub?.status === "none" || !beforeSub?.plan
    );

    const untouchedCountBefore = await User.countDocuments({
      email: { $ne: email },
    });

    const { subscription: live } =
      await subscriptionService.upsertLiveSubscription({
        userId,
        plan: "PREMIUM",
        status: "ACTIVE",
        provider: "stripe",
        providerCustomerId: `cus_selftest_${stamp}`,
        providerSubscriptionId: `sub_selftest_${stamp}`,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
        providerEventId: `evt_selftest_${stamp}`,
        eventType: "customer.subscription.created",
      });

    check("created live subscription", Boolean(live?._id));
    check("status ACTIVE", live.status === "ACTIVE");

    const refreshed = await User.findById(userId).lean();
    check(
      "User.subscription projected PREMIUM/active",
      refreshed?.subscription?.plan === "PREMIUM" &&
        refreshed?.subscription?.status === "active"
    );

    const dup = await subscriptionService.upsertLiveSubscription({
      userId,
      plan: "PREMIUM",
      status: "ACTIVE",
      provider: "stripe",
      providerSubscriptionId: `sub_selftest_${stamp}`,
      providerEventId: `evt_selftest_${stamp}`,
      eventType: "customer.subscription.created",
    });
    check("duplicate provider event detected", dup.duplicateEvent === true);
    check(
      "duplicate event does not create second live row",
      (await Subscription.countDocuments({ userId, endedAt: null })) === 1
    );

    let conflictOk = false;
    try {
      await Subscription.create({
        userId,
        plan: "PREMIUM",
        status: "ACTIVE",
        provider: "admin",
        startDate: new Date(),
      });
    } catch (err: any) {
      conflictOk = err?.code === 11000;
    }
    check("duplicate live subscription rejected by unique index", conflictOk);

    await subscriptionService.endLiveSubscription(userId, {
      status: "CANCELLED",
      reason: "selftest_cleanup",
    });
    const afterEnd = await User.findById(userId).lean();
    check(
      "after end, User snapshot FREE",
      afterEnd?.subscription?.plan === "FREE"
    );
    check(
      "historical subscription row preserved",
      (await Subscription.countDocuments({ userId, endedAt: { $ne: null } })) >=
        1
    );

    // Second grant creates new live row (history intact)
    await subscriptionService.upsertLiveSubscription({
      userId,
      plan: "PREMIUM",
      status: "TRIALING",
      provider: "admin",
      trialStart: new Date(),
      trialEnd: new Date(Date.now() + 7 * 86400000),
      currentPeriodEnd: new Date(Date.now() + 7 * 86400000),
      eventType: "admin.grant",
    });
    check(
      "re-grant allowed after end (history + new live)",
      (await Subscription.countDocuments({ userId })) >= 2 &&
        (await Subscription.countDocuments({ userId, endedAt: null })) === 1
    );

    const untouchedCountAfter = await User.countDocuments({
      email: { $ne: email },
    });
    check(
      "other users count unchanged",
      untouchedCountAfter === untouchedCountBefore
    );
  } finally {
    if (userId) {
      await Subscription.deleteMany({ userId });
      await SubscriptionEvent.deleteMany({ userId });
      await User.deleteOne({ _id: userId });
    }
    await mongoose.disconnect();
  }

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
