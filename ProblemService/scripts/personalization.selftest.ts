/**
 * Personalization smoke — bookmark ≠ favourite ≠ important ≠ revision; user isolation.
 * Run (services up): npx ts-node scripts/personalization.selftest.ts
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

  const stamp = Date.now();
  const mk = async (tag: string) => {
    const email = `pers_st_${tag}_${stamp}@test.local`;
    await req(AUTH, "/api/v1/auth/signup", "POST", undefined, {
      name: "Pers",
      email,
      password: "TestPass123!",
    });
    const login = await req(AUTH, "/api/v1/auth/login", "POST", undefined, {
      email,
      password: "TestPass123!",
    });
    return login.json?.data?.accessToken as string;
  };

  const tokA = await mk("a");
  const tokB = await mk("b");
  if (!tokA || !tokB) throw new Error("login failed");

  const unauth = await req(PROB, "/api/v1/problems/personalization/summary");
  if (unauth.status !== 401) throw new Error(`expected 401, got ${unauth.status}`);

  const list = await req(PROB, "/api/v1/problems?limit=1", "GET", tokA);
  const data = list.json?.data;
  const items = data?.problems || data?.items || data;
  const pid = items?.[0]?._id || items?.[0]?.id;
  if (!pid) throw new Error("no problem");

  await req(PROB, `/api/v1/problems/${pid}/bookmark`, "POST", tokA);
  await req(PROB, `/api/v1/problems/${pid}/favourite`, "POST", tokA);
  await req(PROB, `/api/v1/problems/${pid}/important/toggle`, "POST", tokA);
  await req(PROB, `/api/v1/problems/${pid}/revision`, "POST", tokA);
  await req(
    PROB,
    `/api/v1/problems/${pid}/personal-confidence`,
    "PATCH",
    tokA,
    { confidence: "difficult" }
  );

  const engA = await req(PROB, `/api/v1/problems/${pid}/engagement`, "GET", tokA);
  const engB = await req(PROB, `/api/v1/problems/${pid}/engagement`, "GET", tokB);
  const a = engA.json?.data || {};
  const b = engB.json?.data || {};

  const checks = [
    a.isBookmarked === true,
    a.isFavourite === true,
    a.isImportant === true,
    a.isRevision === true,
    a.personalConfidence === "difficult",
    b.isBookmarked === false,
    b.isFavourite === false,
    b.isImportant === false,
    b.isRevision === false,
    b.personalConfidence == null,
  ];
  if (checks.some((c) => !c)) {
    console.error("FAIL", { a, b });
    process.exit(1);
  }
  console.log("PASS personalization selftest");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
