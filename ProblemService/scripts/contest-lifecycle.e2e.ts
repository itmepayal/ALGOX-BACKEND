/**
 * Section 8 live E2E — scheduled → live → submission → leaderboard → end.
 * Uses ContestService directly (same code path as the interval job).
 *
 * Run: cd server/ProblemService && npx tsx scripts/contest-lifecycle.e2e.ts
 */
import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { Contest } from "../src/models/contest.model";
import { ContestProblem } from "../src/models/contestProblem.model";
import { ContestParticipant } from "../src/models/contestParticipant.model";
import { ContestLeaderboardEntry } from "../src/models/contestLeaderboardEntry.model";
import { ContestSubmission } from "../src/models/contestSubmission.model";
import { Problem } from "../src/models/problem.model";
import {
  contestService,
  CONTEST_SYSTEM_ACTOR,
} from "../src/services/contest.service";

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

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const mongo = process.env.MONGO_URL;
  if (!mongo) throw new Error("MONGO_URL required");
  await mongoose.connect(mongo);

  const slug = `e2e-life-${Date.now()}`;
  const userId = `e2e-user-${Date.now()}`;
  const now = Date.now();
  const startTime = new Date(now + 1500);
  const endTime = new Date(now + 12_000);

  const contest = await Contest.create({
    title: `Lifecycle E2E ${slug}`,
    slug,
    description: "auto",
    startTime,
    endTime,
    durationMinutes: 1,
    status: "SCHEDULED",
    rules: "",
    createdBy: CONTEST_SYSTEM_ACTOR.userId,
    updatedBy: CONTEST_SYSTEM_ACTOR.userId,
  });
  check("create SCHEDULED contest", contest.status === "SCHEDULED");

  let problem = await Problem.findOne({ status: "published" })
    .select("_id")
    .lean();
  if (!problem) {
    problem = await Problem.findOne().select("_id").lean();
  }
  check("have a problem to attach", Boolean(problem));
  if (!problem) {
    await Contest.deleteOne({ _id: contest._id });
    await mongoose.disconnect();
    process.exit(1);
  }

  await ContestProblem.create({
    contestId: contest._id,
    problemId: problem._id,
    points: 100,
    order: 0,
  });

  // Too early — should not start
  const early = await contestService.processDueLifecycleTransitions();
  const still = await Contest.findById(contest._id);
  check(
    "no start before startTime",
    still?.status === "SCHEDULED" && early.started === 0,
    `status=${still?.status} started=${early.started}`
  );

  await sleep(Math.max(0, startTime.getTime() - Date.now()) + 200);

  // Duplicate ticks should only transition once
  const [t1, t2] = await Promise.all([
    contestService.processDueLifecycleTransitions(),
    contestService.processDueLifecycleTransitions(),
  ]);
  const live = await Contest.findById(contest._id);
  check("auto SCHEDULED→LIVE", live?.status === "LIVE", `status=${live?.status}`);
  check(
    "duplicate start prevented (at most one claim)",
    t1.started + t2.started === 1,
    `t1=${t1.started} t2=${t2.started}`
  );

  // Registration while LIVE
  const part = await contestService.register(slug, userId);
  check("register while LIVE", Boolean(part));
  try {
    await contestService.register(slug, userId);
    check("duplicate register rejected", false);
  } catch (e: any) {
    check(
      "duplicate register rejected",
      /already registered/i.test(String(e?.message || e))
    );
  }

  // Contest submission → leaderboard
  const subId = `sub-${Date.now()}`;
  await contestService.recordAcceptedSubmission({
    contestId: String(contest._id),
    submissionId: subId,
    userId,
    problemId: String(problem._id),
  });
  // Idempotent second record
  await contestService.recordAcceptedSubmission({
    contestId: String(contest._id),
    submissionId: subId,
    userId,
    problemId: String(problem._id),
  });
  const board = await contestService.getPublicLeaderboard(slug, userId);
  check(
    "leaderboard after submission",
    board.total >= 1 && board.myEntry?.score === 100,
    JSON.stringify(board.myEntry)
  );
  check(
    "rank present",
    board.myEntry?.rank === 1,
    `rank=${board.myEntry?.rank}`
  );

  // Admin override still works on a separate future contest
  const override = await Contest.create({
    title: "Admin override",
    slug: `e2e-override-${Date.now()}`,
    startTime: new Date(Date.now() + 3600_000),
    endTime: new Date(Date.now() + 7200_000),
    durationMinutes: 60,
    status: "SCHEDULED",
    createdBy: "admin-e2e",
    updatedBy: "admin-e2e",
  });
  const started = await contestService.start(String(override._id), {
    userId: "admin-e2e",
  });
  check("admin early start override", started.status === "LIVE");
  const endedOverride = await contestService.end(String(override._id), {
    userId: "admin-e2e",
  });
  check("admin early end override", endedOverride.status === "ENDED");

  // Wait for end window of main contest
  await sleep(Math.max(0, endTime.getTime() - Date.now()) + 200);
  const [e1, e2] = await Promise.all([
    contestService.processDueLifecycleTransitions(),
    contestService.processDueLifecycleTransitions(),
  ]);
  const finished = await Contest.findById(contest._id);
  check("auto LIVE→ENDED", finished?.status === "ENDED", `status=${finished?.status}`);
  check(
    "duplicate end prevented",
    e1.ended + e2.ended === 1,
    `e1=${e1.ended} e2=${e2.ended}`
  );

  // Submission after end should fail at helper level
  const { assertContestAllowsSubmission } = await import(
    "../src/utils/helpers/contestSubmission.helper"
  );
  try {
    await assertContestAllowsSubmission(String(contest._id), userId);
    check("reject submission after end", false);
  } catch (e: any) {
    check(
      "reject submission after end",
      /ended|window|not accepting/i.test(String(e?.message || e)),
      String(e?.message || e)
    );
  }

  // Cleanup
  await Promise.all([
    ContestProblem.deleteMany({ contestId: { $in: [contest._id, override._id] } }),
    ContestParticipant.deleteMany({
      contestId: { $in: [contest._id, override._id] },
    }),
    ContestSubmission.deleteMany({
      contestId: { $in: [contest._id, override._id] },
    }),
    ContestLeaderboardEntry.deleteMany({
      contestId: { $in: [contest._id, override._id] },
    }),
    Contest.deleteMany({ _id: { $in: [contest._id, override._id] } }),
  ]);

  await mongoose.disconnect();
  console.log(`\nE2E: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
