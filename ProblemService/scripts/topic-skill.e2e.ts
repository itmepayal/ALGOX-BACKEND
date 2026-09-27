/**
 * Topic-wise Skill Rating V1 — Live API E2E Verification Script
 * Run: cd server/ProblemService && npx tsx scripts/topic-skill.e2e.ts
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

  console.log("1. Testing unauthenticated GET /api/v1/skills/me (should fail 401)...");
  const unauth = await req(PROB, "/api/v1/skills/me");
  if (unauth.status !== 401) {
    throw new Error(`Expected 401 Unauthenticated, got status ${unauth.status}`);
  }
  console.log("✓ Correctly returned 401 for unauthenticated request");

  console.log("2. Creating test user and authenticating...");
  const stamp = Date.now();
  const email = `skill_user_${stamp}@test.local`;
  await req(AUTH, "/api/v1/auth/signup", "POST", undefined, {
    name: "Skill Tester",
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

  console.log("3. Testing GET /api/v1/skills/me for new user (cold start)...");
  const profileRes = await req(PROB, "/api/v1/skills/me", "GET", token);
  if (profileRes.status !== 200 || !profileRes.json?.success) {
    throw new Error(`Failed to fetch user skill profile: ${JSON.stringify(profileRes.json)}`);
  }
  const data = profileRes.json.data;
  if (data.overall === undefined || !Array.isArray(data.topics)) {
    throw new Error("Invalid skill profile payload structure");
  }
  console.log("✓ Cold start profile fetched:", data.overall);

  console.log("4. Testing POST /api/v1/skills/me/recalculate...");
  const recalcRes = await req(PROB, "/api/v1/skills/me/recalculate", "POST", token);
  if (recalcRes.status !== 200 || !recalcRes.json?.success) {
    throw new Error(`Failed to recalculate skill profile: ${JSON.stringify(recalcRes.json)}`);
  }
  console.log("✓ Skill recalculation executed successfully");

  console.log("\n========================================");
  console.log("TOPIC SKILL RATING E2E TEST PASSED");
  console.log("========================================\n");
}

main().catch((err) => {
  console.error("FAIL Topic Skill E2E:", err);
  process.exit(1);
});
