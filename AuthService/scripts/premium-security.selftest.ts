/**
 * Phase 22 — Premium Security + Anti-Abuse.
 * Run: cd server/AuthService && npx tsx scripts/premium-security.selftest.ts
 *
 * VERIFY: free forge denied, expired/cancelled lose access, webhook sig/idempotency/replay,
 * client entitlement mutation rejected, impossible transitions, trial abuse, ownership.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const problemRoot = path.join(root, "../ProblemService");
const clientSrc = path.join(root, "../../client/src");

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (!ok) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failed += 1;
    return;
  }
  console.log(`PASS: ${name}`);
  passed += 1;
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function readProblem(rel: string) {
  return fs.readFileSync(path.join(problemRoot, rel), "utf8");
}
function readClient(rel: string) {
  return fs.readFileSync(path.join(clientSrc, rel), "utf8");
}

async function main() {
  // ── Static wiring ──────────────────────────────────────────────
  const entitlement = read("src/subscription/entitlement.ts");
  const engine = read("src/subscription/engine.ts");
  const middleware = read("src/subscription/entitlement.middleware.ts");
  const transitions = read("src/subscription/transitions.ts");
  const trialAbuse = read("src/subscription/trialAbuse.ts");
  const webhook = read("src/billing/webhook.service.ts");
  const stripeMap = read("src/billing/stripeStatus.map.ts");
  const billingCfg = read("src/billing/billing.config.ts");
  const rateLimit = read("src/middlewares/rateLimit.middleware.ts");
  const authRouter = read("src/routers/v1/auth.router.ts");
  const subCtrl = read("src/subscription/subscription.controller.ts");
  const ownership = read("src/utils/helpers/ownership.helper.ts");
  const subSvc = read("src/subscription/subscription.service.ts");
  const canAccess = readClient("access/canAccess.ts");
  const authCtx = readClient("context/AuthContext.tsx");
  const aiSvc = readProblem("src/services/aiAssistant.service.ts");
  const srsSvc = readProblem("src/services/srs.service.ts");
  const virtualSvc = readProblem("src/services/virtualContest.service.ts");
  const challengeSvc = readProblem("src/services/challenge.service.ts");

  check(
    "JWT is not entitlement SoT",
    middleware.includes("syncUserEntitlementSnapshot") &&
      middleware.includes("canAccessFeature") &&
      !middleware.includes("req.user.accessTier")
  );
  check(
    "expired period loses premium",
    entitlement.includes("periodEnd < t") &&
      entitlement.includes("hasActivePremiumEntitlement")
  );
  check(
    "impossible transitions module",
    transitions.includes("IMPOSSIBLE_SUBSCRIPTION_TRANSITION") &&
      transitions.includes("assertAllowedTransition") &&
      subSvc.includes("assertAllowedTransition")
  );
  check(
    "client entitlement mutation rejected",
    transitions.includes("CLIENT_ENTITLEMENT_MUTATION_REJECTED") &&
      subCtrl.includes("rejectClientEntitlementMutation")
  );
  check(
    "webhook signature + replay + idempotency",
    webhook.includes("constructEvent") &&
      webhook.includes("WEBHOOK_REPLAY_REJECTED") &&
      webhook.includes("assertNotReplay") &&
      webhook.includes("providerEventId") &&
      webhook.includes("duplicate")
  );
  check(
    "incomplete Stripe status fail-closed",
    stripeMap.includes('case "incomplete"') &&
      stripeMap.includes('return "EXPIRED"') &&
      !stripeMap.match(/case "incomplete":[\s\S]*?return "PAST_DUE"/)
  );
  check(
    "webhook max age tightened (24h default)",
    billingCfg.includes("86400")
  );
  check(
    "billing mutation rate limits",
    rateLimit.includes("billingMutationRateLimit") &&
      authRouter.includes('billingMutationRateLimit("checkout")') &&
      authRouter.includes('billingMutationRateLimit("cancel")') &&
      authRouter.includes('billingMutationRateLimit("resume")')
  );
  check(
    "trial abuse control",
    trialAbuse.includes("TRIAL_ALREADY_USED") &&
      webhook.includes("trial_abuse_blocked")
  );
  check(
    "lazy expiry + grant clear on revoke",
    subSvc.includes("period_ended_lazy_sync") &&
      subSvc.includes("featureGrants") &&
      subSvc.includes("entitlement.feature_grants_cleared")
  );
  check(
    "horizontal ownership helper",
    ownership.includes("HORIZONTAL_AUTHZ_DENIED") &&
      ownership.includes("assertResourceOwner") &&
      ownership.includes("rejectSpoofedUserId")
  );
  check(
    "client canAccess is advisory only",
    canAccess.includes("UI-only") &&
      canAccess.includes("Forged localStorage") &&
      authCtx.includes("refreshEntitlements")
  );
  check(
    "AI atomic quota + rate limit",
    aiSvc.includes("findOneAndUpdate") &&
      aiSvc.includes("$lt: [\"$used\", \"$quota\"]") &&
      aiSvc.includes("checkAiRateLimit")
  );
  check(
    "SRS rejects client nextReviewAt",
    srsSvc.includes("CLIENT_TIMESTAMP_REJECTED") &&
      srsSvc.includes("delayDays")
  );
  check(
    "virtual contest premium + rate limit + owner",
    virtualSvc.includes("premium.virtual_contest") &&
      virtualSvc.includes("checkPremiumAbuseLimit") &&
      virtualSvc.includes("assertOwner")
  );
  check(
    "daily challenge rejects client date spoof",
    challengeSvc.includes("Ignores any client-supplied dateKey") ||
      challengeSvc.includes("anti-spoof")
  );

  // ── Unit: transitions + entitlement ────────────────────────────
  const { assertAllowedTransition, isAllowedSubscriptionTransition, rejectClientEntitlementMutation } =
    await import("../src/subscription/transitions.ts");
  const { hasActivePremiumEntitlement, resolveAccessTier } = await import(
    "../src/subscription/entitlement.ts"
  );
  const { mapStripeSubscriptionStatus } = await import(
    "../src/billing/stripeStatus.map.ts"
  );
  const { canAccessFeature } = await import("../src/subscription/engine.ts");

  check(
    "ACTIVE→REFUNDED allowed",
    isAllowedSubscriptionTransition("ACTIVE", "REFUNDED")
  );
  let impossibleCaught = false;
  try {
    assertAllowedTransition("REFUNDED", "PAST_DUE");
  } catch (e: any) {
    impossibleCaught =
      e?.details?.code === "IMPOSSIBLE_SUBSCRIPTION_TRANSITION" ||
      String(e?.message || "").includes("Impossible");
  }
  check("REFUNDED→PAST_DUE rejected", impossibleCaught);

  let clientMutCaught = false;
  try {
    rejectClientEntitlementMutation({ plan: "PREMIUM", status: "active" });
  } catch (e: any) {
    clientMutCaught =
      e?.details?.code === "CLIENT_ENTITLEMENT_MUTATION_REJECTED";
  }
  check("client plan forge body rejected", clientMutCaught);

  check(
    "incomplete → EXPIRED (no grace)",
    mapStripeSubscriptionStatus("incomplete") === "EXPIRED"
  );
  check(
    "unpaid → PAST_DUE",
    mapStripeSubscriptionStatus("unpaid") === "PAST_DUE"
  );

  const now = new Date();
  const expired = {
    plan: "PREMIUM" as const,
    status: "active" as const,
    currentPeriodEnd: new Date(now.getTime() - 60_000),
    gracePeriodEnd: null,
  };
  check(
    "expired period → not premium",
    !hasActivePremiumEntitlement(expired, now)
  );
  check(
    "expired → FREE tier",
    resolveAccessTier({ subscription: expired }, now) === "FREE"
  );

  const canceled = {
    plan: "PREMIUM" as const,
    status: "canceled" as const,
    currentPeriodEnd: new Date(now.getTime() + 86_400_000),
  };
  check(
    "canceled status → not premium",
    !hasActivePremiumEntitlement(canceled, now)
  );

  const freeDecision = canAccessFeature(
    { subscription: { plan: "FREE", status: "none" }, featureGrants: [] },
    "premium.virtual_contest"
  );
  check("free user premium.virtual_contest DENIED", !freeDecision.allowed);

  const expiredDecision = canAccessFeature(
    { subscription: expired, featureGrants: [] },
    "premium.analytics"
  );
  check("expired premium.analytics DENIED", !expiredDecision.allowed);

  // ── Live DB / HTTP when available ──────────────────────────────
  const mongoUrl = process.env.MONGO_URL;
  const AUTH_PORT = Number(process.env.AUTH_PORT || process.env.PORT || 3001);

  if (!mongoUrl) {
    console.log("SKIP live DB tests (no MONGO_URL)");
  } else {
    await mongoose.connect(mongoUrl);
    const { User } = await import("../src/models/user.model.ts");
    const { subscriptionService } = await import(
      "../src/subscription/subscription.service.ts"
    );
    const { hasConsumedTrial, assertTrialAllowed } = await import(
      "../src/subscription/trialAbuse.ts"
    );

    const stamp = Date.now();
    const email = `p22-sec-${stamp}@example.invalid`;
    const user = await User.create({
      name: "P22 Security",
      email,
      password: "TestPass123!",
      role: "user",
      isEmailVerified: true,
      subscription: {
        plan: "PREMIUM",
        status: "active",
        currentPeriodEnd: new Date(Date.now() - 120_000),
        source: "billing",
      },
      featureGrants: ["premium.ai"],
    });
    const userId = String(user._id);

    // Seed an ended-period live sub so lazy sync expires it
    await subscriptionService.upsertLiveSubscription({
      userId,
      plan: "PREMIUM",
      status: "ACTIVE",
      provider: "manual",
      currentPeriodStart: new Date(Date.now() - 7 * 86_400_000),
      currentPeriodEnd: new Date(Date.now() - 120_000),
      cancelAtPeriodEnd: true,
      eventType: "selftest.seed_expired",
    });

    await subscriptionService.syncUserEntitlementSnapshot(userId);
    const refreshed = await User.findById(userId).lean();
    const tier = resolveAccessTier(
      { subscription: (refreshed as any)?.subscription },
      new Date()
    );
    check(
      "lazy sync expires ended premium",
      tier === "FREE",
      `tier=${tier} status=${(refreshed as any)?.subscription?.status}`
    );

    // Trial consume then block
    await subscriptionService.upsertLiveSubscription({
      userId,
      plan: "PREMIUM",
      status: "TRIALING",
      provider: "stripe",
      trialStart: new Date(),
      trialEnd: new Date(Date.now() + 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
      eventType: "selftest.trial",
    });
    check("trial recorded", await hasConsumedTrial(userId));
    let trialBlocked = false;
    try {
      await assertTrialAllowed(userId);
    } catch (e: any) {
      trialBlocked = e?.details?.code === "TRIAL_ALREADY_USED";
    }
    check("second trial blocked", trialBlocked);

    // Admin revoke clears grants
    await User.findByIdAndUpdate(userId, {
      $set: { featureGrants: ["premium.analytics"] },
    });
    await subscriptionService.endLiveSubscription(userId, {
      status: "CANCELLED",
      reason: "admin_revoke",
    });
    const afterRevoke = await User.findById(userId).lean();
    check(
      "admin revoke clears featureGrants",
      !((afterRevoke as any)?.featureGrants || []).length
    );

    // HTTP: free user probe
    const http = await import("http");
    const request = (
      p: string,
      method: string,
      headers: Record<string, string> = {},
      body?: unknown
    ): Promise<{ code: number; json: any }> =>
      new Promise((resolve) => {
        const data = body ? Buffer.from(JSON.stringify(body)) : null;
        const req = http.request(
          {
            hostname: "localhost",
            port: AUTH_PORT,
            path: p,
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
              resolve({ code: res.statusCode || 0, json });
            });
          }
        );
        req.on("error", () => resolve({ code: 0, json: null }));
        if (data) req.write(data);
        req.end();
      });

    // Signup + login free user for probe
    const freeEmail = `p22-free-${stamp}@example.invalid`;
    const freePass = "TestPass123!";
    await request("/api/v1/auth/signup", "POST", {}, {
      name: "Free P22",
      email: freeEmail,
      password: freePass,
    });
    const login = await request("/api/v1/auth/login", "POST", {}, {
      email: freeEmail,
      password: freePass,
    });
    const token =
      login.json?.data?.accessToken ||
      login.json?.data?.token ||
      "";
    if (token) {
      const probe = await request(
        "/api/v1/auth/entitlements/probe/premium.virtual_contest",
        "GET",
        { Authorization: `Bearer ${token}` }
      );
      check(
        "free JWT premium probe DENIED",
        probe.code === 403,
        `code=${probe.code}`
      );

      const activate = await request(
        "/api/v1/auth/subscription",
        "POST",
        { Authorization: `Bearer ${token}` },
        { plan: "PREMIUM", status: "active" }
      );
      check(
        "client activate rejected",
        activate.code === 400 || activate.code === 403,
        `code=${activate.code}`
      );

      const spoofHist = await request(
        "/api/v1/auth/subscription/history?userId=000000000000000000000001",
        "GET",
        { Authorization: `Bearer ${token}` }
      );
      check(
        "spoofed history userId DENIED",
        spoofHist.code === 403,
        `code=${spoofHist.code}`
      );
    } else {
      check(
        "free JWT premium probe DENIED",
        false,
        `login failed code=${login.code}`
      );
      check("client activate rejected", false, "no token");
      check("spoofed history userId DENIED", false, "no token");
    }

    // Unsigned webhook
    const badWh = await request(
      "/api/v1/auth/webhooks/stripe",
      "POST",
      { "Content-Type": "application/json", "stripe-signature": "t=1,v1=bad" },
      { id: "evt_fake", type: "ping" }
    );
    check(
      "unsigned/invalid webhook rejected",
      badWh.code === 400 || badWh.code === 401 || badWh.code === 403,
      `code=${badWh.code}`
    );

    await User.deleteOne({ _id: userId });
    await User.deleteOne({ email: freeEmail });
    await mongoose.disconnect();
  }

  console.log(`\nPhase 22 premium-security: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
