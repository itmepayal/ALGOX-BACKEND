/**
 * Phase 09 — Premium problem system checks (static + optional live).
 * Run: cd server/ProblemService && npx tsx scripts/premium-problems.selftest.ts
 *
 * VERIFY: guest / free / premium / direct API / modified frontend cannot leak content.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const clientRoot = path.join(root, "../../client/src");

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
  return fs.readFileSync(path.join(clientRoot, rel), "utf8");
}

const model = read("src/models/problem.model.ts");
const access = read("src/utils/problemAccess.ts");
const ent = read("src/utils/entitlementClient.ts");
const validator = read("src/validators/problem.validator.ts");
const router = read("src/routers/v1/problem.router.ts");
const controller = read("src/controllers/problem.controller.ts");
const contentSvc = fs.readFileSync(
  path.join(root, "../ContentService/src/services/content.service.ts"),
  "utf8"
);
const sheet = readClient("components/ProblemsSheet.tsx");
const workspace = readClient("components/ProblemWorkspace.tsx");
const editor = readClient("components/admin/problems/ProblemEditorPage.tsx");

check("model has isPremium", model.includes("isPremium"));
check("problemAccess locks premium without entitlement", access.includes("lockPremiumProblem") && access.includes("accessLocked"));
check("sheet-free membership gate", access.includes("isSheetFree") && access.includes("freeSheetProblemIds"));
check("never sends referenceSolutions publicly", access.includes("delete pObj.referenceSolutions"));
check("editorial/hints gated separately", access.includes("editorialLocked") && access.includes("hintsLocked"));
check("entitlement client uses Auth SoT", ent.includes("entitlements/me"));
check("solve-access internal route", router.includes("solve-access"));
check("query access all|free|premium", validator.includes('"all", "free", "premium"'));
check("bulk premium action", validator.includes('"premium"') && validator.includes("isPremium"));
check("optional JWT on public GETs", router.includes("optionalAuthenticateJwt"));
check("controller resolves entitlements", controller.includes("resolveEntitlements"));
check("content editorial redacts solutions", contentSvc.includes("accessLocked") && contentSvc.includes("solutions: []"));
check("sheet All/Free/Premium filter", sheet.includes('aria-label="Access"') && sheet.includes('value="premium"'));
check("sheet premium badge + lock", sheet.includes("PremiumBadge") && sheet.includes("Lock"));
check("workspace lock + upgrade CTA", workspace.includes("accessLocked") && workspace.includes('feature="premium.problems"'));
check("admin classification UI", editor.includes("Access") && editor.includes("isPremium: true"));

const sheetModel = read("src/models/sheet.model.ts");
const sheetFree = read("src/utils/sheetFreeAccess.ts");
const submissionApi = fs.readFileSync(
  path.join(root, "../SubmissionService/src/apis/problem.api.ts"),
  "utf8"
);
check("sheet model has access FREE|PREMIUM", sheetModel.includes('"FREE"') && sheetModel.includes('"PREMIUM"'));
check("sheetFreeAccess cache helper", sheetFree.includes("getFreeSheetProblemIdSet"));
check("submission asserts solve-access", submissionApi.includes("assertProblemSolveAccess") && submissionApi.includes("solve-access"));

// Live API checks when ProblemService is up
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
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function live() {
  try {
    const health = await fetch(`${PROBLEM_URL}/api/v1/problems?limit=1`, {
      method: "GET",
    });
    if (!health.ok && health.status !== 200) {
      console.log("SKIP live: ProblemService not reachable");
      return;
    }
  } catch {
    console.log("SKIP live: ProblemService not reachable");
    return;
  }

  // Guest list — must not leak editorial on locked premium rows
  const list = await request(PROBLEM_URL, "/api/v1/problems?limit=50&access=premium");
  check("guest can list premium filter", list.status === 200);
  const problems = Array.isArray(list.json?.data) ? list.json.data : [];
  const locked = problems.filter((p: any) => p.isPremium || p.accessLocked);
  if (locked.length) {
    const sample = locked[0];
    check(
      "guest premium row is locked / empty description",
      Boolean(sample.accessLocked) &&
        (!sample.description || sample.description === "") &&
        !sample.editorial &&
        !(sample.hints && sample.hints.length)
    );
    check(
      "guest still sees title/difficulty/tags",
      Boolean(sample.title) && Boolean(sample.difficulty)
    );
    const direct = await request(
      PROBLEM_URL,
      `/api/v1/problems/${sample.id || sample._id}`
    );
    const d = direct.json?.data || {};
    check(
      "direct API guest cannot get premium body",
      Boolean(d.accessLocked) &&
        (!d.description || d.description === "") &&
        !d.editorial &&
        !d.referenceSolutions
    );
  } else {
    console.log("SKIP live locked sample: no premium problems in DB yet");
  }

  // Free signup → still locked
  const email = `p09_${Date.now()}@test.local`;
  const password = "TestPass123!";
  await request(AUTH_URL, "/api/v1/auth/signup", "POST", {}, {
    name: "P09 Free",
    email,
    password,
  });
  const login = await request(AUTH_URL, "/api/v1/auth/login", "POST", {}, {
    email,
    password,
  });
  const token = login.json?.data?.accessToken || login.json?.data?.token;
  check("free user login", Boolean(token));

  if (token && locked.length) {
    const sample = locked[0];
    const freeGet = await request(
      PROBLEM_URL,
      `/api/v1/problems/${sample.id || sample._id}`,
      "GET",
      { Authorization: `Bearer ${token}` }
    );
    const d = freeGet.json?.data || {};
    check(
      "free JWT still redacts premium problem",
      Boolean(d.accessLocked) && (!d.description || d.description === "")
    );

    // Tampered client: request with forged features header must not unlock
    const forged = await request(
      PROBLEM_URL,
      `/api/v1/problems/${sample.id || sample._id}`,
      "GET",
      {
        Authorization: `Bearer ${token}`,
        "X-Features": "premium.problems,premium.editorial",
        "X-Access-Tier": "PREMIUM",
      }
    );
    const f = forged.json?.data || {};
    check(
      "modified frontend headers do not unlock",
      Boolean(f.accessLocked) && (!f.description || f.description === "")
    );
  }

  // Premium grant via admin if possible — soft skip
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword && token && locked.length) {
    const adminLogin = await request(AUTH_URL, "/api/v1/auth/login", "POST", {}, {
      email: adminEmail,
      password: adminPassword,
    });
    const adminToken =
      adminLogin.json?.data?.accessToken || adminLogin.json?.data?.token;
    const me = await request(AUTH_URL, "/api/v1/auth/me", "GET", {
      Authorization: `Bearer ${token}`,
    });
    const userId = me.json?.data?.id || me.json?.data?._id;
    if (adminToken && userId) {
      await request(
        AUTH_URL,
        `/api/v1/auth/admin/users/${userId}/subscription`,
        "PUT",
        { Authorization: `Bearer ${adminToken}` },
        { plan: "PREMIUM", status: "active" }
      );
      const premLogin = await request(AUTH_URL, "/api/v1/auth/login", "POST", {}, {
        email,
        password,
      });
      const premToken =
        premLogin.json?.data?.accessToken || premLogin.json?.data?.token;
      const sample = locked[0];
      const premGet = await request(
        PROBLEM_URL,
        `/api/v1/problems/${sample.id || sample._id}`,
        "GET",
        { Authorization: `Bearer ${premToken}` }
      );
      const p = premGet.json?.data || {};
      check(
        "premium receives full problem body",
        !p.accessLocked && Boolean(p.description)
      );
    } else {
      console.log("SKIP premium unlock live: admin grant unavailable");
    }
  } else {
    console.log("SKIP premium unlock live: set ADMIN_EMAIL/ADMIN_PASSWORD to verify");
  }
}

live()
  .then(() => {
    console.log(`\n${passed} PASS, ${failed} FAIL`);
    process.exit(failed ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
