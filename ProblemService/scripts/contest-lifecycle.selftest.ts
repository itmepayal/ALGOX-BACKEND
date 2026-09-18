/**
 * Section 8 — Live contest automation self-test (static + optional live E2E).
 * Run: cd server/ProblemService && npx tsx scripts/contest-lifecycle.selftest.ts
 *
 * LIVE_E2E=1 enables HTTP E2E against running services (admin JWT required via env).
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

const service = read("src/services/contest.service.ts");
const job = read("src/jobs/contestLifecycle.job.ts");
const server = read("src/server.ts");
const emit = read("src/utils/helpers/realtimeEmit.ts");
const rtEvents = fs.readFileSync(
  path.join(root, "../RealtimeService/src/socket/events.ts"),
  "utf8"
);
const panel = readClient("components/ContestsPanel.tsx");

check(
  "ALLOWED_TRANSITIONS includes SCHEDULED→LIVE and LIVE→ENDED",
  service.includes('SCHEDULED: ["LIVE"') && service.includes('LIVE: ["ENDED"')
);
check(
  "processDueLifecycleTransitions exists",
  service.includes("processDueLifecycleTransitions")
);
check(
  "atomic findOneAndUpdate for SCHEDULED→LIVE",
  service.includes('status: "SCHEDULED"') &&
    service.includes('status: "LIVE"') &&
    service.includes("findOneAndUpdate")
);
check(
  "atomic LIVE→ENDED + pushContestRatings",
  service.includes('status: "LIVE"') &&
    service.includes("pushContestRatings") &&
    service.includes('via: "scheduler"')
);
check(
  "missed window SCHEDULED→ENDED",
  service.includes("missed_window") || service.includes("expiredScheduled")
);
check(
  "admin start/end still present (override)",
  service.includes("async start(") && service.includes("async end(")
);
check(
  "leaderboard emit on recompute",
  service.includes("emitContestLeaderboard") &&
    service.includes("leaderboard.updated")
);
check(
  "realtime emit helper",
  emit.includes("ProblemService") && emit.includes("REALTIME_INGEST")
);
check(
  "lifecycle job + in-process mutex",
  job.includes("tickRunning") && job.includes("processDueLifecycleTransitions")
);
check(
  "server starts contest lifecycle job",
  server.includes("startContestLifecycleJob")
);
check(
  "realtime contest events registered",
  rtEvents.includes('contest.started') &&
    rtEvents.includes('contest.ended') &&
    rtEvents.includes("contest.status_changed")
);
check(
  "client live poll + room join",
  panel.includes("leaderboard.updated") &&
    panel.includes("room.join") &&
    panel.includes("detail?.status !== \"LIVE\"")
);
check(
  "registration still SCHEDULED|LIVE",
  service.includes('contest.status === "ENDED"') &&
    panel.includes('c.status === "SCHEDULED" || c.status === "LIVE"')
);

async function liveE2E() {
  const base =
    process.env.PROBLEM_SERVICE_URL || "http://localhost:3003/api/v1";
  const authBase =
    process.env.AUTH_SERVICE_URL || "http://localhost:3001/api/v1";
  const email = process.env.E2E_ADMIN_EMAIL || process.env.E2E_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD || process.env.E2E_PASSWORD;
  if (!email || !password) {
    console.log("SKIP live E2E — set E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD");
    return;
  }

  const loginRes = await fetch(`${authBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginJson: any = await loginRes.json();
  const token = loginJson?.data?.accessToken;
  check("login for contest E2E", Boolean(token), loginJson?.message);

  if (!token) return;
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const slug = `auto-e2e-${Date.now()}`;
  const start = new Date(Date.now() + 8_000);
  const end = new Date(Date.now() + 45_000);

  const createRes = await fetch(`${base}/admin/contests`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      title: `Lifecycle E2E ${slug}`,
      slug,
      description: "Section 8 automation test",
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      status: "SCHEDULED",
    }),
  });
  const createJson: any = await createRes.json();
  const contestId = createJson?.data?.id || createJson?.data?._id;
  check("create SCHEDULED contest", createRes.ok && Boolean(contestId), createJson?.message);

  if (!contestId) return;

  // Attach first published problem if available
  const probsRes = await fetch(`${base}/problems?limit=1`, { headers: auth });
  const probsJson: any = await probsRes.json();
  const problemId =
    probsJson?.data?.[0]?.id ||
    probsJson?.data?.[0]?._id ||
    probsJson?.data?.problems?.[0]?.id;
  if (problemId) {
    const addRes = await fetch(`${base}/admin/contests/${contestId}/problems`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ problemId, points: 100, order: 0 }),
    });
    check("attach problem", addRes.ok, (await addRes.json() as any)?.message);
  } else {
    console.log("SKIP attach problem — none found");
  }

  // Wait for auto-start (tick 15s + buffer)
  let status = "SCHEDULED";
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const g = await fetch(`${base}/contests/${slug}`, { headers: auth });
    const gj: any = await g.json();
    status = gj?.data?.status || status;
    console.log(`  poll status=${status} i=${i}`);
    if (status === "LIVE" || status === "ENDED") break;
  }
  check("auto SCHEDULED→LIVE", status === "LIVE" || status === "ENDED", `got ${status}`);

  if (status === "LIVE") {
    const reg = await fetch(`${base}/contests/${slug}/register`, {
      method: "POST",
      headers: auth,
    });
    check("register while LIVE", reg.ok || reg.status === 409, String(reg.status));

    // Direct S2S-style leaderboard path: internal record if we have submission id —
    // for E2E use admin recompute after synthetic contest submission via public record
    // Fallback: call process by waiting for end.
    const lb1 = await fetch(`${base}/contests/${slug}/leaderboard`, {
      headers: auth,
    });
    check("leaderboard available while LIVE", lb1.ok, String(lb1.status));
  }

  // Wait for auto-end
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const g = await fetch(`${base}/contests/${slug}`, { headers: auth });
    const gj: any = await g.json();
    status = gj?.data?.status || status;
    console.log(`  poll end status=${status} i=${i}`);
    if (status === "ENDED") break;
  }
  check("auto LIVE→ENDED", status === "ENDED", `got ${status}`);

  // Admin override still works on a fresh contest
  const slug2 = `admin-override-${Date.now()}`;
  const start2 = new Date(Date.now() + 3600_000);
  const end2 = new Date(Date.now() + 7200_000);
  const c2 = await fetch(`${base}/admin/contests`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      title: `Override ${slug2}`,
      slug: slug2,
      startTime: start2.toISOString(),
      endTime: end2.toISOString(),
      status: "SCHEDULED",
    }),
  });
  const c2j: any = await c2.json();
  const id2 = c2j?.data?.id || c2j?.data?._id;
  if (id2) {
    const startRes = await fetch(`${base}/admin/contests/${id2}/start`, {
      method: "POST",
      headers: auth,
    });
    const startJ: any = await startRes.json();
    check(
      "admin early start override",
      startRes.ok && startJ?.data?.status === "LIVE",
      startJ?.message
    );
    const endRes = await fetch(`${base}/admin/contests/${id2}/end`, {
      method: "POST",
      headers: auth,
    });
    const endJ: any = await endRes.json();
    check(
      "admin early end override",
      endRes.ok && endJ?.data?.status === "ENDED",
      endJ?.message
    );
  } else {
    check("admin override contest create", false, c2j?.message);
  }
}

(async () => {
  if (process.env.LIVE_E2E === "1") {
    await liveE2E();
  } else {
    console.log("NOTE: set LIVE_E2E=1 for HTTP lifecycle E2E");
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
