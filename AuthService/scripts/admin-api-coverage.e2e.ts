/**
 * Section 12 live smoke — challenge CMS + report assign + related admin GETs.
 * Run: cd server/AuthService && npx tsx scripts/admin-api-coverage.e2e.ts
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { User } from "../src/models/user.model";

async function main() {
  await mongoose.connect(process.env.MONGO_URL!);
  const stamp = Date.now();
  const password = "TestPass123!";
  const admin = await User.create({
    name: "Coverage Admin",
    email: `cov-admin-${stamp}@example.invalid`,
    password,
    role: "admin",
    status: "active",
    isEmailVerified: true,
  });
  const secret = process.env.JWT_SECRET || "super_secret_jwt_access_key";
  const token = jwt.sign(
    { userId: String(admin._id), email: admin.email, role: "admin" },
    secret,
    { expiresIn: "15m" }
  );
  const AUTH = "http://localhost:3001/api/v1";
  const PROB = "http://localhost:3003/api/v1";
  const DISC = "http://localhost:3008/api/v1";

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

  const probs = await fetch(
    `${PROB}/problems/admin/list?limit=1&status=published`,
    { headers: { Authorization: `Bearer ${token}` } }
  ).then((r) => r.json() as Promise<any>);
  const problemId = probs?.data?.[0]?.id || probs?.data?.[0]?._id;
  check("list published problem", Boolean(problemId), probs?.message);

  if (problemId) {
    const upsert = await fetch(`${PROB}/challenges/admin/2099-12-31`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        problemId,
        tier: "standard",
        isPublished: true,
      }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
    check(
      "challenge admin upsert",
      upsert.status === 200 && upsert.body?.data?.dateKey === "2099-12-31",
      `${upsert.status} ${upsert.body?.message}`
    );
  }

  const user = await User.create({
    name: "Reporter",
    email: `cov-rep-${stamp}@example.invalid`,
    password,
    role: "user",
    status: "active",
    isEmailVerified: true,
  });
  const userTok = jwt.sign(
    { userId: String(user._id), email: user.email, role: "user" },
    secret,
    { expiresIn: "15m" }
  );
  const created = await fetch(`${DISC}/discussions/reports`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userTok}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      targetType: "DISCUSSION",
      targetId: new mongoose.Types.ObjectId().toString(),
      reason: "SPAM",
      description: "coverage",
    }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const reportId = created.body?.data?._id || created.body?.data?.id;
  check("create report", created.status < 300 && Boolean(reportId), String(created.status));

  if (reportId) {
    const assign = await fetch(
      `${DISC}/discussions/admin/reports/${reportId}/assign`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    ).then(async (r) => ({ status: r.status, body: await r.json() }));
    check(
      "report assign",
      assign.status === 200 && Boolean(assign.body?.data?.assignedTo),
      `${assign.status} ${assign.body?.message}`
    );
  }

  const sub = await fetch(`${AUTH}/auth/admin/users/${user._id}/subscription`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan: "PREMIUM",
      status: "active",
      source: "admin_grant",
      currentPeriodEnd: new Date(Date.now() + 86400000).toISOString(),
    }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  check(
    "subscription grant",
    sub.status === 200 && sub.body?.data?.accessTier === "PREMIUM",
    `${sub.status} ${sub.body?.data?.accessTier}`
  );

  for (const [name, url] of [
    ["settings GET", `${AUTH}/auth/admin/settings`],
    ["audit GET", `${AUTH}/auth/admin/audit-logs?limit=1`],
    ["notifications GET", `${AUTH}/auth/admin/notifications?limit=1`],
    ["favourites GET", `${PROB}/problems/admin/favourite-analytics`],
    ["learning revision GET", `${PROB}/admin/learning/revision-summary`],
  ] as const) {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    check(name, r.status === 200, String(r.status));
  }

  // User denied challenge CMS
  const deny = await fetch(`${PROB}/challenges/admin/2099-12-31`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${userTok}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ problemId: String(problemId || admin._id) }),
  });
  check("user denied challenge CMS", deny.status === 403, String(deny.status));

  await User.deleteMany({ _id: { $in: [admin._id, user._id] } });
  await mongoose.disconnect();
  console.log(`\nE2E ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
