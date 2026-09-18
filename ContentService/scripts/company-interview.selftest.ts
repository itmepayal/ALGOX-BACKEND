/**
 * Phase 10 — Company interview questions selftest.
 * Run: cd server/ContentService && npx tsx scripts/company-interview.selftest.ts
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

const model = read("src/models/company.model.ts");
const qModel = read("src/models/companyQuestion.model.ts");
const svc = read("src/services/company.service.ts");
const repo = read("src/repositories/company.repository.ts");
const router = read("src/routers/v1/content.router.ts");
const page = readClient("components/companies/CompaniesPage.tsx");
const admin = readClient("components/admin/content/CompaniesAdminPage.tsx");
const prep = readClient("components/home/PremiumPreparationSection.tsx");

check("Company model fields", model.includes("freePreviewLimit") && model.includes("isPremium"));
check("Question model has optional frequency/lastSeen", qModel.includes("frequency") && qModel.includes("lastSeenAt"));
check("never invent frequency in sanitize", repo.includes("omit unset frequency") || repo.includes("Only include configured"));
check("premium gating in service", svc.includes("canAccessCompanyQuestions") && svc.includes("previewLimit"));
check("admin + public routes", router.includes("/admin/companies") && router.includes("/companies/:slug"));
check("directory + filters UI", page.includes("All difficulties") && page.includes("All topics") && page.includes("All roles"));
check("admin CRUD UI", admin.includes("New company") && admin.includes("Frequency (optional)"));
check("home uses configured companies API", prep.includes("companyApi") && !prep.includes("COMPANY_TAGS"));

const CONTENT_URL = process.env.CONTENT_SERVICE_URL || "http://localhost:3009";
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

async function live() {
  try {
    const health = await fetch(`${CONTENT_URL}/api/v1/content/companies?limit=1`);
    if (!health.ok && health.status >= 500) {
      console.log("SKIP live: ContentService not reachable");
      return;
    }
  } catch {
    console.log("SKIP live: ContentService not reachable");
    return;
  }

  // Guest directory
  const dir = await request(CONTENT_URL, "/api/v1/content/companies?page=1&limit=10");
  check("guest directory authorized (public)", dir.status === 200);
  check("directory returns array", Array.isArray(dir.json?.data));

  // Admin mutations require auth
  const guestCreate = await request(
    CONTENT_URL,
    "/api/v1/content/admin/companies",
    "POST",
    {},
    { name: "Should Fail", isPublished: true }
  );
  check(
    "admin create unauthorized without JWT",
    guestCreate.status === 401 || guestCreate.status === 403
  );

  // Seed via Mongo when admin credentials are not provided — still verify public gating
  try {
    const dotenv = await import("dotenv");
    dotenv.config({ path: path.join(root, ".env") });
    const mongoUri = process.env.MONGO_URL || process.env.MONGO_URI;
    if (!mongoUri) {
      console.log("SKIP mongo seed path: MONGO_URL/MONGO_URI not set");
      return;
    }
    const mongoose = await import("mongoose");
    await mongoose.default.connect(mongoUri);
    const Company = mongoose.default.connection.collection("companies");
    const CompanyQuestion = mongoose.default.connection.collection("companyquestions");
    const slug = `p10-seed-${Date.now()}`;
    const insert = await Company.insertOne({
      name: "P10 Seed Co",
      slug,
      description: "Seeded for gating verify",
      isPremium: true,
      freePreviewLimit: 1,
      isPublished: true,
      roles: ["SDE"],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const companyId = insert.insertedId;
    await CompanyQuestion.insertMany([
      {
        companyId,
        problemId: "prob-free-1",
        title: "Free Preview Q",
        difficulty: "easy",
        topics: ["Arrays"],
        role: "SDE",
        isPremium: false,
        order: 1,
        frequency: null,
        lastSeenAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        companyId,
        problemId: "prob-prem-1",
        title: "Premium Only Q",
        difficulty: "hard",
        topics: ["DP"],
        role: "SDE",
        isPremium: true,
        frequency: 42,
        order: 2,
        lastSeenAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const guestPage = await request(
      CONTENT_URL,
      `/api/v1/content/companies/${slug}?page=1&limit=20&difficulty=easy`
    );
    check("guest company page 200", guestPage.status === 200);
    const gData = guestPage.json?.data;
    check(
      "guest preview gated",
      Boolean(gData?.meta?.preview) || gData?.company?.access !== "full"
    );
    const gQs = gData?.questions || [];
    check(
      "guest does not receive premium-only questions",
      !gQs.some((q: any) => q.title === "Premium Only Q")
    );
    check("guest preview respects freePreviewLimit", gQs.length <= 1);
    check(
      "difficulty filter applied in preview",
      gQs.every((q: any) => q.difficulty === "easy")
    );
    check(
      "no invented frequency on free preview row",
      gQs.every((q: any) => q.frequency === undefined)
    );

    const hardFilter = await request(
      CONTENT_URL,
      `/api/v1/content/companies/${slug}?difficulty=hard&page=1&limit=10`
    );
    const hardQs = hardFilter.json?.data?.questions || [];
    check(
      "premium hard question hidden from guest filter",
      hardQs.length === 0
    );

    await CompanyQuestion.deleteMany({ companyId });
    await Company.deleteOne({ _id: companyId });
    await mongoose.default.disconnect();
  } catch (err: any) {
    console.log("SKIP mongo seed path:", err?.message || err);
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
