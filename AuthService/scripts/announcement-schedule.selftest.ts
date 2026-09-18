/**
 * Section 9 — Scheduled announcements self-test + live E2E.
 * Run: cd server/AuthService && npx tsx scripts/announcement-schedule.selftest.ts
 * Live: LIVE_E2E=1 npx tsx scripts/announcement-schedule.selftest.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

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

const model = read("src/models/announcement.model.ts");
const service = read("src/services/announcement.service.ts");
const server = read("src/server.ts");
const validator = read("src/validators/announcement.validator.ts");
const controller = read("src/controllers/announcement.controller.ts");
const adminRouter = read("src/routers/v1/admin.router.ts");

check(
  "schema has SCHEDULED + scheduledAt + publishedAt",
  model.includes('"SCHEDULED"') &&
    model.includes("scheduledAt") &&
    model.includes("publishedAt")
);
check(
  "status/scheduledAt index for due queries",
  model.includes("status: 1, scheduledAt: 1")
);
check(
  "schedule + publish APIs exist",
  service.includes("async schedule(") &&
    service.includes("async publish(") &&
    controller.includes("schedule(") &&
    adminRouter.includes("/announcements/:id/schedule")
);
check(
  "processDueScheduledAnnouncements exists",
  service.includes("processDueScheduledAnnouncements")
);
check(
  "atomic claim prevents duplicate publish",
  service.includes('status: "SCHEDULED"') &&
    service.includes("findOneAndUpdate") &&
    service.includes('status: "PUBLISHED"')
);
check(
  "manual publish preserved + already-published guard",
  service.includes("async publish(") &&
    service.includes("already published") &&
    service.includes('via: "admin"')
);
check(
  "audit on publish (manual + scheduler)",
  service.includes('action: "announcement.publish"') &&
    service.includes("writeAdminAudit") &&
    service.includes("ANNOUNCEMENT_PUBLISH_VIA_SCHEDULER")
);
check(
  "wired into existing AuthService setInterval (not a second scheduler)",
  server.includes("processDueCampaigns") &&
    server.includes("processDueScheduledAnnouncements") &&
    (server.match(/setInterval\(/g) || []).length === 1
);
check(
  "user listForUser only PUBLISHED",
  service.includes('status: "PUBLISHED"') && service.includes("listForUser")
);
check(
  "schedule validator requires scheduledAt",
  validator.includes("scheduleAnnouncementSchema") &&
    validator.includes("scheduledAt: z.coerce.date()")
);

async function liveE2E() {
  const dotenv = await import("dotenv");
  dotenv.config({ path: path.join(root, ".env") });
  const mongoose = (await import("mongoose")).default;
  const { Announcement } = await import("../src/models/announcement.model");
  const { AdminAuditLog } = await import("../src/models/adminAuditLog.model");
  const { User } = await import("../src/models/user.model");
  const {
    announcementService,
    ANNOUNCEMENT_PUBLISH_VIA_SCHEDULER,
  } = await import("../src/services/announcement.service");

  await mongoose.connect(process.env.MONGO_URL!);

  const user =
    (await User.findOne({ email: "verify-e2e-1789657967@example.invalid" })
      .select("_id role email")
      .lean()) ||
    (await User.findOne({ role: "user", status: "active" })
      .select("_id role email")
      .lean());
  check("have a user for visibility check", Boolean(user));
  if (!user) {
    await mongoose.disconnect();
    return;
  }

  const actor = {
    userId: String(user._id),
    email: (user as any).email || "e2e@test.invalid",
    role: String((user as any).role || "user"),
  };

  const created = await announcementService.create(actor, {
    title: `Sched E2E ${Date.now()}`,
    message: "Scheduled publish visibility check",
    type: "INFO",
    priority: 50,
    audience: "ALL_USERS",
    targetUsers: [],
    targetRoles: [],
    actionUrl: "",
    scheduledAt: null,
    expiresAt: null,
  });
  check("create DRAFT", created.status === "DRAFT");

  const when = new Date(Date.now() + 1500);
  const scheduled = await announcementService.schedule(
    actor,
    created.id,
    when
  );
  check("schedule → SCHEDULED", scheduled.status === "SCHEDULED");

  // Not due yet
  const early = await announcementService.processDueScheduledAnnouncements();
  const mid = await announcementService.getById(created.id);
  check(
    "no publish before scheduledAt",
    mid.status === "SCHEDULED",
    `status=${mid.status} early=${early}`
  );

  // User must not see SCHEDULED
  const hidden = await announcementService.listForUser(
    actor.userId,
    actor.role
  );
  check(
    "user cannot see SCHEDULED announcement",
    !hidden.some((a) => a.id === created.id)
  );

  await new Promise((r) =>
    setTimeout(r, Math.max(0, when.getTime() - Date.now()) + 200)
  );

  const [t1, t2] = await Promise.all([
    announcementService.processDueScheduledAnnouncements(),
    announcementService.processDueScheduledAnnouncements(),
  ]);
  const published = await announcementService.getById(created.id);
  check(
    "auto SCHEDULED→PUBLISHED",
    published.status === "PUBLISHED" && Boolean(published.publishedAt),
    `status=${published.status}`
  );
  check(
    "duplicate auto-publish prevented",
    t1 + t2 === 1,
    `t1=${t1} t2=${t2}`
  );

  const visible = await announcementService.listForUser(
    actor.userId,
    actor.role
  );
  check(
    "user visibility after publication",
    visible.some((a) => a.id === created.id && a.title === created.title)
  );

  const audit = await AdminAuditLog.findOne({
    resource: "announcement",
    resourceId: created.id,
    action: "announcement.publish",
    "after.via": ANNOUNCEMENT_PUBLISH_VIA_SCHEDULER,
  })
    .sort({ createdAt: -1 })
    .lean();
  check(
    "audit log for scheduler publish",
    Boolean(audit) &&
      String(audit?.actorId) === actor.userId &&
      (audit as any)?.after?.via === ANNOUNCEMENT_PUBLISH_VIA_SCHEDULER,
    audit
      ? `actor=${audit.actorId} via=${(audit as any)?.after?.via}`
      : "missing audit row"
  );

  // Manual publish override on a fresh draft
  const draft2 = await announcementService.create(actor, {
    title: `Manual pub ${Date.now()}`,
    message: "manual",
    type: "INFO",
    priority: 1,
    audience: "ALL_USERS",
    targetUsers: [],
    targetRoles: [],
    actionUrl: "",
    scheduledAt: null,
    expiresAt: null,
  });
  const man = await announcementService.publish(actor, draft2.id);
  check("admin manual publish preserved", man.status === "PUBLISHED");
  try {
    await announcementService.publish(actor, draft2.id);
    check("manual re-publish rejected", false);
  } catch (e: any) {
    check(
      "manual re-publish rejected",
      /already published/i.test(String(e?.message || e))
    );
  }

  // Cleanup
  await Announcement.deleteMany({
    _id: {
      $in: [
        new mongoose.Types.ObjectId(created.id),
        new mongoose.Types.ObjectId(draft2.id),
      ],
    },
  });

  await mongoose.disconnect();
}

(async () => {
  if (process.env.LIVE_E2E === "1") {
    await liveE2E();
  } else {
    console.log("NOTE: set LIVE_E2E=1 for Mongo lifecycle E2E");
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
