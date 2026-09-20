/**
 * Development-only seed for AlgoPath Free vs Premium test accounts.
 *
 * Usage (from AuthService):
 *   ENABLE_TEST_USER_SEED=true \
 *   TEST_PREMIUM_USER_PASSWORD='…' \
 *   TEST_FREE_USER_PASSWORD='…' \
 *   npm run seed:test-users
 *
 * Safety: aborts when NODE_ENV=production, or when ENABLE_TEST_USER_SEED is not true.
 * Never logs or prints passwords.
 */
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: path.join(__dirname, "../.env") });

const PREMIUM_EMAIL = "algopath@gmail.com";
const FREE_EMAIL = "itme.payalyadav@gmail.com";

function abort(message: string, code = 1): never {
  console.error(`[seed:test-users] ${message}`);
  process.exit(code);
}

function assertDevSeedAllowed(): void {
  const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
  if (nodeEnv === "production") {
    abort("Refusing to seed test users: NODE_ENV=production");
  }
  if (process.env.ENABLE_TEST_USER_SEED !== "true") {
    abort(
      "Refusing to seed test users: set ENABLE_TEST_USER_SEED=true (dev/test only)"
    );
  }
}

async function setPassword(user: any, plain: string): Promise<void> {
  user.password = plain;
  user.mustChangePassword = false;
  user.isEmailVerified = true;
  user.status = "active";
  user.deletedAt = null;
  user.role = "user";
  user.loginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();
}

async function ensurePremiumUser(password: string): Promise<{
  email: string;
  id: string;
  action: "created" | "updated";
}> {
  const { User } = await import("../src/models/user.model");
  const { subscriptionService } = await import(
    "../src/subscription/subscription.service"
  );

  let user = await User.findOne({ email: PREMIUM_EMAIL }).select("+password");
  let action: "created" | "updated" = "updated";

  if (!user) {
    user = await User.create({
      name: "AlgoPath Premium Test",
      email: PREMIUM_EMAIL,
      password,
      role: "user",
      status: "active",
      isEmailVerified: true,
      mustChangePassword: false,
      featureGrants: [],
    });
    action = "created";
  } else {
    await setPassword(user, password);
    user.featureGrants = [];
    await user.save();
  }

  const userId = String(user._id);
  const now = new Date();
  // Open-ended admin grant — same ledger path as a real paying Premium user.
  await subscriptionService.upsertLiveSubscription({
    userId,
    plan: "PREMIUM",
    status: "ACTIVE",
    provider: "admin",
    providerSubscriptionId: `dev_seed_premium_${userId}`,
    startDate: now,
    currentPeriodStart: now,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    endedAt: null,
    metadata: {
      purpose: "dev_test_user_seed",
      seedEmail: PREMIUM_EMAIL,
    },
    eventType: "dev.test_user_seed.premium",
  });

  return { email: PREMIUM_EMAIL, id: userId, action };
}

async function ensureFreeUser(password: string | null): Promise<{
  email: string;
  id: string;
  action: "created" | "updated" | "entitlements_only";
}> {
  const { User } = await import("../src/models/user.model");
  const { subscriptionService } = await import(
    "../src/subscription/subscription.service"
  );
  const { DEFAULT_SUBSCRIPTION } = await import(
    "../src/subscription/entitlement"
  );

  let user = await User.findOne({ email: FREE_EMAIL }).select("+password");
  let action: "created" | "updated" | "entitlements_only" = "updated";

  if (!user) {
    if (!password) {
      abort(
        "TEST_FREE_USER_PASSWORD is required to create the Free test user."
      );
    }
    user = await User.create({
      name: "AlgoPath Free Test",
      email: FREE_EMAIL,
      password,
      role: "user",
      status: "active",
      isEmailVerified: true,
      mustChangePassword: false,
      featureGrants: [],
      subscription: { ...DEFAULT_SUBSCRIPTION },
    });
    action = "created";
  } else if (password) {
    await setPassword(user, password);
    user.featureGrants = [];
    user.role = "user";
    await user.save();
  } else {
    user.featureGrants = [];
    user.role = "user";
    user.status = "active";
    user.deletedAt = null;
    await user.save();
    action = "entitlements_only";
    console.warn(
      "[seed:test-users] TEST_FREE_USER_PASSWORD not set — left existing Free user password unchanged; entitlements forced to FREE."
    );
  }

  const userId = String(user._id);
  await subscriptionService.endLiveSubscription(userId, {
    status: "CANCELLED",
    reason: "dev_test_user_seed_ensure_free",
  });
  await User.findByIdAndUpdate(userId, {
    $set: {
      subscription: { ...DEFAULT_SUBSCRIPTION, updatedAt: new Date() },
      featureGrants: [],
    },
  });

  return { email: FREE_EMAIL, id: userId, action };
}

async function summarize(email: string): Promise<void> {
  const { User } = await import("../src/models/user.model");
  const { toPublicEntitlements } = await import("../src/subscription/engine");
  const { toPublicSubscription } = await import("../src/subscription/entitlement");

  const user = await User.findOne({ email }).lean();
  if (!user) {
    console.log(`  ${email}: NOT FOUND`);
    return;
  }
  const entitlements = toPublicEntitlements({
    subscription: (user as any).subscription,
    featureGrants: (user as any).featureGrants,
  });
  const sub = toPublicSubscription((user as any).subscription);
  console.log(
    `  ${email} | plan=${sub.plan} status=${sub.status} accessTier=${entitlements.accessTier} features=${entitlements.features.length} role=${(user as any).role}`
  );
}

async function main(): Promise<void> {
  assertDevSeedAllowed();

  const mongoUrl = (process.env.MONGO_URL || "").trim();
  if (!mongoUrl) {
    abort("MONGO_URL is required");
  }

  const premiumPassword = (process.env.TEST_PREMIUM_USER_PASSWORD || "").trim();
  if (!premiumPassword || premiumPassword.length < 8) {
    abort(
      "TEST_PREMIUM_USER_PASSWORD is required to create the Premium test user (min 8 chars)."
    );
  }

  const freePasswordRaw = (process.env.TEST_FREE_USER_PASSWORD || "").trim();
  const freePassword =
    freePasswordRaw.length >= 8 ? freePasswordRaw : null;
  if (freePasswordRaw && freePasswordRaw.length < 8) {
    abort("TEST_FREE_USER_PASSWORD must be at least 8 characters.");
  }

  await mongoose.connect(mongoUrl, {
    serverSelectionTimeoutMS: 20_000,
    connectTimeoutMS: 15_000,
  });

  try {
    const premium = await ensurePremiumUser(premiumPassword);
    const free = await ensureFreeUser(freePassword);

    console.log("[seed:test-users] Done (idempotent).");
    console.log(
      `  Premium: ${premium.email} (${premium.action}) id=${premium.id}`
    );
    console.log(`  Free:    ${free.email} (${free.action}) id=${free.id}`);
    console.log("[seed:test-users] Verification:");
    await summarize(PREMIUM_EMAIL);
    await summarize(FREE_EMAIL);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("[seed:test-users] Failed:", err?.message || err);
  process.exit(1);
});
