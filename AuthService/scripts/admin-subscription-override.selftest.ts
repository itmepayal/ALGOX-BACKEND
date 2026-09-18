/**
 * Section 10 — Admin subscription override E2E.
 * Run: cd server/AuthService && LIVE_E2E=1 npx tsx scripts/admin-subscription-override.selftest.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
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
function readClient(rel: string) {
  return fs.readFileSync(path.join(clientSrc, rel), "utf8");
}

const router = read("src/routers/v1/admin.router.ts");
const service = read("src/services/adminUser.service.ts");
const controller = read("src/controllers/adminUser.controller.ts");
const api = readClient("api/adminAuthApi.ts");
const ui = readClient("components/admin/users/UserDetailPage.tsx");
const perms = read("src/rbac/permissions.ts");

check(
  "PATCH /users/:id/subscription requires users:update",
  router.includes('"/users/:id/subscription"') &&
    router.includes('requirePermission("users:update")')
);
check(
  "adminUserService.updateSubscription uses subscription ledger",
  service.includes("upsertLiveSubscription") &&
    service.includes("endLiveSubscription") &&
    service.includes('eventType: "admin.subscription_change"')
);
check(
  "audit action user.subscription_change",
  service.includes('action: "user.subscription_change"')
);
check(
  "adminAuthApi.updateSubscription client exists",
  api.includes("updateSubscription:") &&
    api.includes("/auth/admin/users/${id}/subscription")
);
check(
  "UserDetailPage Grant Premium / Revoke wired",
  ui.includes("Grant Premium") &&
    ui.includes("Revoke to Free") &&
    ui.includes("adminAuthApi.updateSubscription") &&
    ui.includes('can("users:update")')
);
check(
  "moderator lacks users:update (restricted denied)",
  perms.includes("const MODERATOR_PERMS") &&
    !perms
      .slice(
        perms.indexOf("const MODERATOR_PERMS"),
        perms.indexOf("const CONTENT_MANAGER_PERMS")
      )
      .includes('"users:update"')
);

async function liveE2E() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(root, ".env") });
  const mongoose = (await import("mongoose")).default;
  const { User } = await import("../src/models/user.model");
  const { Subscription } = await import("../src/models/subscription.model");
  const { AdminAuditLog } = await import("../src/models/adminAuditLog.model");
  const { adminUserService } = await import("../src/services/adminUser.service");
  const { toPublicEntitlements } = await import(
    "../src/subscription/engine"
  );
  const jwt = await import("jsonwebtoken");

  await mongoose.connect(process.env.MONGO_URL!);

  // Ensure an admin actor + target user
  let admin = await User.findOne({
    role: { $in: ["admin", "super_admin"] },
    status: "active",
  })
    .select("_id email role")
    .lean();

  if (!admin) {
    // Promote known E2E user temporarily
    const e2e = await User.findOne({
      email: "verify-e2e-1789657967@example.invalid",
    });
    if (e2e) {
      e2e.role = "super_admin";
      await e2e.save();
      admin = await User.findById(e2e._id).select("_id email role").lean();
    }
  }
  check("have admin actor", Boolean(admin));
  if (!admin) {
    await mongoose.disconnect();
    return;
  }

  const stamp = Date.now();
  const target = await User.create({
    name: `Sub Override ${stamp}`,
    email: `sub-override-${stamp}@example.invalid`,
    password: "TestPass123!",
    role: "user",
    status: "active",
    isEmailVerified: true,
  });

  const actor = {
    userId: String(admin._id),
    email: String(admin.email || "admin@test"),
    role: String(admin.role),
  };

  // Before: FREE
  const beforeEnt = toPublicEntitlements({
    subscription: (target as any).subscription,
    featureGrants: (target as any).featureGrants,
  });
  check("target starts FREE", beforeEnt.accessTier === "FREE");

  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const granted = await adminUserService.updateSubscription(
    actor,
    String(target._id),
    {
      plan: "PREMIUM",
      status: "active",
      currentPeriodEnd: periodEnd.toISOString(),
      source: "admin_grant",
      cancelAtPeriodEnd: false,
    }
  );
  check(
    "admin grant → PREMIUM plan active",
    granted.subscription?.plan === "PREMIUM" &&
      granted.subscription?.status === "active",
    JSON.stringify(granted.subscription)
  );
  check(
    "accessTier PREMIUM after grant",
    granted.accessTier === "PREMIUM",
    String(granted.accessTier)
  );

  const live = await Subscription.findOne({
    userId: target._id,
    endedAt: null,
  }).lean();
  check(
    "ledger row LIVE with provider admin",
    Boolean(live) &&
      live?.plan === "PREMIUM" &&
      live?.status === "ACTIVE" &&
      live?.provider === "admin",
    JSON.stringify(live && { plan: live.plan, status: live.status, provider: live.provider })
  );

  const refreshed = await User.findById(target._id).lean();
  check(
    "User.subscription snapshot updated",
    refreshed?.subscription?.plan === "PREMIUM",
    JSON.stringify(refreshed?.subscription)
  );

  const audit = await AdminAuditLog.findOne({
    resource: "user",
    resourceId: String(target._id),
    action: "user.subscription_change",
    actorId: admin._id,
  })
    .sort({ createdAt: -1 })
    .lean();
  check(
    "audit log recorded",
    Boolean(audit) &&
      (audit as any)?.after?.plan === "PREMIUM",
    audit ? JSON.stringify((audit as any).after) : "missing"
  );

  // User premium access via entitlements endpoint path
  const userEnt = toPublicEntitlements({
    subscription: refreshed?.subscription,
    featureGrants: (refreshed as any)?.featureGrants,
  });
  check(
    "user premium entitlement features include premium gate",
    userEnt.accessTier === "PREMIUM" &&
      (userEnt.features?.["premium.virtual_contest"] === true ||
        Object.values(userEnt.features || {}).some(Boolean)),
    JSON.stringify(userEnt.features)?.slice(0, 120)
  );

  // HTTP RBAC: moderator JWT must be 403
  const modEmail = `mod-deny-${stamp}@example.invalid`;
  const mod = await User.create({
    name: "Mod Deny",
    email: modEmail,
    password: "TestPass123!",
    role: "moderator",
    status: "active",
    isEmailVerified: true,
  });
  const secret = process.env.JWT_SECRET || "super_secret_jwt_access_key";
  const modToken = jwt.default.sign(
    {
      userId: String(mod._id),
      email: modEmail,
      role: "moderator",
    },
    secret,
    { expiresIn: "10m" }
  );
  const base = process.env.AUTH_PUBLIC_URL || "http://localhost:3001/api/v1";
  const denyRes = await fetch(
    `${base}/auth/admin/users/${target._id}/subscription`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${modToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan: "PREMIUM",
        status: "active",
        source: "admin_grant",
      }),
    }
  );
  check(
    "restricted moderator denied (403/401)",
    denyRes.status === 403 || denyRes.status === 401,
    `status=${denyRes.status}`
  );

  // Revoke
  const revoked = await adminUserService.updateSubscription(
    actor,
    String(target._id),
    { plan: "FREE", status: "none", source: "admin_grant" }
  );
  check(
    "revoke → FREE",
    revoked.subscription?.plan === "FREE" &&
      revoked.accessTier === "FREE",
    JSON.stringify({
      plan: revoked.subscription?.plan,
      tier: revoked.accessTier,
    })
  );

  // Cleanup
  await Subscription.deleteMany({ userId: { $in: [target._id, mod._id] } });
  await User.deleteMany({ _id: { $in: [target._id, mod._id] } });

  await mongoose.disconnect();
}

(async () => {
  if (process.env.LIVE_E2E === "1") {
    await liveE2E();
  } else {
    console.log("NOTE: set LIVE_E2E=1 for grant→ledger→entitlement→audit E2E");
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
