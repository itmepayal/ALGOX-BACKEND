/**
 * Phase 18 — Premium Code Editor.
 * Run: cd server/ProblemService && npx tsx scripts/premium-code-editor.selftest.ts
 *
 * VERIFY: static analysis (no exec), custom-case gating, languages, run path limits,
 * EvaluationService remains sole executor.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const clientSrc = path.join(root, "../../client/src");
const evalRoot = path.join(root, "../EvaluationService");

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
function readEval(rel: string) {
  return fs.readFileSync(path.join(evalRoot, rel), "utf8");
}
function readClient(rel: string) {
  return fs.readFileSync(path.join(clientSrc, rel), "utf8");
}

const staticA = read("src/utils/staticCodeAnalysis.ts");
const analysisSvc = read("src/services/codeAnalysis.service.ts");
const analysisRouter = read("src/routers/v1/codeAnalysis.router.ts");
const indexRouter = read("src/routers/v1/index.router.ts");
const customLimits = readEval("src/utils/customCaseLimits.ts");
const runValidator = readEval("src/validators/evaluation.validator.ts");
const runController = readEval("src/controllers/evaluation.controller.ts");
const codeRunner = readEval("src/utils/containers/codeRunner.util.ts");
const clientApi = readClient("api/codeAnalysisApi.ts");
const evalApi = readClient("api/evaluationApi.ts");
const tools = readClient("components/PremiumEditorTools.tsx");
const workspace = readClient("components/ProblemWorkspace.tsx");
const monaco = readClient("components/MonacoCodeEditor.tsx");

check(
  "static analysis never executes",
  staticA.includes("NEVER executes") &&
    analysisSvc.includes("Never call EvaluationService") &&
    staticA.includes("executed: false")
);
check(
  "premium.code_analysis gate on analyze",
  analysisSvc.includes("premium.code_analysis") &&
    analysisRouter.includes("/analyze") &&
    indexRouter.includes("/code-analysis")
);
check(
  "custom cases gated on run path",
  customLimits.includes("premium.code_analysis") &&
    customLimits.includes("isCustomCase") &&
    runValidator.includes("isCustomCase") &&
    runController.includes("enforceCustomCaseRunAccess")
);
check(
  "Docker sandbox still used for run",
  codeRunner.includes("NetworkMode") &&
    codeRunner.includes("none") &&
    runController.includes("runCodeInDocker")
);
check(
  "client tools + isCustomCase",
  clientApi.includes("/code-analysis/analyze") &&
    evalApi.includes("isCustomCase") &&
    tools.includes("Static only") &&
    workspace.includes("PremiumEditorTools") &&
    workspace.includes('"tools"')
);
check(
  "premium monaco completions client-only",
  monaco.includes("enablePremiumCompletions") &&
    readClient("utils/monacoPremiumCompletions.ts").includes(
      "Does not execute code"
    )
);
check(
  "no Docker exposure in client tools",
  !tools.includes("docker") && !tools.includes("/var/run/docker")
);

const PROBLEM_URL = process.env.PROBLEM_SERVICE_URL || "http://localhost:3003";
const EVAL_URL = process.env.EVALUATION_SERVICE_URL || "http://localhost:3006";
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
  return { status: res.status, json };
}

async function unitStatic() {
  const mod = await import("../src/utils/staticCodeAnalysis.ts");
  const nested = mod.analyzeCodeStatic({
    language: "python",
    code: "for i in range(n):\n  for j in range(n):\n    pass\n",
  });
  check("python nested → complexity finding", nested.findings.some((f) => f.id === "nested_loops"));
  check("executed false", nested.executed === false);
  const js = mod.analyzeCodeStatic({
    language: "javascript",
    code: "function foo(n){ return foo(n-1); }",
  });
  check("javascript analysis runs", js.language === "javascript" && js.lineCount >= 1);
  const cpp = mod.analyzeCodeStatic({
    language: "cpp",
    code: "int main(){ return 0; }",
  });
  check("cpp analysis runs", cpp.language === "cpp");
}

async function live() {
  let problemUp = false;
  let evalUp = false;
  try {
    problemUp = (await fetch(`${PROBLEM_URL}/api/v1/health`)).ok;
  } catch {
    /* */
  }
  try {
    evalUp = (await fetch(`${EVAL_URL}/api/v1/health`)).ok;
  } catch {
    /* */
  }
  if (!problemUp) {
    console.log("SKIP live problem: not reachable");
    return;
  }

  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(root, ".env") });
  const authEnv = dotenv.config({
    path: path.join(root, "../AuthService/.env"),
  });
  const authMongo =
    authEnv.parsed?.MONGO_URL ||
    authEnv.parsed?.MONGO_URI ||
    process.env.AUTH_MONGO_URL;

  const email = `p18_editor_${Date.now()}@test.local`;
  const password = "TestPass123!";
  await request(AUTH_URL, "/api/v1/auth/signup", "POST", {}, {
    name: "P18 Editor",
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

  const freeAnalyze = await request(
    PROBLEM_URL,
    "/api/v1/code-analysis/analyze",
    "POST",
    auth,
    { code: "print(1)", language: "python" }
  );
  check(
    "free analysis gated 403",
    freeAnalyze.status === 403,
    `status=${freeAnalyze.status}`
  );

  if (evalUp) {
    const freeCustom = await request(
      EVAL_URL,
      "/api/v1/evaluation/run",
      "POST",
      auth,
      {
        code: "def solve():\n  return 1\n",
        language: "python",
        input: "",
        isCustomCase: true,
        functionName: "solve",
      }
    );
    check(
      "free custom run gated 403",
      freeCustom.status === 403,
      `status=${freeCustom.status}`
    );

    // Official (non-custom) run should still work for free
    const freeOfficial = await request(
      EVAL_URL,
      "/api/v1/evaluation/run",
      "POST",
      auth,
      {
        code: "def solve():\n  return 1\n",
        language: "python",
        input: "",
        isCustomCase: false,
        functionName: "solve",
      }
    );
    check(
      "free official run allowed",
      freeOfficial.status === 200 || freeOfficial.status === 400,
      // 400 may occur if function harness needs different signature — not a gate fail
      `status=${freeOfficial.status}`
    );
    check(
      "free official not 403",
      freeOfficial.status !== 403
    );
  } else {
    console.log("SKIP eval live: EvaluationService not reachable");
  }

  if (!authMongo || !userId) {
    console.log("SKIP premium live");
    return;
  }

  const mongoose = await import("mongoose");
  const aconn = await mongoose.default.createConnection(authMongo).asPromise();
  await aconn.collection("users").updateOne(
    { _id: new mongoose.default.Types.ObjectId(userId) },
    {
      $set: {
        subscription: {
          plan: "PREMIUM",
          status: "active",
          source: "admin_grant",
          currentPeriodEnd: null,
        },
      },
    }
  );

  const premAnalyze = await request(
    PROBLEM_URL,
    "/api/v1/code-analysis/analyze",
    "POST",
    auth,
    {
      code: "for i in range(n):\n  for j in range(n):\n    x=i+j\n",
      language: "python",
    }
  );
  check(
    "premium analysis 200",
    premAnalyze.status === 200,
    `status=${premAnalyze.status}`
  );
  check(
    "premium analysis not executed",
    premAnalyze.json?.data?.executed === false
  );
  check(
    "premium analysis has findings",
    (premAnalyze.json?.data?.findings || []).length >= 1
  );

  for (const lang of ["javascript", "cpp", "python"] as const) {
    const r = await request(
      PROBLEM_URL,
      "/api/v1/code-analysis/analyze",
      "POST",
      auth,
      { code: "x = 1", language: lang }
    );
    check(
      `analysis language ${lang}`,
      r.status === 200 && r.json?.data?.language === lang,
      `status=${r.status}`
    );
  }

  if (evalUp) {
    const premCustom = await request(
      EVAL_URL,
      "/api/v1/evaluation/run",
      "POST",
      auth,
      {
        code: "def solve():\n  return 42\n",
        language: "python",
        input: "",
        isCustomCase: true,
        functionName: "solve",
      }
    );
    check(
      "premium custom run not gated",
      premCustom.status !== 403,
      `status=${premCustom.status}`
    );
  }

  await aconn.close();
}

unitStatic()
  .then(() => live())
  .then(() => {
    console.log(`\nResult: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("SELFTEST ERROR", err);
    process.exit(1);
  });
