/**
 * Adaptive Problem Recommendation V1 — Live API E2E Verification Script
 * Run: cd server/ProblemService && npx tsx scripts/recommendation.e2e.ts
 */
async function main() {
  const AUTH = process.env.AUTH_URL || "http://localhost:3001";
  const PROB = process.env.PROB_URL || "http://localhost:3003";

  async function req(
    base: string,
    path: string,
    method = "GET",
    token?: string,
    body?: unknown
  ) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  console.log("1. Testing unauthenticated GET /api/v1/recommendations/me (should fail 401)...");
  const unauth = await req(PROB, "/api/v1/recommendations/me");
  if (unauth.status !== 401) {
    throw new Error(`Expected 401 Unauthenticated, got status ${unauth.status}`);
  }
  console.log("✓ Correctly returned 401 for unauthenticated request");

  console.log("2. Creating test user and authenticating...");
  const stamp = Date.now();
  const email = `rec_user_${stamp}@test.local`;
  await req(AUTH, "/api/v1/auth/signup", "POST", undefined, {
    name: "Recommendation Tester",
    email,
    password: "TestPass123!",
  });
  const login = await req(AUTH, "/api/v1/auth/login", "POST", undefined, {
    email,
    password: "TestPass123!",
  });
  const token = login.json?.data?.accessToken;
  if (!token) {
    throw new Error("Login failed during E2E setup");
  }
  console.log("✓ Authenticated test user");

  console.log("3. Testing GET /api/v1/recommendations/me...");
  const recRes = await req(PROB, "/api/v1/recommendations/me?limit=5", "GET", token);
  if (recRes.status !== 200 || !recRes.json?.success) {
    throw new Error(`Failed to fetch recommendations: ${JSON.stringify(recRes.json)}`);
  }
  const data = recRes.json.data;
  if (!data.summary || !Array.isArray(data.recommendations)) {
    throw new Error("Invalid recommendation payload structure");
  }
  console.log("✓ Recommendations fetched successfully. Summary:", data.summary);
  console.log(`✓ Retried ${data.recommendations.length} recommendations`);

  if (data.recommendations.length > 0) {
    const top = data.recommendations[0];
    console.log(`Top recommendation: ${top.title} (${top.difficulty}) — ${top.reason}`);
    if (!top.problemId || !top.title || !top.reason) {
      throw new Error("Top recommendation missing required fields");
    }
  }

  console.log("4. Testing GET /api/v1/problems/recommendations alias...");
  const aliasRes = await req(PROB, "/api/v1/problems/recommendations", "GET", token);
  if (aliasRes.status !== 200 || !aliasRes.json?.success) {
    throw new Error(`Failed to fetch alias recommendations: ${JSON.stringify(aliasRes.json)}`);
  }
  console.log("✓ Alias endpoint working correctly");

  console.log("\n========================================");
  console.log("ADAPTIVE RECOMMENDATION E2E TEST PASSED");
  console.log("========================================\n");
}

main().catch((err) => {
  console.error("FAIL Adaptive Recommendation E2E:", err);
  process.exit(1);
});
