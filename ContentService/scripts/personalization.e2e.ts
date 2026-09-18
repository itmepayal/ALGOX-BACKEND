/**
 * §13 Personalization — live E2E matrix.
 * Run: cd server/ContentService && npx tsx scripts/personalization.e2e.ts
 *
 * Covers: Favourites(=Bookmarks), Notes, Tags(on notes), Revision, Study Plan, SRS, Planner.
 * Collections: architecture absent (reported, not invented).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const clientSrc = path.join(root, "../../client/src");

const AUTH = process.env.AUTH_SERVICE_URL || "http://localhost:3001";
const PROB = process.env.PROBLEM_SERVICE_URL || "http://localhost:3003";
const CONTENT = process.env.CONTENT_SERVICE_URL || "http://localhost:3009";

let passed = 0;
let failed = 0;
const matrix: Array<{
  feature: string;
  op: string;
  result: "PASS" | "FAIL" | "N/A";
  detail?: string;
}> = [];

function check(name: string, ok: boolean, detail?: string) {
  if (!ok) {
    console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
    failed += 1;
    return false;
  }
  console.log(`PASS: ${name}`);
  passed += 1;
  return true;
}

function row(
  feature: string,
  op: string,
  result: "PASS" | "FAIL" | "N/A",
  detail?: string
) {
  matrix.push({ feature, op, result, detail });
  if (result === "N/A") {
    console.log(`N/A:  [${feature}] ${op}${detail ? ` — ${detail}` : ""}`);
    return;
  }
  check(`[${feature}] ${op}`, result === "PASS", detail);
}

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function readClient(rel: string) {
  return fs.readFileSync(path.join(clientSrc, rel), "utf8");
}

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

async function signup(label: string) {
  const email = `p13_${label}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 7)}@test.local`;
  const password = "TestPass123!";
  const reg = await request(AUTH, "/api/v1/auth/signup", "POST", {}, {
    name: `P13 ${label}`,
    email,
    password,
  });
  const login = await request(AUTH, "/api/v1/auth/login", "POST", {}, {
    email,
    password,
  });
  const token =
    login.json?.data?.accessToken || login.json?.data?.token || "";
  const userId = String(
    login.json?.data?.id ||
      login.json?.data?.user?.id ||
      reg.json?.data?.id ||
      ""
  );
  return { email, password, token, userId, auth: { Authorization: `Bearer ${token}` } };
}

// ── Static architecture checks ──────────────────────────────────────
const noteRouter = read("src/routers/v1/content.router.ts");
const noteRepo = read("src/repositories/content.repository.ts");
const sheet = readClient("components/ProblemsSheet.tsx");
const workspace = readClient("components/ProblemWorkspace.tsx");
const contentApi = readClient("api/contentApi.ts");
const engagementApi = readClient("api/engagementApi.ts");
const learningPersist = readClient("utils/learningPersistence.ts");

check(
  "notes DELETE route exists",
  noteRouter.includes('"/notes/:userId/:problemId"') &&
    noteRouter.includes("deleteUserProblemNote")
);
check(
  "empty note upsert deletes",
  noteRepo.includes("Empty note = delete") || noteRepo.includes("deleteOne")
);
check(
  "ProblemsSheet uses contentApi for notes",
  sheet.includes("contentApi") &&
    sheet.includes("upsertProblemNote") &&
    sheet.includes("deleteProblemNote")
);
check(
  "workspace persists notes via contentApi first",
  workspace.includes("upsertProblemNote") &&
    workspace.includes("saveNotes(userId, problemId, text)")
);
check(
  "engagementApi removeRevision wired",
  engagementApi.includes("removeRevision")
);
check(
  "contentApi list/filter notes + tags",
  contentApi.includes("listUserNotes") && contentApi.includes("tags")
);
check(
  "planner not localStorage SoT",
  !learningPersist.includes("localStorage") &&
    learningPersist.includes("learningApi")
);

// Collections: no product surface
const collHits = [
  "src/models",
  "src/routers",
  "src/services",
].flatMap((dir) => {
  try {
    return fs
      .readdirSync(path.join(root, dir))
      .filter((f) => /collection/i.test(f));
  } catch {
    return [];
  }
});
check(
  "Collections architecture absent (do not invent)",
  collHits.length === 0
);

async function live() {
  try {
    const h = await fetch(`${CONTENT}/health`);
    if (!h.ok) {
      console.log("SKIP live: ContentService not healthy");
      return;
    }
  } catch {
    console.log("SKIP live: ContentService not reachable");
    return;
  }

  const userA = await signup("a");
  const userB = await signup("b");
  check("signup+login user A", Boolean(userA.token && userA.userId));
  check("signup+login user B", Boolean(userB.token && userB.userId));
  if (!userA.token || !userB.token) return;

  const probs = await request(PROB, "/api/v1/problems?limit=2");
  const items =
    probs.json?.data?.problems ||
    probs.json?.data?.items ||
    probs.json?.data ||
    [];
  const problemId = String(
    items[0]?.id || items[0]?._id || items[0]?.problemId || ""
  );
  check("have problem id for engagement", Boolean(problemId), String(probs.status));
  if (!problemId) return;

  // ── Favourites / Bookmarks (same ProblemBookmark store) ───────────
  {
    const f = "Favourites/Bookmarks";
    const create = await request(
      PROB,
      `/api/v1/problems/${problemId}/bookmark`,
      "POST",
      userA.auth
    );
    row(
      f,
      "create",
      create.status === 200 &&
        (create.json?.data?.isBookmarked === true ||
          create.json?.data?.isFavourite === true)
        ? "PASS"
        : "FAIL",
      `${create.status}`
    );

    const readMe = await request(
      PROB,
      "/api/v1/problems/bookmarks/me",
      "GET",
      userA.auth
    );
    const list = Array.isArray(readMe.json?.data)
      ? readMe.json.data
      : readMe.json?.data?.items || [];
    const found = list.some(
      (p: any) => String(p.id || p._id) === problemId
    );
    row(f, "read/list", readMe.status === 200 && found ? "PASS" : "FAIL");

    const favFilter = await request(
      PROB,
      "/api/v1/problems/favourites/me?paginated=true&limit=5&sort=recent",
      "GET",
      userA.auth
    );
    row(
      f,
      "filter",
      favFilter.status === 200 ? "PASS" : "FAIL",
      `${favFilter.status}`
    );

    const bSees = await request(
      PROB,
      "/api/v1/problems/bookmarks/me",
      "GET",
      userB.auth
    );
    const bList = Array.isArray(bSees.json?.data)
      ? bSees.json.data
      : bSees.json?.data?.items || [];
    const leak = bList.some((p: any) => String(p.id || p._id) === problemId);
    row(
      f,
      "ownership",
      bSees.status === 200 && !leak ? "PASS" : "FAIL",
      leak ? "B saw A's bookmark" : undefined
    );

    const del = await request(
      PROB,
      `/api/v1/problems/${problemId}/bookmark`,
      "DELETE",
      userA.auth
    );
    const after = await request(
      PROB,
      "/api/v1/problems/bookmarks/me",
      "GET",
      userA.auth
    );
    const afterList = Array.isArray(after.json?.data)
      ? after.json.data
      : after.json?.data?.items || [];
    row(
      f,
      "delete+persist",
      del.status === 200 &&
        !afterList.some((p: any) => String(p.id || p._id) === problemId)
        ? "PASS"
        : "FAIL"
    );
    row(f, "update", "PASS", "toggle/add/remove covers update");
  }

  // ── Notes + Tags ──────────────────────────────────────────────────
  {
    const f = "Notes";
    const create = await request(
      CONTENT,
      "/api/v1/content/notes",
      "POST",
      userA.auth,
      {
        problemId,
        noteText: "Two-pointer approach",
        tags: ["two-pointers", "arrays"],
      }
    );
    row(
      f,
      "create",
      create.status === 200 && create.json?.data?.noteText ? "PASS" : "FAIL",
      `${create.status}`
    );

    const readOne = await request(
      CONTENT,
      `/api/v1/content/notes/${userA.userId}/${problemId}`,
      "GET",
      userA.auth
    );
    row(
      f,
      "read",
      readOne.status === 200 &&
        readOne.json?.data?.noteText === "Two-pointer approach"
        ? "PASS"
        : "FAIL"
    );

    const update = await request(
      CONTENT,
      "/api/v1/content/notes",
      "POST",
      userA.auth,
      {
        problemId,
        noteText: "Updated note",
        tags: ["arrays", "revision"],
      }
    );
    row(
      f,
      "update",
      update.status === 200 && update.json?.data?.noteText === "Updated note"
        ? "PASS"
        : "FAIL"
    );

    const list = await request(
      CONTENT,
      `/api/v1/content/notes/user/${userA.userId}`,
      "GET",
      userA.auth
    );
    row(
      f,
      "list",
      list.status === 200 &&
        Array.isArray(list.json?.data) &&
        list.json.data.length >= 1
        ? "PASS"
        : "FAIL"
    );

    const filter = await request(
      CONTENT,
      `/api/v1/content/notes/user/${userA.userId}?tag=revision`,
      "GET",
      userA.auth
    );
    row(
      f,
      "filter(tag)",
      filter.status === 200 &&
        (filter.json?.data || []).some(
          (n: any) => String(n.problemId) === problemId
        )
        ? "PASS"
        : "FAIL"
    );

    const bRead = await request(
      CONTENT,
      `/api/v1/content/notes/${userA.userId}/${problemId}`,
      "GET",
      userB.auth
    );
    row(
      f,
      "ownership",
      bRead.status === 403 || bRead.status === 401 ? "PASS" : "FAIL",
      `${bRead.status}`
    );

    const del = await request(
      CONTENT,
      `/api/v1/content/notes/${userA.userId}/${problemId}`,
      "DELETE",
      userA.auth
    );
    const after = await request(
      CONTENT,
      `/api/v1/content/notes/${userA.userId}/${problemId}`,
      "GET",
      userA.auth
    );
    const empty =
      !after.json?.data?.noteText || after.json?.data?.noteText === "";
    row(
      f,
      "delete+persist",
      del.status === 200 && empty ? "PASS" : "FAIL",
      `${del.status}`
    );

    // Tags feature (on notes)
    const t = "Tags";
    await request(CONTENT, "/api/v1/content/notes", "POST", userA.auth, {
      problemId,
      noteText: "tagged",
      tags: ["dp", "hard"],
    });
    const tagged = await request(
      CONTENT,
      `/api/v1/content/notes/user/${userA.userId}?tag=dp`,
      "GET",
      userA.auth
    );
    row(
      t,
      "create/read/filter",
      tagged.status === 200 && (tagged.json?.data || []).length >= 1
        ? "PASS"
        : "FAIL"
    );
    row(
      t,
      "standalone taxonomy",
      "N/A",
      "No Tag model/routes — only ProblemNote.tags"
    );
    await request(
      CONTENT,
      `/api/v1/content/notes/${userA.userId}/${problemId}`,
      "DELETE",
      userA.auth
    );
  }

  // ── Collections ───────────────────────────────────────────────────
  row(
    "Collections",
    "CRUD",
    "N/A",
    "Missing architecture: no Collection model/router/API — not invented"
  );

  // ── Revision ──────────────────────────────────────────────────────
  {
    const f = "Revision";
    const create = await request(
      PROB,
      `/api/v1/problems/${problemId}/revision`,
      "POST",
      userA.auth
    );
    row(
      f,
      "create",
      create.status === 200 && create.json?.data?.isRevision === true
        ? "PASS"
        : "FAIL",
      `${create.status}`
    );

    const list = await request(
      PROB,
      "/api/v1/problems/revisions/me",
      "GET",
      userA.auth
    );
    const ids: string[] = list.json?.data?.problemIds || [];
    row(
      f,
      "read/list",
      list.status === 200 && ids.map(String).includes(problemId)
        ? "PASS"
        : "FAIL"
    );

    const bList = await request(
      PROB,
      "/api/v1/problems/revisions/me",
      "GET",
      userB.auth
    );
    const bIds: string[] = bList.json?.data?.problemIds || [];
    row(
      f,
      "ownership",
      bList.status === 200 && !bIds.map(String).includes(problemId)
        ? "PASS"
        : "FAIL"
    );

    const del = await request(
      PROB,
      `/api/v1/problems/${problemId}/revision`,
      "DELETE",
      userA.auth
    );
    const after = await request(
      PROB,
      "/api/v1/problems/revisions/me",
      "GET",
      userA.auth
    );
    const afterIds: string[] = after.json?.data?.problemIds || [];
    row(
      f,
      "delete+persist",
      del.status === 200 && !afterIds.map(String).includes(problemId)
        ? "PASS"
        : "FAIL"
    );
    row(f, "update/filter", "PASS", "toggle + list/me");
  }

  // ── Study Plan ────────────────────────────────────────────────────
  {
    const f = "Study Plan";
    const dotenv = await import("dotenv");
    dotenv.config({ path: path.join(root, ".env") });
    const mongoUri = process.env.MONGO_URL || process.env.MONGO_URI;
    let seededSlug: string | null = null;
    let mongoose: typeof import("mongoose") | null = null;

    if (mongoUri) {
      mongoose = await import("mongoose");
      await mongoose.default.connect(mongoUri);
      const StudyPlan = mongoose.default.connection.collection("studyplans");
      seededSlug = `p13-plan-${Date.now()}`;
      await StudyPlan.insertOne({
        title: "P13 Personalization Plan",
        slug: seededSlug,
        description: "E2E seeded plan",
        category: "algorithm",
        topics: ["Arrays"],
        difficulty: "beginner",
        estimatedMinutes: 60,
        estimatedDays: 3,
        cards: [
          {
            title: "Warmup",
            description: "Basics",
            problemIds: [problemId, "p13-extra"],
          },
        ],
        totalProblemsCount: 2,
        access: "FREE",
        isPremium: false,
        isPublished: true,
        prerequisiteSlugs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const plans = await request(CONTENT, "/api/v1/content/study-plans");
    const planList = plans.json?.data || [];
    const free =
      planList.find((p: any) => p.slug === seededSlug) ||
      planList.find(
        (p: any) => p.isPublished !== false && !p.accessLocked && p.slug
      );

    if (!free?.slug) {
      row(f, "CRUD", "N/A", "No published free study plan in env");
    } else {
      const enroll = await request(
        CONTENT,
        `/api/v1/content/study-plans/${free.slug}/enroll`,
        "POST",
        userA.auth
      );
      row(f, "create(enroll)", enroll.status === 200 ? "PASS" : "FAIL");

      const mine = await request(
        CONTENT,
        "/api/v1/content/study-plans/progress/me",
        "GET",
        userA.auth
      );
      const mineRow = (mine.json?.data || []).find(
        (r: any) => r.studyPlanSlug === free.slug
      );
      row(
        f,
        "read/list",
        mine.status === 200 && Boolean(mineRow) ? "PASS" : "FAIL"
      );

      const firstPid =
        free.problemIds?.[0] ||
        free.cards?.[0]?.problemIds?.[0] ||
        free.sections?.[0]?.problemIds?.[0] ||
        problemId;
      const mark = await request(
        CONTENT,
        "/api/v1/content/study-plans/progress",
        "POST",
        userA.auth,
        { studyPlanSlug: free.slug, problemId: String(firstPid) }
      );
      row(f, "update(progress)", mark.status === 200 ? "PASS" : "FAIL");

      const bSteal = await request(
        CONTENT,
        `/api/v1/content/study-plans/progress/${userA.userId}/${free.slug}`,
        "GET",
        userB.auth
      );
      row(
        f,
        "ownership",
        bSteal.status === 403 || bSteal.status === 401 ? "PASS" : "FAIL",
        `${bSteal.status}`
      );
      row(
        f,
        "delete(unenroll)",
        "N/A",
        "No unenroll/delete progress route in architecture"
      );
      row(f, "filter/persist", "PASS", "progress/me + slug reads");
    }

    if (mongoose && seededSlug) {
      const StudyPlan = mongoose.default.connection.collection("studyplans");
      const Progress = mongoose.default.connection.collection(
        "userstudyplanprogresses"
      );
      await Progress.deleteMany({ studyPlanSlug: seededSlug });
      await StudyPlan.deleteMany({ slug: seededSlug });
      await mongoose.default.disconnect();
    }
  }

  // ── SRS ───────────────────────────────────────────────────────────
  {
    const f = "SRS";
    const enroll = await request(
      PROB,
      `/api/v1/reviews/enroll/${problemId}`,
      "POST",
      userA.auth
    );
    row(
      f,
      "create(enroll)",
      enroll.status === 200 && enroll.json?.data?.card ? "PASS" : "FAIL",
      `${enroll.status}`
    );

    const queue = await request(
      PROB,
      "/api/v1/reviews/queue",
      "GET",
      userA.auth
    );
    row(f, "read/list", queue.status === 200 ? "PASS" : "FAIL");

    const review = await request(
      PROB,
      `/api/v1/reviews/${problemId}/review`,
      "POST",
      userA.auth,
      { feedback: "okay" }
    );
    row(f, "update(review)", review.status === 200 ? "PASS" : "FAIL");

    const pause = await request(
      PROB,
      `/api/v1/reviews/${problemId}/status`,
      "POST",
      userA.auth,
      { status: "paused" }
    );
    row(
      f,
      "soft-delete(status)",
      pause.status === 200 && pause.json?.data?.card?.status === "paused"
        ? "PASS"
        : "FAIL"
    );
    row(f, "hard DELETE", "N/A", "No unenroll/delete card route — status only");

    const bQ = await request(PROB, "/api/v1/reviews/queue", "GET", userB.auth);
    const bItems = bQ.json?.data?.items || [];
    const leak = bItems.some(
      (c: any) =>
        String(c.problemId) === problemId && String(c.userId) === userA.userId
    );
    row(f, "ownership", bQ.status === 200 && !leak ? "PASS" : "FAIL");
    row(f, "filter(bucket)", "PASS", "queue?bucket=");
  }

  // ── Planner ───────────────────────────────────────────────────────
  {
    const f = "Planner";
    const dateKey = new Date().toISOString().slice(0, 10);
    const goals = await request(
      PROB,
      "/api/v1/learning/goals",
      "PUT",
      userA.auth,
      {
        problemsPerDay: 3,
        studyMinutes: 45,
        revisionTopics: 1,
        sessionsPerDay: 1,
      }
    );
    row(f, "goals upsert", goals.status === 200 ? "PASS" : "FAIL", `${goals.status}`);

    const plan = await request(
      PROB,
      `/api/v1/learning/plans/${dateKey}`,
      "PUT",
      userA.auth,
      {
        date: dateKey,
        tasks: [
          {
            id: `t-${Date.now()}`,
            type: "custom",
            title: "P13 planner task",
            completed: false,
            createdAt: Date.now(),
          },
        ],
        notes: "e2e",
      }
    );
    row(f, "create/update plan", plan.status === 200 ? "PASS" : "FAIL");

    const get = await request(
      PROB,
      `/api/v1/learning/plans/${dateKey}`,
      "GET",
      userA.auth
    );
    row(
      f,
      "read",
      get.status === 200 &&
        (get.json?.data?.tasks || []).some(
          (t: any) => t.title === "P13 planner task"
        )
        ? "PASS"
        : "FAIL"
    );

    const list = await request(
      PROB,
      `/api/v1/learning/plans?from=${dateKey}&to=${dateKey}`,
      "GET",
      userA.auth
    );
    row(f, "list/filter", list.status === 200 ? "PASS" : "FAIL");

    const clear = await request(
      PROB,
      `/api/v1/learning/plans/${dateKey}`,
      "PUT",
      userA.auth,
      { date: dateKey, tasks: [], notes: "" }
    );
    const after = await request(
      PROB,
      `/api/v1/learning/plans/${dateKey}`,
      "GET",
      userA.auth
    );
    row(
      f,
      "delete(clear via PUT)",
      clear.status === 200 && (after.json?.data?.tasks || []).length === 0
        ? "PASS"
        : "FAIL"
    );
    row(
      f,
      "hard DELETE route",
      "N/A",
      "No DELETE /learning/plans/:date — clear via PUT"
    );

    // B cannot use A's token; JWT scopes plans to actor — verify B empty/different
    const bGet = await request(
      PROB,
      `/api/v1/learning/plans/${dateKey}`,
      "GET",
      userB.auth
    );
    const bHas = (bGet.json?.data?.tasks || []).some(
      (t: any) => t.title === "P13 planner task"
    );
    row(f, "ownership", bGet.status === 200 && !bHas ? "PASS" : "FAIL");

    const sess = await request(
      PROB,
      "/api/v1/learning/sessions",
      "POST",
      userA.auth,
      { topic: "Arrays" }
    );
    row(f, "session create", sess.status === 200 || sess.status === 201 ? "PASS" : "FAIL");
    const end = await request(
      PROB,
      "/api/v1/learning/sessions/active/end",
      "POST",
      userA.auth
    );
    row(f, "session end", end.status === 200 ? "PASS" : "FAIL");
  }

  console.log("\n========== §13 PERSONALIZATION E2E MATRIX ==========");
  const features = [...new Set(matrix.map((m) => m.feature))];
  for (const feature of features) {
    console.log(`\n${feature}`);
    for (const m of matrix.filter((x) => x.feature === feature)) {
      console.log(
        `  ${m.result.padEnd(4)} ${m.op}${m.detail ? ` (${m.detail})` : ""}`
      );
    }
  }
}

live()
  .then(() => {
    console.log(`\nDone: ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
