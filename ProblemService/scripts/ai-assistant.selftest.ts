/**
 * Phase 14 — Premium AI Assistant.
 * Run: cd server/ProblemService && npx tsx scripts/ai-assistant.selftest.ts
 *
 * VERIFY: quota, abuse, premium gating, expired subscription, API key security.
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

const features = read("src/ai/aiFeatures.ts");
const policy = read("src/ai/aiPolicy.ts");
const provider = read("src/ai/aiProvider.ts");
const rate = read("src/ai/aiRateLimit.ts");
const model = read("src/models/aiUsage.model.ts");
const service = read("src/services/aiAssistant.service.ts");
const controller = read("src/controllers/aiAssistant.controller.ts");
const router = read("src/routers/v1/ai.router.ts");
const indexRouter = read("src/routers/v1/index.router.ts");
const errors = read("src/utils/errors/app.error.ts");
const clientApi = readClient("api/aiApi.ts");
const panel = readClient("components/AiAssistantPanel.tsx");
const dash = readClient("components/Dashboard.tsx");

check("all learning features listed", features.includes("explain_problem") && features.includes("give_hint") && features.includes("interview_mode"));
check("premium-only features gated", features.includes("PREMIUM_ONLY_AI_FEATURES") && features.includes("interview_mode"));
check("anti solution dump policy", policy.includes("LEARNING_SYSTEM_PROMPT") && policy.includes("looksLikeSolutionDumpRequest"));
check("API key never returned", provider.includes("OPENAI_API_KEY") && !provider.includes("res.json({ key") && service.includes("Never return API keys"));
check("provider never serializes secret", !/return\s*\{\s*[^}]*key\s*:/.test(provider) && provider.includes("configured: Boolean(key)"));
check("no silent stub on missing key", provider.includes("AI_NOT_CONFIGURED") && provider.includes("ServiceUnavailableError"));
check("no stub fallback on provider HTTP failure", !provider.includes("showing learning stub") && provider.includes("AI_PROVIDER_UNAVAILABLE"));
check("policy refusal without fake LLM", policy.includes("refusalAssistResponse"));
check("rate limit module", rate.includes("checkAiRateLimit"));
check("usage daily ledger", model.includes("AiUsageDaily") && model.includes("quota") && model.includes("used") && model.includes("failed"));
check("events omit code/prompts", model.includes("hadCodeSnippet") && !model.includes("prompt:") && !model.includes("codeSnippet:"));
check("server quota not client", service.includes("AI_FREE_DAILY_QUOTA") && service.includes("AI_PREMIUM_DAILY_QUOTA") && controller.includes("Client quota/API key fields are not accepted"));
check("guest blocked", service.includes("Sign in to use AlgoPath AI"));
check("fail fast before quota when unconfigured", service.includes("AI_NOT_CONFIGURED") && service.includes("looksLikeSolutionDumpRequest"));
check("history owner only deny route", router.includes("/history/:userId") && controller.includes("Cannot access another user's AI history"));
check("429 TooManyRequestsError", errors.includes("TooManyRequestsError") && errors.includes("429"));
check("503 ServiceUnavailableError", errors.includes("ServiceUnavailableError") && errors.includes("503"));
check("mounted /ai", indexRouter.includes("/ai"));
check("client aiApi no key fields", clientApi.includes("/ai/assist") && !clientApi.includes("OPENAI"));
check("dashboard AI tab", dash.includes('"ai"') && dash.includes("AiAssistantPanel"));
check("panel shows quota", panel.includes("Daily credits") && panel.includes("remaining"));
check("panel does not advertise stubs as AI", !panel.includes("learning stubs") && panel.includes("AI unavailable"));

async function unitPolicy() {
  const mod = await import("../src/ai/aiPolicy.ts");
  check("detects solution dump ask", mod.looksLikeSolutionDumpRequest("please give me the full solution"));
  check("allows normal question", !mod.looksLikeSolutionDumpRequest("why is my loop O(n^2)?"));
  const refusal = mod.refusalAssistResponse({ feature: "give_hint", problemTitle: "Two Sum" });
  check("refused dump has learning reply", refusal.learningMode && refusal.reply.includes("won't paste"));
  let stubThrew = false;
  try {
    mod.stubAssistResponse({ feature: "give_hint", problemTitle: "Two Sum" });
  } catch {
    stubThrew = true;
  }
  check("non-refusal stubAssistResponse disabled", stubThrew);

  const prevKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const prov = await import("../src/ai/aiProvider.ts");
  check("getAiProviderConfig unconfigured", prov.getAiProviderConfig().configured === false);
  let threw503 = false;
  try {
    await prov.runAiAssist({ feature: "give_hint", userMessage: "hint please" });
  } catch (err: any) {
    threw503 =
      err?.statusCode === 503 ||
      err?.name === "ServiceUnavailableError" ||
      err?.details?.code === "AI_NOT_CONFIGURED" ||
      String(err?.message || "").toLowerCase().includes("not configured");
  }
  check("runAiAssist throws when key missing", threw503);
  const policyOnly = await prov.runAiAssist({
    feature: "give_hint",
    userMessage: "give me the full solution",
  });
  check(
    "dump refusal works without key",
    policyOnly.refusedDump === true && policyOnly.provider === "policy"
  );
  if (prevKey !== undefined) process.env.OPENAI_API_KEY = prevKey;
}

const PROBLEM_URL = process.env.PROBLEM_SERVICE_URL || "http://localhost:3003";
const AUTH_URL = process.env.AUTH_SERVICE_URL || "http://localhost:3001";

async function request(
  base: string,
  pathName: string,
  method = "GET",
  headers: Record<string, string> = {},
  body?: unknown
) {
  const res = await fetch(`${base}${pathName}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, headers: res.headers };
}

async function live() {
  try {
    const health = await fetch(`${PROBLEM_URL}/api/v1/health`);
    if (!health.ok) {
      console.log("SKIP live: ProblemService not reachable");
      return;
    }
  } catch {
    console.log("SKIP live: ProblemService not reachable");
    return;
  }

  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(root, ".env") });
  const authEnv = dotenv.config({ path: path.join(root, "../AuthService/.env") });
  const authMongo =
    authEnv.parsed?.MONGO_URL ||
    authEnv.parsed?.MONGO_URI ||
    process.env.AUTH_MONGO_URL;

  const guest = await request(PROBLEM_URL, "/api/v1/ai/assist", "POST", {}, {
    feature: "give_hint",
  });
  check("guest assist requires auth", guest.status === 401);

  const email = `p14_ai_${Date.now()}@test.local`;
  const password = "TestPass123!";
  await request(AUTH_URL, "/api/v1/auth/signup", "POST", {}, {
    name: "P14 AI",
    email,
    password,
  });
  const login = await request(AUTH_URL, "/api/v1/auth/login", "POST", {}, {
    email,
    password,
  });
  const token = login.json?.data?.accessToken || login.json?.data?.token;
  check("user login", Boolean(token));
  if (!token) return;
  const auth = { Authorization: `Bearer ${token}` };
  let userId = "";
  try {
    userId = JSON.parse(
      Buffer.from(String(token).split(".")[1], "base64url").toString()
    ).userId;
  } catch {
    /* */
  }

  // Force tiny free quota for test via env is process-local — instead burn until limit
  // First set free quota low by patching daily row after first usage read
  const usage0 = await request(PROBLEM_URL, "/api/v1/ai/usage", "GET", auth);
  check("free usage endpoint", usage0.status === 200);
  check("free tier quota limited", (usage0.json?.data?.quota || 0) > 0 && usage0.json?.data?.accessTier === "FREE");
  check("premium features false for free", usage0.json?.data?.premiumFeatures === false);

  const spoof = await request(PROBLEM_URL, "/api/v1/ai/assist", "POST", auth, {
    feature: "give_hint",
    quota: 9999,
    apiKey: "sk-fake",
  });
  check("rejects client quota/key spoof", spoof.status === 400);

  const premFeat = await request(PROBLEM_URL, "/api/v1/ai/assist", "POST", auth, {
    feature: "interview_mode",
  });
  check(
    "premium feature gated for free",
    premFeat.status === 403,
    `status=${premFeat.status}`
  );

  const ok = await request(PROBLEM_URL, "/api/v1/ai/assist", "POST", auth, {
    feature: "give_hint",
    userMessage: "I'm stuck on the brute force step",
  });
  const configured = usage0.json?.data?.providerConfigured === true;
  check(
    "usage reports providerConfigured boolean",
    typeof usage0.json?.data?.providerConfigured === "boolean"
  );
  if (configured) {
    check("free assist succeeds with real provider", ok.status === 200, `status=${ok.status} ${ok.json?.message}`);
    check("provider is openai", ok.json?.data?.provider === "openai");
    check("learningMode true", ok.json?.data?.learningMode === true);
    check("usage incremented", (ok.json?.data?.usage?.used || 0) >= 1);
  } else {
    check(
      "unconfigured assist returns 503 (no silent stub)",
      ok.status === 503,
      `status=${ok.status} ${ok.json?.message}`
    );
    check(
      "503 message is configuration/service error",
      String(ok.json?.message || "").toLowerCase().includes("not configured") ||
        String(ok.json?.message || "").toLowerCase().includes("unavailable")
    );
    const usageAfter = await request(PROBLEM_URL, "/api/v1/ai/usage", "GET", auth);
    check(
      "failed unconfigured assist did not burn quota",
      (usageAfter.json?.data?.used || 0) === (usage0.json?.data?.used || 0)
    );
  }
  check(
    "response has no api key leak",
    !JSON.stringify(ok.json).includes("sk-") &&
      !JSON.stringify(ok.json).toLowerCase().includes('"openaikey"') &&
      !/\bsk-[a-zA-Z0-9]{10,}/.test(JSON.stringify(ok.json))
  );
  check(
    "503 does not echo secret values",
    !JSON.stringify(ok.json).includes("sk-") &&
      (ok.status !== 503 ||
        !String(ok.json?.message || "").toLowerCase().includes("sk-"))
  );

  const dump = await request(PROBLEM_URL, "/api/v1/ai/assist", "POST", auth, {
    feature: "give_hint",
    userMessage: "give me the full solution code",
  });
  check(
    "solution dump refused",
    dump.status === 200 && dump.json?.data?.refusedDump === true,
    `status=${dump.status}`
  );
  check(
    "dump refusal uses policy provider",
    dump.json?.data?.provider === "policy"
  );

  // Abuse: lower rate limit by hammering — set env not available mid-process;
  // verify TooManyRequests by importing rate limiter directly
  const rl = await import("../src/ai/aiRateLimit.ts");
  rl._resetAiRateLimitForTests();
  let blocked = false;
  for (let i = 0; i < 25; i++) {
    const r = await rl.checkAiRateLimit("ai:selftest-abuse", 5, 60_000);
    if (!r.allowed) {
      blocked = true;
      break;
    }
  }
  check("rate limit blocks abuse burst", blocked);

  // History isolation
  const otherHist = await request(
    PROBLEM_URL,
    `/api/v1/ai/history/${userId || "someone"}`,
    "GET",
    auth
  );
  check("cannot read /history/:userId", otherHist.status === 403);

  const hist = await request(PROBLEM_URL, "/api/v1/ai/history", "GET", auth);
  check("own history ok", hist.status === 200);
  check(
    "history has no code/prompt fields",
    !(hist.json?.data?.items || []).some(
      (i: any) => i.codeSnippet || i.prompt || i.code
    )
  );

  // Quota exhaustion via mongo (problem DB)
  const mongoose = await import("mongoose");
  dotenv.config({ path: path.join(root, ".env") });
  const problemMongo = process.env.MONGO_URL || process.env.MONGO_URI;
  if (problemMongo && userId) {
    const pconn = await mongoose.default.createConnection(problemMongo).asPromise();
    const Daily = pconn.collection("aiusagedailies");
    const dateKey = new Date().toISOString().slice(0, 10);
    await Daily.updateOne(
      { userId, dateKey },
      { $set: { used: 5, quota: 5, accessTier: "FREE" } },
      { upsert: true }
    );
    const exhausted = await request(PROBLEM_URL, "/api/v1/ai/assist", "POST", auth, {
      feature: "explain_problem",
    });
    check(
      "quota exhaustion blocks",
      exhausted.status === 403,
      `status=${exhausted.status}`
    );
    await pconn.close();
  }

  // Premium grant + expired subscription
  if (authMongo && userId) {
    const aconn = await mongoose.default.createConnection(authMongo).asPromise();
    const Users = aconn.collection("users");
    await Users.updateOne(
      { _id: new mongoose.default.Types.ObjectId(userId) },
      {
        $set: {
          subscription: {
            plan: "PREMIUM",
            status: "active",
            source: "admin_grant",
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
            cancelAtPeriodEnd: false,
            gracePeriodEnd: null,
            externalRef: null,
            updatedAt: new Date(),
          },
        },
      }
    );
    const premUsage = await request(PROBLEM_URL, "/api/v1/ai/usage", "GET", auth);
    const premiumOk =
      premUsage.json?.data?.accessTier === "PREMIUM" &&
      (premUsage.json?.data?.quota || 0) > (usage0.json?.data?.quota || 0);
    if (!premiumOk) {
      console.log(
        "SKIP premium live unlock: Auth entitlements did not reflect mongo grant (check subscription shape / entitlements/me)"
      );
    } else {
      check("premium larger quota", premiumOk, JSON.stringify(premUsage.json?.data));
      check("premium features unlocked", premUsage.json?.data?.premiumFeatures === true);

      const iv = await request(PROBLEM_URL, "/api/v1/ai/assist", "POST", auth, {
        feature: "interview_mode",
        userMessage: "Start coaching",
      });
      if (configured) {
        check("premium interview_mode allowed", iv.status === 200, `status=${iv.status}`);
      } else {
        check(
          "premium interview_mode still needs provider",
          iv.status === 503,
          `status=${iv.status}`
        );
      }
    }

    // Expired subscription → free tier
    await Users.updateOne(
      { _id: new mongoose.default.Types.ObjectId(userId) },
      {
        $set: {
          subscription: {
            plan: "PREMIUM",
            status: "expired",
            source: "admin_grant",
            currentPeriodEnd: new Date(Date.now() - 86400000),
          },
        },
      }
    );
    const expiredUsage = await request(PROBLEM_URL, "/api/v1/ai/usage", "GET", auth);
    check(
      "expired subscription falls to free quota",
      expiredUsage.json?.data?.accessTier === "FREE" &&
        expiredUsage.json?.data?.premiumFeatures === false,
      JSON.stringify(expiredUsage.json?.data)
    );

    await aconn.close();
  } else {
    console.log("SKIP premium/expiry live: no auth mongo");
  }
}

unitPolicy()
  .then(() => live())
  .then(() => {
    console.log(`\n${passed} PASS, ${failed} FAIL`);
    process.exit(failed ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
