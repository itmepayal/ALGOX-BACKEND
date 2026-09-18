/**
 * Phase 04 — Subscription API selftest.
 * Run: cd server/AuthService && npx ts-node --transpile-only scripts/subscription-api.selftest.ts
 */
import http from "http";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { subscriptionService } from "../src/subscription/subscription.service";
import { Subscription } from "../src/models/subscription.model";
import { SubscriptionEvent } from "../src/models/subscriptionEvent.model";
import { User } from "../src/models/user.model";
import { SecurityLog } from "../src/models/securityLog.model";

dotenv.config();

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
          resolve({ code: res.statusCode || 0, json, raw: b.slice(0, 800) });
        });
      }
    );
    req.on("error", (e) => resolve({ code: 0, json: null, raw: String(e) }));
    if (data) req.write(data);
    req.end();
  });
}

function hasSecretLeak(obj: unknown): boolean {
  const s = JSON.stringify(obj || {});
  return (
    /providerSubscriptionId|providerCustomerId|providerEventId|"payload"|cardNumber|cvv|clientSecret/i.test(
      s
    )
  );
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

  const health = await request("/api/v1/health", "GET");
  if (health.code !== 200) {
    console.error("AuthService not up — abort");
    process.exit(1);
  }

  const guest = await request("/api/v1/auth/subscription", "GET");
  check("Guest → 401", guest.code === 401, `${guest.code} ${guest.raw}`);

  const stamp = Date.now();
  const emailA = `subapi-a-${stamp}@example.com`;
  const emailB = `subapi-b-${stamp}@example.com`;
  const password = "SubApiPhase04!";

  const signupA = await request("/api/v1/auth/signup", "POST", {}, {
    name: "Sub A",
    email: emailA,
    password,
  });
  check("Signup A", signupA.code === 201, `${signupA.code}`);
  const userIdA = String(signupA.json?.data?.id || "");

  const signupB = await request("/api/v1/auth/signup", "POST", {}, {
    name: "Sub B",
    email: emailB,
    password,
  });
  check("Signup B", signupB.code === 201);
  const userIdB = String(signupB.json?.data?.id || "");

  const loginA = await request("/api/v1/auth/login", "POST", {}, {
    email: emailA,
    password,
  });
  const tokA = loginA.json?.data?.accessToken as string;
  check("Login A", !!tokA);

  const loginB = await request("/api/v1/auth/login", "POST", {}, {
    email: emailB,
    password,
  });
  const tokB = loginB.json?.data?.accessToken as string;
  check("Login B", !!tokB);

  const freeGet = await request("/api/v1/auth/subscription", "GET", {
    Authorization: `Bearer ${tokA}`,
  });
  check("Free → subscription 200", freeGet.code === 200, `${freeGet.code}`);
  check(
    "Free → null live or FREE entitlement",
    freeGet.json?.data?.entitlement?.plan === "FREE" &&
      (freeGet.json?.data?.subscription == null ||
        freeGet.json?.data?.entitlement?.status === "none"),
    freeGet.raw
  );
  check("Free response has no secrets", !hasSecretLeak(freeGet.json));

  const freeEnt = await request("/api/v1/auth/subscription/entitlements", "GET", {
    Authorization: `Bearer ${tokA}`,
  });
  check(
    "Free entitlements",
    freeEnt.code === 200 &&
      freeEnt.json?.data?.accessTier === "FREE" &&
      Array.isArray(freeEnt.json?.data?.features),
    freeEnt.raw
  );

  // Grant premium via backend SoT (not client API)
  const mongoUrl = process.env.MONGO_URL;
  if (!mongoUrl) {
    console.error("MONGO_URL required for premium grant path");
    process.exit(1);
  }
  await mongoose.connect(mongoUrl);

  try {
    await subscriptionService.upsertLiveSubscription({
      userId: userIdA,
      plan: "PREMIUM",
      status: "ACTIVE",
      provider: "admin",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
      eventType: "selftest.grant",
    });

    const premGet = await request("/api/v1/auth/subscription", "GET", {
      Authorization: `Bearer ${tokA}`,
    });
    check(
      "Premium → active subscription",
      premGet.code === 200 &&
        premGet.json?.data?.subscription?.status === "ACTIVE" &&
        premGet.json?.data?.entitlement?.plan === "PREMIUM" &&
        premGet.json?.data?.entitlement?.status === "active",
      premGet.raw
    );
    check("Premium response has no secrets", !hasSecretLeak(premGet.json));

    const badActivate = await request(
      "/api/v1/auth/subscription",
      "POST",
      { Authorization: `Bearer ${tokA}` },
      { plan: "PREMIUM", status: "ACTIVE" }
    );
    check(
      "POST /subscription activate forbidden",
      badActivate.code === 400 &&
        badActivate.json?.code === "SUBSCRIPTION_ACTIVATE_FORBIDDEN",
      badActivate.raw
    );

    const invalidCancel = await request(
      "/api/v1/auth/subscription/cancel",
      "POST",
      { Authorization: `Bearer ${tokA}` },
      { plan: "PREMIUM", status: "ACTIVE" }
    );
    check(
      "invalid cancel body → validation error",
      invalidCancel.code === 400 &&
        invalidCancel.json?.success === false &&
        String(invalidCancel.json?.message || "")
          .toLowerCase()
          .includes("validation"),
      invalidCancel.raw
    );

    const cancel1 = await request(
      "/api/v1/auth/subscription/cancel",
      "POST",
      { Authorization: `Bearer ${tokA}` },
      {}
    );
    check(
      "cancel → cancelAtPeriodEnd",
      cancel1.code === 200 &&
        cancel1.json?.data?.subscription?.cancelAtPeriodEnd === true &&
        cancel1.json?.data?.idempotent === false,
      cancel1.raw
    );

    const cancel2 = await request(
      "/api/v1/auth/subscription/cancel",
      "POST",
      { Authorization: `Bearer ${tokA}` },
      {}
    );
    check(
      "cancel duplicate → idempotent",
      cancel2.code === 200 &&
        cancel2.json?.data?.idempotent === true &&
        cancel2.json?.data?.subscription?.cancelAtPeriodEnd === true,
      cancel2.raw
    );

    const stillPremium = await request("/api/v1/auth/subscription", "GET", {
      Authorization: `Bearer ${tokA}`,
    });
    check(
      "after cancel still entitled until period end",
      stillPremium.json?.data?.entitlement?.plan === "PREMIUM" &&
        stillPremium.json?.data?.entitlement?.cancelAtPeriodEnd === true,
      stillPremium.raw
    );

    const resume1 = await request(
      "/api/v1/auth/subscription/resume",
      "POST",
      { Authorization: `Bearer ${tokA}` },
      {}
    );
    check(
      "resume clears cancelAtPeriodEnd",
      resume1.code === 200 &&
        resume1.json?.data?.subscription?.cancelAtPeriodEnd === false &&
        resume1.json?.data?.idempotent === false,
      resume1.raw
    );

    const resume2 = await request(
      "/api/v1/auth/subscription/resume",
      "POST",
      { Authorization: `Bearer ${tokA}` },
      {}
    );
    check(
      "resume duplicate → idempotent",
      resume2.code === 200 && resume2.json?.data?.idempotent === true,
      resume2.raw
    );

    const histA = await request("/api/v1/auth/subscription/history", "GET", {
      Authorization: `Bearer ${tokA}`,
    });
    check(
      "history returns subscriptions+events",
      histA.code === 200 &&
        Array.isArray(histA.json?.data?.subscriptions) &&
        histA.json.data.subscriptions.length >= 1 &&
        Array.isArray(histA.json?.data?.events),
      histA.raw
    );
    check("history has no webhook payload leak", !hasSecretLeak(histA.json));

    // User B cannot see A's subscription via own endpoints (owner-scoped)
    const getB = await request("/api/v1/auth/subscription", "GET", {
      Authorization: `Bearer ${tokB}`,
    });
    check(
      "User B sees own FREE not A's premium",
      getB.code === 200 &&
        (getB.json?.data?.subscription == null ||
          getB.json?.data?.entitlement?.plan === "FREE") &&
        getB.json?.data?.entitlement?.plan !== "PREMIUM",
      getB.raw
    );

    const histB = await request("/api/v1/auth/subscription/history", "GET", {
      Authorization: `Bearer ${tokB}`,
    });
    const bHasA = (histB.json?.data?.subscriptions || []).some(
      (s: any) => s?.id && histA.json?.data?.subscriptions?.[0]?.id === s.id
    );
    check("User B history does not include User A rows", !bHasA);

    // Free cancel is idempotent no-op
    const cancelFree = await request(
      "/api/v1/auth/subscription/cancel",
      "POST",
      { Authorization: `Bearer ${tokB}` },
      {}
    );
    check(
      "Free cancel idempotent",
      cancelFree.code === 200 && cancelFree.json?.data?.idempotent === true,
      cancelFree.raw
    );

    const audit = await SecurityLog.findOne({
      userId: userIdA,
      action: "subscription.cancel",
    }).lean();
    check("cancel wrote security audit", Boolean(audit));
  } finally {
    if (userIdA) {
      await Subscription.deleteMany({ userId: userIdA });
      await SubscriptionEvent.deleteMany({ userId: userIdA });
      await SecurityLog.deleteMany({ userId: userIdA });
      await User.deleteOne({ _id: userIdA });
    }
    if (userIdB) {
      await Subscription.deleteMany({ userId: userIdB });
      await SubscriptionEvent.deleteMany({ userId: userIdB });
      await SecurityLog.deleteMany({ userId: userIdB });
      await User.deleteOne({ _id: userIdB });
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
