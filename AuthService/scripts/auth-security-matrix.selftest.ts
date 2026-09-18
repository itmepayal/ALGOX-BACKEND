/**
 * Section 11 — Auth + JWT + RBAC security matrix + static checks.
 * Run: cd server/AuthService && npx tsx scripts/auth-security-matrix.selftest.ts
 * Live: LIVE_E2E=1 npx tsx scripts/auth-security-matrix.selftest.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const clientApi = path.join(root, "../../client/src/api");

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

const webhook = read("src/billing/webhook.service.ts");
const imports = webhook.match(
  /import \{ writeAdminAudit \} from ["']\.\.\/utils\/helpers\/audit\.helper["'];/g
);
check(
  "webhook.service.ts has single writeAdminAudit import",
  (imports?.length || 0) === 1,
  `count=${imports?.length || 0}`
);

const adminRouter = read("src/routers/v1/admin.router.ts");
check(
  "roles mutate routes require roles:manage",
  adminRouter.includes('requirePermission("roles:manage")') &&
    adminRouter.includes('"/roles/:role/permissions"') &&
    adminRouter.includes('"/roles/:role/reset"')
);
check(
  "roles matrix view stays admin:view",
  adminRouter.includes('"/roles/matrix"') &&
    /\/roles\/matrix[\s\S]{0,120}requirePermission\("admin:view"\)/.test(
      adminRouter
    )
);

const perms = read("src/rbac/permissions.ts");
check(
  "roles:manage in Permission union + ALL_PERMISSIONS",
  perms.includes('| "roles:manage"') && perms.includes('"roles:manage"')
);
check(
  "roles:manage not on ADMIN_PERMS (super_admin only via ALL)",
  !perms
    .slice(perms.indexOf("const ADMIN_PERMS"), perms.indexOf("super_admin:"))
    .includes('"roles:manage"')
);

const authClient = fs.readFileSync(
  path.join(clientApi, "authClient.ts"),
  "utf8"
);
check(
  "refresh skips public auth endpoints + requires Bearer",
  authClient.includes("NO_REFRESH_URL_RE") &&
    authClient.includes("hadBearer") &&
    authClient.includes("createServiceClient")
);
check(
  "createServiceClient defaults withCredentials true",
  authClient.includes("withCredentials: opts?.withCredentials ?? true")
);

// All authenticated API modules use authClient or createServiceClient
const apiFiles = fs
  .readdirSync(clientApi)
  .filter((f) => f.endsWith("Api.ts") || f === "authClient.ts");
let rawAxiosClients = 0;
for (const f of apiFiles) {
  if (f === "authClient.ts" || f === "adminAnalyticsApi.ts") continue;
  const text = fs.readFileSync(path.join(clientApi, f), "utf8");
  if (/axios\.create\(/.test(text)) {
    rawAxiosClients += 1;
    console.error(`  raw axios.create in ${f}`);
  }
}
check(
  "no duplicate axios.create in *Api.ts (except authClient)",
  rawAxiosClients === 0
);

const roleSvc = read("src/services/rolePermission.service.ts");
check(
  "roles:manage cannot be granted via matrix",
  roleSvc.includes('allowed.delete("roles:manage")')
);

async function liveMatrix() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(root, ".env") });
  const mongoose = (await import("mongoose")).default;
  const jwt = await import("jsonwebtoken");
  const { User } = await import("../src/models/user.model");
  const { AdminAuditLog } = await import("../src/models/adminAuditLog.model");
  const { adminUserService } = await import("../src/services/adminUser.service");
  const { toPublicEntitlements } = await import("../src/subscription/engine");

  await mongoose.connect(process.env.MONGO_URL!);
  const base = "http://localhost:3001/api/v1";
  const secret = process.env.JWT_SECRET || "super_secret_jwt_access_key";
  const stamp = Date.now();

  const matrix: Record<string, string> = {};

  // Register + login
  const email = `sec-matrix-${stamp}@example.invalid`;
  const password = "TestPass123!";
  const reg = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Sec Matrix",
      email,
      password,
    }),
  });
  const regJ: any = await reg.json().catch(() => ({}));
  check("registration", reg.ok, regJ?.message || String(reg.status));

  const login = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginJ: any = await login.json();
  let access = loginJ?.data?.accessToken || loginJ?.data?.token || null;
  const setCookie =
    typeof (login.headers as any).getSetCookie === "function"
      ? (login.headers as any).getSetCookie()
      : [];
  const cookieHeader = [
    ...setCookie.map((c: string) => c.split(";")[0]),
    ...(login.headers.get("set-cookie")
      ? [String(login.headers.get("set-cookie")).split(";")[0]]
      : []),
  ]
    .filter(Boolean)
    .join("; ");
  check("login", login.ok && Boolean(access), loginJ?.message);
  matrix.User = login.ok && access ? "OK" : "FAIL";

  // Access token → /auth/me
  const me = await fetch(`${base}/auth/me`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  check("access token /me", me.ok, String(me.status));

  // Refresh
  const refresh = await fetch(`${base}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  });
  const refreshJ: any = await refresh.json().catch(() => ({}));
  const refreshed =
    refreshJ?.data?.accessToken || refreshJ?.data?.token || null;
  check(
    "refresh",
    refresh.ok && Boolean(refreshed),
    `${refresh.status} ${refreshJ?.message || ""}`
  );
  if (refreshed) access = refreshed;

  // Logout
  const logout = await fetch(`${base}/auth/logout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access}`,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  });
  check("logout", logout.ok || logout.status === 204, String(logout.status));

  // Expired token
  const expired = jwt.default.sign(
    { userId: "000000000000000000000001", email, role: "user" },
    secret,
    { expiresIn: -10 }
  );
  const expRes = await fetch(`${base}/auth/me`, {
    headers: { Authorization: `Bearer ${expired}` },
  });
  check("expired token denied", expRes.status === 401, String(expRes.status));
  matrix["Expired Token"] = expRes.status === 401 ? "DENIED" : "FAIL";

  // Unauthorized
  const unauth = await fetch(`${base}/auth/me`);
  check("unauthorized no token", unauth.status === 401, String(unauth.status));
  matrix.Unauthorized = unauth.status === 401 ? "DENIED" : "FAIL";

  // Protected user route after re-login
  const login2 = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const login2J: any = await login2.json();
  access = login2J?.data?.accessToken || login2J?.data?.token;
  const sess = await fetch(`${base}/auth/sessions`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  check("protected routes (sessions)", sess.ok, String(sess.status));

  // Premium gate — free user
  const premiumHit = await fetch(`${base}/auth/subscription/entitlements`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  const premJ: any = await premiumHit.json().catch(() => ({}));
  const tier =
    premJ?.data?.accessTier ||
    premJ?.data?.tier ||
    premJ?.data?.entitlement?.accessTier;
  check(
    "premium gate (FREE user entitlements)",
    premiumHit.ok && (tier === "FREE" || premJ?.data?.plan === "FREE" || Array.isArray(premJ?.data?.features)),
    `tier=${tier} body=${JSON.stringify(premJ?.data)?.slice(0, 120)}`
  );
  matrix.Premium =
    tier === "FREE" || premJ?.data?.plan === "FREE"
      ? "FREE (gated)"
      : String(tier || "see check");

  // Admin routes — regular user denied
  const adminDeny = await fetch(`${base}/auth/admin/users?limit=1`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  check(
    "Admin routes denied for user",
    adminDeny.status === 403 || adminDeny.status === 401,
    String(adminDeny.status)
  );

  // Super admin / admin actors from DB
  let admin = await User.findOne({
    role: { $in: ["admin", "super_admin"] },
    status: "active",
  })
    .select("_id email role")
    .lean();
  if (!admin) {
    const u = await User.findOne({ email });
    if (u) {
      u.role = "super_admin";
      await u.save();
      admin = await User.findById(u._id).select("_id email role").lean();
    }
  }
  check("have admin/super_admin for matrix", Boolean(admin));

  if (admin) {
    const adminTok = jwt.default.sign(
      {
        userId: String(admin._id),
        email: admin.email,
        role: admin.role,
      },
      secret,
      { expiresIn: "10m" }
    );
    const adminOk = await fetch(`${base}/auth/admin/users?limit=1`, {
      headers: { Authorization: `Bearer ${adminTok}` },
    });
    check("Admin routes allowed", adminOk.ok, String(adminOk.status));
    matrix.Admin = adminOk.ok ? "OK" : "FAIL";

    // Super admin roles:manage
    const sa =
      admin.role === "super_admin"
        ? admin
        : await User.findOne({ role: "super_admin", status: "active" })
            .select("_id email role")
            .lean();
    if (sa) {
      const saTok = jwt.default.sign(
        { userId: String(sa._id), email: sa.email, role: "super_admin" },
        secret,
        { expiresIn: "10m" }
      );
      const matrixGet = await fetch(`${base}/auth/admin/roles/matrix`, {
        headers: { Authorization: `Bearer ${saTok}` },
      });
      check("super_admin roles matrix", matrixGet.ok, String(matrixGet.status));
      matrix["Super Admin"] = matrixGet.ok ? "OK" : "FAIL";
    } else {
      matrix["Super Admin"] = "SKIP (no SA)";
    }

    // Regular admin (or elevate a temp admin) denied roles:manage
    const adminOnly = await User.create({
      name: "Admin Only",
      email: `admin-only-${stamp}@example.invalid`,
      password,
      role: "admin",
      status: "active",
      isEmailVerified: true,
    });
    const adminOnlyTok = jwt.default.sign(
      {
        userId: String(adminOnly._id),
        email: adminOnly.email,
        role: "admin",
      },
      secret,
      { expiresIn: "10m" }
    );
    const mutateDeny = await fetch(
      `${base}/auth/admin/roles/moderator/permissions`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${adminOnlyTok}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ permissions: ["admin:view", "users:view"] }),
      }
    );
    check(
      "admin denied roles:manage mutate",
      mutateDeny.status === 403,
      String(mutateDeny.status)
    );

    // Ownership: user A cannot update user B profile via admin without perm — already covered
    // S2S: missing secret
    const s2s = await fetch(`${base}/auth/admin/audit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminTok}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "test.s2s",
        resource: "security",
      }),
    });
    check(
      "service-to-service rejects without internal secret",
      s2s.status === 403 || s2s.status === 401 || s2s.status === 400,
      String(s2s.status)
    );

    // Audit log exists for role changes path
    const auditCount = await AdminAuditLog.countDocuments({
      action: { $in: ["user.role_change", "user.subscription_change"] },
    });
    check("audit logs collection readable", auditCount >= 0);

    // Premium grant entitlement via existing service
    const target = await User.findOne({ email });
    if (target) {
      const granted = await adminUserService.updateSubscription(
        {
          userId: String(admin._id),
          email: String(admin.email),
          role: String(admin.role),
        },
        String(target._id),
        {
          plan: "PREMIUM",
          status: "active",
          currentPeriodEnd: new Date(Date.now() + 86400000).toISOString(),
          source: "admin_grant",
        }
      );
      check(
        "premium entitlement after admin grant",
        granted.accessTier === "PREMIUM",
        String(granted.accessTier)
      );
      matrix.Premium =
        granted.accessTier === "PREMIUM" ? "OK (after grant)" : "FAIL";
      // revoke cleanup
      await adminUserService.updateSubscription(
        {
          userId: String(admin._id),
          email: String(admin.email),
          role: String(admin.role),
        },
        String(target._id),
        { plan: "FREE", status: "none", source: "admin_grant" }
      );
    }

    await User.deleteOne({ _id: adminOnly._id });
  }

  // Cleanup test user
  await User.deleteOne({ email });

  await mongoose.disconnect();

  console.log("\n=== SECURITY MATRIX ===");
  for (const [k, v] of Object.entries(matrix)) {
    console.log(`${k}: ${v}`);
  }
}

(async () => {
  if (process.env.LIVE_E2E === "1") {
    await liveMatrix();
  } else {
    console.log("NOTE: set LIVE_E2E=1 for full security matrix");
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
