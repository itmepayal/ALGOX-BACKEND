/**
 * Admin Learning Sheets — API + UI wiring + live E2E.
 * Run: cd server/ProblemService && npx tsx scripts/admin-sheets.selftest.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const clientSrc = path.join(root, "../../client/src");

dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, "../AuthService/.env") });

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

function readClient(rel: string) {
  return fs.readFileSync(path.join(clientSrc, rel), "utf8");
}

const api = readClient("api/adminSheetApi.ts");
const page = readClient("components/admin/learning/SheetsAdminPage.tsx");
const learning = readClient("components/admin/learning/LearningAdminPage.tsx");
const router = fs.readFileSync(
  path.join(root, "src/routers/v1/adminSheet.router.ts"),
  "utf8"
);

check("API list", api.includes('get("/admin/sheets"'));
check("API get", api.includes("`/admin/sheets/${"));
check("API create", api.includes('post("/admin/sheets"'));
check("API update", api.includes("patch(") && api.includes("update:"));
check("API delete/remove", api.includes("remove:") && api.includes(".delete("));
check("API preview", api.includes("/preview"));
check("API publish", api.includes("/publish"));
check("API archive", api.includes("/archive"));
check("API sync", api.includes("sync-from-catalog"));
check("UI wires SheetsAdminPage", learning.includes("SheetsAdminPage"));
check("UI list load", page.includes("adminSheetApi.list"));
check("UI get/edit", page.includes("adminSheetApi.get") && page.includes("adminSheetApi.update"));
check("UI create", page.includes("adminSheetApi.create"));
check("UI delete", page.includes("adminSheetApi.remove"));
check("UI preview", page.includes("adminSheetApi.preview"));
check("UI publish", page.includes("adminSheetApi.publish"));
check("UI archive", page.includes("adminSheetApi.archive"));
check("UI sync", page.includes("adminSheetApi.syncFromCatalog"));
check("UI RBAC sheets:manage/create", page.includes("sheets:manage") && page.includes("sheets:create"));
check("UI loading/empty", page.includes("loading") && page.includes("emptyTitle"));
check("backend create needs sheets:create", router.includes('requirePermission("sheets:create")'));
check("backend manage on mutate", router.includes('requirePermission("sheets:manage")'));
check("backend delete route", router.includes("adminSheetController.remove"));

const PROBLEM = process.env.PROBLEM_SERVICE_URL || "http://localhost:3003";
const AUTH = process.env.AUTH_SERVICE_URL || "http://localhost:3001";

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

async function live() {
  try {
    const h = await fetch(`${PROBLEM}/api/v1/health`);
    if (!h.ok) {
      console.log("SKIP live: ProblemService down");
      return;
    }
  } catch {
    console.log("SKIP live: ProblemService down");
    return;
  }

  const email = `sheet_admin_${Date.now()}@test.local`;
  const password = "TestPass123!";
  await request(AUTH, "/api/v1/auth/signup", "POST", {}, {
    name: "Sheet Admin",
    email,
    password,
  });
  let login = await request(AUTH, "/api/v1/auth/login", "POST", {}, {
    email,
    password,
  });
  let token = login.json?.data?.accessToken;
  check("signup/login", Boolean(token));
  if (!token) return;

  let userId = "";
  try {
    userId = JSON.parse(
      Buffer.from(String(token).split(".")[1], "base64url").toString()
    ).userId;
  } catch {
    /* */
  }

  const userAuth = { Authorization: `Bearer ${token}` };
  const denied = await request(
    PROBLEM,
    "/api/v1/admin/sheets",
    "GET",
    userAuth
  );
  check(
    "RBAC: plain user cannot list sheets",
    denied.status === 403 || denied.status === 401,
    `status=${denied.status}`
  );

  const authMongo =
    process.env.AUTH_MONGO_URL ||
    process.env.MONGO_URL ||
    process.env.MONGO_URI;
  // Prefer AuthService env
  const authEnv = dotenv.config({
    path: path.join(root, "../AuthService/.env"),
  });
  const mongoUrl =
    authEnv.parsed?.MONGO_URL ||
    authEnv.parsed?.MONGO_URI ||
    authMongo;

  if (!mongoUrl || !userId) {
    console.log("SKIP live admin ops: no auth mongo / userId");
    return;
  }

  const mongoose = await import("mongoose");
  const conn = await mongoose.default.createConnection(mongoUrl).asPromise();
  await conn.collection("users").updateOne(
    { _id: new mongoose.default.Types.ObjectId(userId) },
    { $set: { role: "admin" } }
  );
  await conn.close();

  login = await request(AUTH, "/api/v1/auth/login", "POST", {}, {
    email,
    password,
  });
  token = login.json?.data?.accessToken;
  check("re-login as admin", Boolean(token));
  if (!token) return;
  const auth = { Authorization: `Bearer ${token}` };

  const sheetId = `e2e-sheet-${Date.now().toString(36)}`;

  const list0 = await request(PROBLEM, "/api/v1/admin/sheets", "GET", auth);
  check("list", list0.status === 200, `status=${list0.status}`);

  const created = await request(
    PROBLEM,
    "/api/v1/admin/sheets",
    "POST",
    auth,
    {
      sheetId,
      title: "E2E Sheet",
      description: "admin sheets e2e",
      order: 99,
    }
  );
  check("create", created.status === 201 || created.status === 200, `status=${created.status} ${created.json?.message}`);

  const got = await request(
    PROBLEM,
    `/api/v1/admin/sheets/${sheetId}`,
    "GET",
    auth
  );
  check(
    "get",
    got.status === 200 && got.json?.data?.sheetId === sheetId,
    `status=${got.status}`
  );

  const updated = await request(
    PROBLEM,
    `/api/v1/admin/sheets/${sheetId}`,
    "PATCH",
    auth,
    { title: "E2E Sheet Updated", description: "updated", order: 100 }
  );
  check(
    "update",
    updated.status === 200 && updated.json?.data?.title === "E2E Sheet Updated",
    `status=${updated.status}`
  );

  const preview = await request(
    PROBLEM,
    `/api/v1/admin/sheets/${sheetId}/preview`,
    "GET",
    auth
  );
  check(
    "preview",
    preview.status === 200 && Array.isArray(preview.json?.data?.sections),
    `status=${preview.status}`
  );

  const published = await request(
    PROBLEM,
    `/api/v1/admin/sheets/${sheetId}/publish`,
    "POST",
    auth
  );
  check(
    "publish",
    published.status === 200 && published.json?.data?.status === "PUBLISHED",
    `status=${published.status}`
  );

  const archived = await request(
    PROBLEM,
    `/api/v1/admin/sheets/${sheetId}/archive`,
    "POST",
    auth
  );
  check(
    "archive",
    archived.status === 200 && archived.json?.data?.status === "ARCHIVED",
    `status=${archived.status}`
  );

  const sync = await request(
    PROBLEM,
    "/api/v1/admin/sheets/sync-from-catalog",
    "POST",
    auth,
    { sheetId: "striver-a2z", publish: true }
  );
  check(
    "sync-from-catalog",
    sync.status === 200,
    `status=${sync.status} ${sync.json?.message}`
  );

  const removed = await request(
    PROBLEM,
    `/api/v1/admin/sheets/${sheetId}`,
    "DELETE",
    auth
  );
  check(
    "delete",
    removed.status === 200 && removed.json?.data?.deleted === true,
    `status=${removed.status}`
  );

  const gone = await request(
    PROBLEM,
    `/api/v1/admin/sheets/${sheetId}`,
    "GET",
    auth
  );
  check("get after delete → 404", gone.status === 404, `status=${gone.status}`);
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
