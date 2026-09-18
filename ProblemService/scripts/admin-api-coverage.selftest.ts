/**
 * Section 12 — Admin API consumer coverage checks.
 * Run: cd server/ProblemService && npx tsx ../AuthService/../ProblemService/scripts/../ — use AuthService or repo root.
 * Prefer: npx tsx scripts/admin-api-coverage.selftest.ts from this file's intended location.
 *
 * Place: server/ProblemService/scripts/admin-api-coverage.selftest.ts
 * Also covers AuthService paths via filesystem.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const repo = path.join(root, "../..");
const client = path.join(repo, "client/src");

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

function exists(...parts: string[]) {
  return fs.existsSync(path.join(...parts));
}
function read(...parts: string[]) {
  return fs.readFileSync(path.join(...parts), "utf8");
}

// 1 Reports assign
const discApi = read(client, "api/adminDiscussionApi.ts");
const reportsUi = read(client, "components/admin/ops/DiscussionsReportsPages.tsx");
check(
  "Reports assign: client",
  discApi.includes("assignReport") && discApi.includes("/assign")
);
check(
  "Reports assign: UI",
  reportsUi.includes("Assign me") && reportsUi.includes("assignReport")
);
check(
  "Reports assign: backend",
  read(repo, "server/DiscussionService/src/routers/v1/discussion.router.ts").includes(
    "/admin/reports/:id/assign"
  )
);

// 2 Challenge CMS
check(
  "Challenge CMS: client",
  exists(client, "api/adminChallengeApi.ts") &&
    read(client, "api/adminChallengeApi.ts").includes("/challenges/admin/")
);
check(
  "Challenge CMS: UI",
  exists(client, "components/admin/challenges/ChallengesAdminPage.tsx") &&
    read(client, "components/admin/AdminApp.tsx").includes("LazyChallengesAdminPage")
);
check(
  "Challenge CMS: backend PUT",
  read(repo, "server/ProblemService/src/routers/v1/challenge.router.ts").includes(
    '"/admin/:dateKey"'
  )
);

// 3 Subscription
check(
  "Subscription grant: client+UI",
  read(client, "api/adminAuthApi.ts").includes("updateSubscription") &&
    read(client, "components/admin/users/UserDetailPage.tsx").includes(
      "Grant Premium"
    )
);

// 4 Learning
check(
  "Learning admin: client+UI",
  exists(client, "api/adminLearningApi.ts") &&
    read(client, "components/admin/learning/LearningAdminPage.tsx").includes(
      "adminLearningApi"
    )
);
check(
  "SRS admin mutations: none (no invent)",
  !fs
    .readdirSync(path.join(repo, "server/ProblemService/src/routers/v1"))
    .some((f) => f.toLowerCase().includes("srs") && f.includes("admin"))
);

// 5 Virtual contest admin — absent
check(
  "Virtual contest admin API: absent (no invent)",
  !read(repo, "server/ProblemService/src/routers/v1/virtualContest.router.ts").includes(
    "/admin"
  )
);

// 6 AI admin — absent
const aiRouter = path.join(repo, "server/ProblemService/src/routers/v1");
const aiFiles = fs.readdirSync(aiRouter).filter((f) => f.includes("ai"));
let aiAdmin = false;
for (const f of aiFiles) {
  if (read(aiRouter, f).includes("/admin")) aiAdmin = true;
}
check("AI admin API: absent (no invent)", !aiAdmin);

// 7 Favourites
check(
  "Favourites analytics: client+UI",
  read(client, "api/adminProblemApi.ts").includes("favouriteAnalytics") &&
    read(client, "components/admin/dashboard/AdminDashboardHome.tsx").includes(
      "favouriteAnalytics"
    )
);

// 8 Notifications
check(
  "Notifications: client+UI",
  exists(client, "api/adminNotificationApi.ts") &&
    exists(client, "components/admin/notifications/NotificationsAdminPage.tsx")
);

// 9 Audit
check(
  "Audit logs: client+UI",
  read(client, "api/adminAuthApi.ts").includes("listAuditLogs") &&
    exists(client, "components/admin/audit/AuditLogPage.tsx")
);

// 10 Settings
check(
  "Settings: client+UI",
  exists(client, "api/adminSettingsApi.ts") &&
    exists(client, "components/admin/settings/SettingsPage.tsx")
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
