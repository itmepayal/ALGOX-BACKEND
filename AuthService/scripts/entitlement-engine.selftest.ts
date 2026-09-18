/**
 * Phase 02 — Entitlement engine selftest.
 * Run: cd server/AuthService && npx ts-node --transpile-only scripts/entitlement-engine.selftest.ts
 */
import http from "http";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import {
  canAccessFeature,
  resolveEntitledFeatures,
} from "../src/subscription/engine";
import { FEATURE_IDS } from "../src/subscription/features";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_access_key";
const PORT = Number(process.env.AUTH_PORT || 3001);

function request(
  path: string,
  method: string,
  headers: Record<string, string> = {},
  body?: unknown
): Promise<{ code: number; json: any; raw: string }> {
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
          resolve({ code: res.statusCode || 0, json, raw: b.slice(0, 500) });
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

  // Unit
  check(
    "Free has zero premium features",
    resolveEntitledFeatures({
      subscription: { plan: "FREE", status: "none" },
    }).length === 0
  );
  check(
    "Premium gets all catalog features",
    resolveEntitledFeatures({
      subscription: { plan: "PREMIUM", status: "active" },
    }).length === FEATURE_IDS.length
  );
  check(
    "Unknown feature denied",
    canAccessFeature(
      { subscription: { plan: "PREMIUM", status: "active" } },
      "premium.not_real"
    ).reason === "unknown_feature" &&
      !canAccessFeature(
        { subscription: { plan: "PREMIUM", status: "active" } },
        "premium.not_real"
      ).allowed
  );
  check(
    "Free denied premium.editorial",
    canAccessFeature(
      { subscription: { plan: "FREE", status: "none" } },
      "premium.editorial"
    ).reason === "premium_required"
  );
  check(
    "Premium allowed premium.editorial",
    canAccessFeature(
      { subscription: { plan: "PREMIUM", status: "active" } },
      "premium.editorial"
    ).allowed
  );
  check(
    "Promo feature grant without full premium plan",
    canAccessFeature(
      {
        subscription: { plan: "FREE", status: "none" },
        featureGrants: ["premium.hints"],
      },
      "premium.hints"
    ).allowed &&
      !canAccessFeature(
        {
          subscription: { plan: "FREE", status: "none" },
          featureGrants: ["premium.hints"],
        },
        "premium.editorial"
      ).allowed
  );

  const health = await request("/api/v1/health", "GET");
  if (health.code !== 200) {
    console.warn("SKIP live HTTP — AuthService down");
    console.log(`\nUnit: ${passed} passed, ${failed} failed`);
    process.exitCode = failed ? 1 : 0;
    return;
  }

  const email = `ent02-${Date.now()}@example.com`;
  const password = "Entitlement02!";
  const signup = await request("/api/v1/auth/signup", "POST", {}, {
    name: "Ent Free",
    email,
    password,
  });
  check("Signup FREE", signup.code === 201);
  const userId = String(signup.json?.data?.id || "");

  const login = await request("/api/v1/auth/login", "POST", {}, {
    email,
    password,
  });
  const freeTok = login.json?.data?.accessToken as string;
  check("Free login", !!freeTok);
  check(
    "Free login features empty",
    Array.isArray(login.json?.data?.user?.features) &&
      login.json.data.user.features.length === 0
  );

  const freeProbe = await request(
    "/api/v1/auth/entitlements/probe/premium.editorial",
    "GET",
    { Authorization: `Bearer ${freeTok}` }
  );
  check(
    "Free → premium probe 403 PREMIUM_REQUIRED",
    freeProbe.code === 403 && freeProbe.json?.code === "PREMIUM_REQUIRED",
    `${freeProbe.code} ${freeProbe.raw}`
  );

  const unknownProbe = await request(
    "/api/v1/auth/entitlements/probe/premium.not_a_feature",
    "GET",
    { Authorization: `Bearer ${freeTok}` }
  );
  check(
    "Unknown feature fails safely",
    unknownProbe.code === 403 && unknownProbe.json?.code === "UNKNOWN_FEATURE",
    `${unknownProbe.code} ${unknownProbe.raw}`
  );

  const guestProbe = await request(
    "/api/v1/auth/entitlements/probe/premium.editorial",
    "GET"
  );
  check("Guest probe 401", guestProbe.code === 401);

  // Client cannot bypass by forging JWT without DB premium
  const forgedPremTok = token({
    userId,
    email,
    role: "user",
    permissions: [],
    accessTier: "PREMIUM",
    features: FEATURE_IDS,
  });
  const forgedProbe = await request(
    "/api/v1/auth/entitlements/probe/premium.editorial",
    "GET",
    { Authorization: `Bearer ${forgedPremTok}` }
  );
  check(
    "Forged JWT features cannot bypass DB entitlement",
    forgedProbe.code === 403 && forgedProbe.json?.code === "PREMIUM_REQUIRED",
    `${forgedProbe.code} ${forgedProbe.raw}`
  );

  const adminTok = token({
    userId: "000000000000000000000001",
    email: "admin-ent@local",
    role: "admin",
    permissions: ["admin:view", "users:view", "users:update", "audit:view"],
  });

  // Admin RBAC still works without premium
  const adminPerms = await request("/api/v1/auth/admin/me/permissions", "GET", {
    Authorization: `Bearer ${adminTok}`,
  });
  check(
    "Admin RBAC independent of premium",
    adminPerms.code === 200 &&
      adminPerms.json?.data?.permissions?.includes("admin:view")
  );

  // Admin without premium still denied product premium probe (using free user token is enough)
  // Grant premium to test user
  const grant = await request(
    `/api/v1/auth/admin/users/${userId}/subscription`,
    "PATCH",
    { Authorization: `Bearer ${adminTok}` },
    {
      plan: "PREMIUM",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 86400_000).toISOString(),
      source: "admin_grant",
    }
  );
  check("Admin grant premium", grant.code === 200);

  const loginPrem = await request("/api/v1/auth/login", "POST", {}, {
    email,
    password,
  });
  const premTok = loginPrem.json?.data?.accessToken as string;
  const premProbe = await request(
    "/api/v1/auth/entitlements/probe/premium.editorial",
    "GET",
    { Authorization: `Bearer ${premTok}` }
  );
  check(
    "Premium → probe allowed",
    premProbe.code === 200 && premProbe.json?.data?.ok === true,
    `${premProbe.code} ${premProbe.raw}`
  );

  const meEnt = await request("/api/v1/auth/entitlements/me", "GET", {
    Authorization: `Bearer ${premTok}`,
  });
  check(
    "entitlements/me lists features",
    meEnt.code === 200 &&
      meEnt.json?.data?.accessTier === "PREMIUM" &&
      Array.isArray(meEnt.json?.data?.features) &&
      meEnt.json.data.features.includes("premium.editorial"),
    meEnt.raw
  );

  // cleanup
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
