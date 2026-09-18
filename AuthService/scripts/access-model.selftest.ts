/**
 * Phase 01 — User access model selftest (Guest / Free / Premium / Admin).
 *
 * Unit checks (no network) + live HTTP against AuthService :3001.
 *
 * Run:
 *   cd server/AuthService && node --experimental-vm-modules \
 *     -e "require('tsx/cjs'); require('./scripts/access-model.selftest.ts')"
 * Or: npx ts-node --transpile-only scripts/access-model.selftest.ts
 */
import http from "http";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import {
  hasActivePremiumEntitlement,
  normalizeSubscription,
  resolveAccessTier,
  toPublicSubscription,
} from "../src/subscription/entitlement";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_access_key";
const PORT = Number(process.env.AUTH_PORT || 3001);

type Result = { code: number; json: any; raw: string };

function request(
  path: string,
  method: string,
  headers: Record<string, string> = {},
  body?: unknown
): Promise<Result> {
  return new Promise((resolve) => {
    const data = body !== undefined ? JSON.stringify(body) : "";
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
                "Content-Length": Buffer.byteLength(data),
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
          resolve({ code: res.statusCode || 0, json, raw: b.slice(0, 400) });
        });
      }
    );
    req.on("error", (e) => resolve({ code: 0, json: null, raw: String(e) }));
    if (data) req.write(data);
    req.end();
  });
}

function token(payload: Record<string, unknown>) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "10m" });
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

  // ── Unit: entitlement resolution ─────────────────────────────────
  check("Guest = null user", resolveAccessTier(null) === "GUEST");
  check(
    "Free = missing subscription",
    resolveAccessTier({} as any) === "FREE"
  );
  check(
    "Free = plan FREE",
    resolveAccessTier({
      subscription: { plan: "FREE", status: "none" },
    }) === "FREE"
  );
  check(
    "Premium = active PREMIUM open-ended",
    resolveAccessTier({
      subscription: {
        plan: "PREMIUM",
        status: "active",
        currentPeriodEnd: null,
      },
    }) === "PREMIUM"
  );
  check(
    "Premium expired period → FREE",
    resolveAccessTier({
      subscription: {
        plan: "PREMIUM",
        status: "active",
        currentPeriodEnd: new Date(Date.now() - 60_000),
      },
    }) === "FREE"
  );
  check(
    "Premium grace window still PREMIUM",
    resolveAccessTier({
      subscription: {
        plan: "PREMIUM",
        status: "grace",
        currentPeriodEnd: new Date(Date.now() - 60_000),
        gracePeriodEnd: new Date(Date.now() + 3600_000),
      },
    }) === "PREMIUM"
  );
  check(
    "Canceled premium without period → not premium",
    !hasActivePremiumEntitlement({
      plan: "PREMIUM",
      status: "canceled",
      currentPeriodEnd: null,
    })
  );
  check(
    "Public subscription strips externalRef",
    (toPublicSubscription({
      plan: "PREMIUM",
      status: "active",
      externalRef: "secret_sub_123",
    }) as any).externalRef === undefined
  );
  check(
    "normalize defaults legacy empty to FREE",
    normalizeSubscription(undefined).plan === "FREE" &&
      normalizeSubscription(null).status === "none"
  );

  // Admin role ≠ premium
  check(
    "Admin role alone is FREE tier (subscription independent)",
    resolveAccessTier({
      role: "admin",
      subscription: { plan: "FREE", status: "none" },
    } as any) === "FREE"
  );

  // ── Live HTTP ────────────────────────────────────────────────────
  const health = await request("/api/v1/health", "GET");
  if (health.code !== 200) {
    console.warn(
      `SKIP live HTTP (AuthService not reachable on :${PORT}, health=${health.code})`
    );
    console.log(`\nUnit summary: ${passed} passed, ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
    return;
  }

  // Guest cannot hit authenticated /me
  const guestMe = await request("/api/v1/auth/me", "GET");
  check("Guest → /me is 401", guestMe.code === 401, String(guestMe.code));

  // Signup with subscription attempt must fail strict schema
  const email = `access01-${Date.now()}@example.com`;
  const password = "AccessModel1!";
  const forgedSignup = await request("/api/v1/auth/signup", "POST", {}, {
    name: "Access Forge",
    email: `forge-${email}`,
    password,
    subscription: { plan: "PREMIUM", status: "active" },
    role: "admin",
  });
  check(
    "Client cannot set PREMIUM/role on signup (strict)",
    forgedSignup.code === 400 || forgedSignup.code === 422,
    String(forgedSignup.code)
  );

  const signup = await request("/api/v1/auth/signup", "POST", {}, {
    name: "Access Free",
    email,
    password,
  });
  check("Signup succeeds", signup.code === 201, String(signup.code));
  check(
    "New user defaults FREE accessTier",
    signup.json?.data?.accessTier === "FREE" &&
      signup.json?.data?.subscription?.plan === "FREE",
    JSON.stringify(signup.json?.data?.subscription)
  );
  check(
    "Signup response has no externalRef",
    signup.json?.data?.subscription?.externalRef === undefined
  );

  const login = await request("/api/v1/auth/login", "POST", {}, {
    email,
    password,
  });
  const accessToken = login.json?.data?.accessToken;
  check("Free user login OK", login.code === 200 && !!accessToken);
  check(
    "Login user is FREE",
    login.json?.data?.user?.accessTier === "FREE",
    String(login.json?.data?.user?.accessTier)
  );

  const me = await request("/api/v1/auth/me", "GET", {
    Authorization: `Bearer ${accessToken}`,
  });
  check("Free /me OK", me.code === 200);
  check(
    "Free /me entitlement",
    me.json?.data?.accessTier === "FREE" &&
      me.json?.data?.subscription?.plan === "FREE"
  );

  // Profile cannot set premium (PUT /profile is strict — rejects unknown keys)
  const profileForge = await request(
    "/api/v1/auth/profile",
    "PUT",
    { Authorization: `Bearer ${accessToken}` },
    { subscription: { plan: "PREMIUM", status: "active" }, name: "Access Free" }
  );
  check(
    "Client cannot PUT subscription on profile",
    profileForge.code === 400 || profileForge.code === 422,
    String(profileForge.code)
  );

  // Admin grant premium
  const adminTok = token({
    userId: "000000000000000000000001",
    email: "admin-access@local",
    role: "admin",
    permissions: ["admin:view", "users:view", "users:update", "audit:view"],
  });
  const userId = String(signup.json?.data?.id || "");
  const grant = await request(
    `/api/v1/auth/admin/users/${userId}/subscription`,
    "PATCH",
    { Authorization: `Bearer ${adminTok}` },
    {
      plan: "PREMIUM",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 7 * 86400_000).toISOString(),
      source: "admin_grant",
    }
  );
  check(
    "Admin can grant PREMIUM",
    grant.code === 200 && grant.json?.data?.accessTier === "PREMIUM",
    `${grant.code} ${grant.raw}`
  );

  const userGrantDenied = await request(
    `/api/v1/auth/admin/users/${userId}/subscription`,
    "PATCH",
    {
      Authorization: `Bearer ${token({
        userId: "000000000000000000000099",
        email: "user@local",
        role: "user",
        permissions: [],
      })}`,
    },
    { plan: "PREMIUM", status: "active" }
  );
  check(
    "Non-admin cannot grant PREMIUM",
    userGrantDenied.code === 403,
    String(userGrantDenied.code)
  );

  // Re-login to see premium on /me (DB source of truth)
  const loginPrem = await request("/api/v1/auth/login", "POST", {}, {
    email,
    password,
  });
  check(
    "Premium user login shows PREMIUM",
    loginPrem.json?.data?.user?.accessTier === "PREMIUM" &&
      loginPrem.json?.data?.user?.subscription?.plan === "PREMIUM",
    JSON.stringify(loginPrem.json?.data?.user?.subscription)
  );

  // Admin retains admin perms independently — admin with FREE sub still has admin:view
  const adminPerms = await request("/api/v1/auth/admin/me/permissions", "GET", {
    Authorization: `Bearer ${adminTok}`,
  });
  check(
    "Admin permissions independent of subscription",
    adminPerms.code === 200 &&
      Array.isArray(adminPerms.json?.data?.permissions) &&
      adminPerms.json.data.permissions.includes("admin:view"),
    String(adminPerms.code)
  );

  // Cleanup: revoke premium + soft-delete if possible
  await request(
    `/api/v1/auth/admin/users/${userId}/subscription`,
    "PATCH",
    { Authorization: `Bearer ${adminTok}` },
    { plan: "FREE", status: "none", source: "admin_grant" }
  );
  await request(`/api/v1/auth/admin/users/${userId}`, "DELETE", {
    Authorization: `Bearer ${adminTok}`,
  });

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
