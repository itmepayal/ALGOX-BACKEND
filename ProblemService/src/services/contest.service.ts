import { Types } from "mongoose";
import axios from "axios";
import {
  Contest,
  type ContestStatus,
  type IContest,
} from "../models/contest.model";
import { ContestProblem } from "../models/contestProblem.model";
import { ContestParticipant } from "../models/contestParticipant.model";
import { ContestSubmission } from "../models/contestSubmission.model";
import { ContestLeaderboardEntry } from "../models/contestLeaderboardEntry.model";
import { Problem } from "../models/problem.model";
import { serverConfig } from "../config";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors/app.error";
import { emitRealtimeEvent } from "../utils/helpers/realtimeEmit";

export type ActorCtx = {
  userId: string;
  email?: string;
  authorization?: string;
  ip?: string;
  userAgent?: string;
};

/** System actor for timestamp-driven lifecycle automation (not an admin override). */
export const CONTEST_SYSTEM_ACTOR: ActorCtx = {
  userId: "system:contest-lifecycle",
};

const ALLOWED_TRANSITIONS: Record<ContestStatus, ContestStatus[]> = {
  DRAFT: ["SCHEDULED", "ARCHIVED"],
  // ENDED: miss the window (never went live) — automation only path via processDue
  SCHEDULED: ["LIVE", "DRAFT", "ARCHIVED", "ENDED"],
  LIVE: ["ENDED", "ARCHIVED"],
  ENDED: ["ARCHIVED"],
  ARCHIVED: [],
};

function oid(id: string, label = "id"): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return new Types.ObjectId(id);
}

function durationFromTimes(start: Date, end: Date): number {
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  if (mins < 1) throw new BadRequestError("Contest duration must be at least 1 minute");
  return mins;
}

function assertTransition(from: ContestStatus, to: ContestStatus) {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new BadRequestError(`Cannot transition contest from ${from} to ${to}`);
  }
}

async function findContestOrThrow(contestId: string): Promise<IContest> {
  const contest = await Contest.findById(oid(contestId, "contestId"));
  if (!contest) throw new NotFoundError("Contest not found");
  return contest;
}

function contestRoom(contestId: string | Types.ObjectId): string {
  return `contest:${String(contestId)}`;
}

function emitContestStatus(
  contest: { _id: unknown; slug: string; status: ContestStatus },
  event: "contest.started" | "contest.ended" | "contest.status_changed",
  extra?: Record<string, unknown>
) {
  const id = String(contest._id);
  emitRealtimeEvent({
    event,
    room: contestRoom(id),
    status: contest.status,
    payload: {
      contestId: id,
      slug: contest.slug,
      status: contest.status,
      ...(extra || {}),
    },
  });
}

function emitContestLeaderboard(
  contestId: string | Types.ObjectId,
  slug: string,
  entries: Array<{ rank?: number; userId?: string; score?: number }>
) {
  const id = String(contestId);
  emitRealtimeEvent({
    event: "leaderboard.updated",
    room: contestRoom(id),
    status: "ok",
    payload: {
      contestId: id,
      slug,
      kind: "contest",
      total: entries.length,
      top: entries.slice(0, 10).map((e) => ({
        rank: e.rank,
        userId: e.userId,
        score: e.score,
      })),
    },
  });
}

export class ContestService {
  async listContests(includeArchived = true) {
    const filter = includeArchived ? {} : { status: { $ne: "ARCHIVED" } };
    return Contest.find(filter).sort({ startTime: -1 }).lean({ virtuals: true });
  }

  async getContestById(contestId: string) {
    const contest = await findContestOrThrow(contestId);
    const problems = await ContestProblem.find({ contestId: contest._id })
      .sort({ order: 1 })
      .populate("problemId", "title slug difficulty status")
      .lean({ virtuals: true });
    return { ...contest.toJSON(), problems };
  }

  async listPublicContests() {
    return Contest.find({
      status: { $in: ["SCHEDULED", "LIVE", "ENDED"] },
    })
      .sort({ startTime: -1 })
      .select("title slug description status startTime endTime durationMinutes rules")
      .lean({ virtuals: true });
  }

  async getPublicBySlug(slug: string, viewerUserId?: string) {
    const contest = await Contest.findOne({
      slug: slug.toLowerCase().trim(),
      status: { $in: ["SCHEDULED", "LIVE", "ENDED"] },
    });
    if (!contest) throw new NotFoundError("Contest not found");

    const problems = await ContestProblem.find({ contestId: contest._id })
      .sort({ order: 1 })
      .populate("problemId", "title slug difficulty")
      .lean({ virtuals: true });

    const participantCount = await ContestParticipant.countDocuments({
      contestId: contest._id,
    });

    let isRegistered = false;
    if (viewerUserId) {
      const part = await ContestParticipant.findOne({
        contestId: contest._id,
        userId: String(viewerUserId),
      })
        .select("_id")
        .lean();
      isRegistered = Boolean(part);
    }

    return {
      ...contest.toJSON(),
      problems,
      participantCount,
      isRegistered,
    };
  }

  async createContest(
    input: {
      title: string;
      slug: string;
      description?: string;
      startTime: Date;
      endTime: Date;
      durationMinutes?: number;
      rules?: string;
      status?: ContestStatus;
    },
    actor: ActorCtx
  ) {
    const slug = input.slug.toLowerCase().trim();
    const existing = await Contest.findOne({ slug });
    if (existing) throw new ConflictError(`Contest slug already exists: ${slug}`);

    if (input.endTime <= input.startTime) {
      throw new BadRequestError("endTime must be after startTime");
    }

    const durationMinutes =
      input.durationMinutes ?? durationFromTimes(input.startTime, input.endTime);

    const status: ContestStatus = input.status || "DRAFT";
    if (status !== "DRAFT" && status !== "SCHEDULED") {
      throw new BadRequestError("New contests must start as DRAFT or SCHEDULED");
    }

    return Contest.create({
      title: input.title,
      slug,
      description: input.description || "",
      startTime: input.startTime,
      endTime: input.endTime,
      durationMinutes,
      rules: input.rules || "",
      status,
      createdBy: actor.userId,
      updatedBy: actor.userId,
    });
  }

  async updateContest(
    contestId: string,
    input: {
      title?: string;
      description?: string;
      startTime?: Date;
      endTime?: Date;
      durationMinutes?: number;
      rules?: string;
    },
    actor: ActorCtx
  ) {
    const contest = await findContestOrThrow(contestId);
    if (contest.status === "ARCHIVED") {
      throw new BadRequestError("Cannot update an archived contest");
    }
    if (contest.status === "LIVE" || contest.status === "ENDED") {
      // Allow rules/description tweaks only after start
      if (input.startTime || input.endTime || input.durationMinutes) {
        throw new BadRequestError(
          "Cannot change schedule for a LIVE or ENDED contest"
        );
      }
    }

    if (input.title !== undefined) contest.title = input.title;
    if (input.description !== undefined) contest.description = input.description;
    if (input.rules !== undefined) contest.rules = input.rules;
    if (input.startTime !== undefined) contest.startTime = input.startTime;
    if (input.endTime !== undefined) contest.endTime = input.endTime;

    if (contest.endTime <= contest.startTime) {
      throw new BadRequestError("endTime must be after startTime");
    }

    contest.durationMinutes =
      input.durationMinutes ??
      durationFromTimes(contest.startTime, contest.endTime);
    contest.updatedBy = actor.userId;
    await contest.save();
    return contest;
  }

  async deleteContest(contestId: string) {
    const contest = await findContestOrThrow(contestId);
    if (contest.status === "LIVE") {
      throw new BadRequestError("End or archive a LIVE contest before deleting");
    }
    const id = contest._id;
    await Promise.all([
      ContestProblem.deleteMany({ contestId: id }),
      ContestParticipant.deleteMany({ contestId: id }),
      ContestSubmission.deleteMany({ contestId: id }),
      ContestLeaderboardEntry.deleteMany({ contestId: id }),
      Contest.deleteOne({ _id: id }),
    ]);
    return { deleted: true, contestId };
  }

  private async transition(
    contestId: string,
    to: ContestStatus,
    actor: ActorCtx
  ) {
    const contest = await findContestOrThrow(contestId);
    assertTransition(contest.status, to);
    contest.status = to;
    contest.updatedBy = actor.userId;
    await contest.save();
    return contest;
  }

  async publish(contestId: string, actor: ActorCtx) {
    // publish = schedule for public visibility
    return this.transition(contestId, "SCHEDULED", actor);
  }

  async schedule(contestId: string, actor: ActorCtx) {
    return this.transition(contestId, "SCHEDULED", actor);
  }

  async start(contestId: string, actor: ActorCtx) {
    const contest = await findContestOrThrow(contestId);
    assertTransition(contest.status, "LIVE");
    const now = new Date();
    if (now > contest.endTime) {
      throw new BadRequestError("Cannot start a contest past its endTime");
    }
    contest.status = "LIVE";
    if (contest.startTime > now) {
      contest.startTime = now;
      contest.durationMinutes = durationFromTimes(contest.startTime, contest.endTime);
    }
    contest.updatedBy = actor.userId;
    await contest.save();
    emitContestStatus(contest, "contest.started", { via: "admin" });
    emitContestStatus(contest, "contest.status_changed", { via: "admin" });
    return contest;
  }

  async end(contestId: string, actor: ActorCtx) {
    const contest = await this.transition(contestId, "ENDED", actor);
    const board = await this.recomputeLeaderboard(contestId);
    emitContestStatus(contest, "contest.ended", { via: "admin" });
    emitContestStatus(contest, "contest.status_changed", { via: "admin" });
    // Server-side rating only — never trust client. Virtual contests do not call this.
    void this.pushContestRatings(contestId, board).catch(() => undefined);
    return contest;
  }

  /**
   * Timestamp-driven automation: SCHEDULED→LIVE when startTime reached,
   * LIVE→ENDED when endTime reached. Idempotent via atomic status filters.
   * Admin start/end remain available as overrides.
   */
  async processDueLifecycleTransitions(): Promise<{
    started: number;
    ended: number;
    expiredScheduled: number;
  }> {
    const now = new Date();
    let started = 0;
    let ended = 0;
    let expiredScheduled = 0;

    // Missed window: SCHEDULED but already past endTime → ENDED (never went live)
    const expiredIds = await Contest.find({
      status: "SCHEDULED",
      endTime: { $lte: now },
    })
      .select("_id")
      .limit(50)
      .lean();

    for (const row of expiredIds) {
      const claimed = await Contest.findOneAndUpdate(
        { _id: row._id, status: "SCHEDULED", endTime: { $lte: now } },
        { $set: { status: "ENDED", updatedBy: CONTEST_SYSTEM_ACTOR.userId } },
        { returnDocument: 'after' }
      );
      if (!claimed) continue;
      expiredScheduled += 1;
      emitContestStatus(claimed, "contest.ended", { via: "scheduler", reason: "missed_window" });
      emitContestStatus(claimed, "contest.status_changed", {
        via: "scheduler",
        reason: "missed_window",
      });
    }

    // Due starts: SCHEDULED and startTime reached (still before end)
    const dueStart = await Contest.find({
      status: "SCHEDULED",
      startTime: { $lte: now },
      endTime: { $gt: now },
    })
      .select("_id")
      .limit(50)
      .lean();

    for (const row of dueStart) {
      const claimed = await Contest.findOneAndUpdate(
        {
          _id: row._id,
          status: "SCHEDULED",
          startTime: { $lte: now },
          endTime: { $gt: now },
        },
        { $set: { status: "LIVE", updatedBy: CONTEST_SYSTEM_ACTOR.userId } },
        { returnDocument: 'after' }
      );
      if (!claimed) continue;
      started += 1;
      emitContestStatus(claimed, "contest.started", { via: "scheduler" });
      emitContestStatus(claimed, "contest.status_changed", { via: "scheduler" });
    }

    // Due ends: LIVE and endTime reached
    const dueEnd = await Contest.find({
      status: "LIVE",
      endTime: { $lte: now },
    })
      .select("_id")
      .limit(50)
      .lean();

    for (const row of dueEnd) {
      const claimed = await Contest.findOneAndUpdate(
        { _id: row._id, status: "LIVE", endTime: { $lte: now } },
        { $set: { status: "ENDED", updatedBy: CONTEST_SYSTEM_ACTOR.userId } },
        { returnDocument: 'after' }
      );
      if (!claimed) continue;
      ended += 1;
      const id = String(claimed._id);
      const board = await this.recomputeLeaderboard(id);
      emitContestStatus(claimed, "contest.ended", { via: "scheduler" });
      emitContestStatus(claimed, "contest.status_changed", { via: "scheduler" });
      void this.pushContestRatings(id, board).catch(() => undefined);
    }

    return { started, ended, expiredScheduled };
  }

  /**
   * Fan-in to LeaderboardService with final ranks (idempotent per contest+user).
   */
  private async pushContestRatings(contestId: string, board: any[]) {
    const entries = (board || [])
      .map((e: any) => ({
        userId: String(e.userId || ""),
        rank: Number(e.rank) || 0,
      }))
      .filter((e: any) => e.userId && e.rank >= 1);
    if (!entries.length) return;

    const base = String(serverConfig.LEADERBOARD_SERVICE_URL || "").replace(
      /\/$/,
      ""
    );
    await axios.post(
      `${base}/leaderboard/internal/contest-rating`,
      { contestId: String(contestId), entries },
      {
        timeout: 8000,
        headers: {
          "x-internal-secret": serverConfig.INTERNAL_SERVICE_SECRET,
          "Content-Type": "application/json",
        },
        validateStatus: () => true,
      }
    );
  }

  /** Public leaderboard for LIVE/ENDED contests (no client recompute flag). */
  async getPublicLeaderboard(
    slug: string,
    viewerUserId?: string,
    opts?: { page?: number; limit?: number }
  ) {
    const contest = await Contest.findOne({
      slug: slug.toLowerCase().trim(),
    });
    if (!contest) throw new NotFoundError("Contest not found");
    if (
      contest.status !== "LIVE" &&
      contest.status !== "ENDED" &&
      contest.status !== "ARCHIVED"
    ) {
      throw new BadRequestError("Leaderboard unavailable for this contest status");
    }

    const page = Math.max(1, Number(opts?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(opts?.limit) || 50));
    let entries = await ContestLeaderboardEntry.find({ contestId: contest._id })
      .sort({ rank: 1 })
      .lean();
    if (!entries.length && contest.status === "LIVE") {
      entries = (await this.recomputeLeaderboard(String(contest._id))) as any;
    }

    const total = entries.length;
    const slice = entries.slice((page - 1) * limit, page * limit).map((e: any) => ({
      rank: e.rank,
      userId: e.userId,
      score: e.score,
      solvedCount: e.solvedCount,
      penalty: e.penalty,
    }));

    let myEntry: any = null;
    if (viewerUserId) {
      const mine = entries.find((e: any) => String(e.userId) === String(viewerUserId));
      if (mine) {
        myEntry = {
          rank: (mine as any).rank,
          userId: (mine as any).userId,
          score: (mine as any).score,
          solvedCount: (mine as any).solvedCount,
          penalty: (mine as any).penalty,
        };
      }
    }

    return {
      contestId: String(contest._id),
      slug: contest.slug,
      status: contest.status,
      page,
      limit,
      total,
      entries: slice,
      myEntry,
    };
  }

  async archive(contestId: string, actor: ActorCtx) {
    return this.transition(contestId, "ARCHIVED", actor);
  }

  async addProblem(
    contestId: string,
    input: { problemId: string; points?: number; order?: number }
  ) {
    const contest = await findContestOrThrow(contestId);
    if (contest.status === "ARCHIVED") {
      throw new BadRequestError("Cannot modify problems on an archived contest");
    }

    const problemOid = oid(input.problemId, "problemId");
    const problem = await Problem.findById(problemOid);
    if (!problem) throw new NotFoundError("Problem not found");

    const existing = await ContestProblem.findOne({
      contestId: contest._id,
      problemId: problemOid,
    });
    if (existing) {
      throw new ConflictError("Problem already added to this contest");
    }

    let order = input.order;
    if (order === undefined) {
      const last = await ContestProblem.findOne({ contestId: contest._id })
        .sort({ order: -1 })
        .select("order")
        .lean();
      order = (last?.order ?? -1) + 1;
    }

    return ContestProblem.create({
      contestId: contest._id,
      problemId: problemOid,
      points: input.points ?? 100,
      order,
    });
  }

  async removeProblem(contestId: string, problemId: string) {
    const contest = await findContestOrThrow(contestId);
    if (contest.status === "LIVE") {
      throw new BadRequestError("Cannot remove problems from a LIVE contest");
    }
    const result = await ContestProblem.deleteOne({
      contestId: contest._id,
      problemId: oid(problemId, "problemId"),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundError("Contest problem not found");
    }
    return { removed: true };
  }

  async listParticipants(contestId: string) {
    const contest = await findContestOrThrow(contestId);
    return ContestParticipant.find({ contestId: contest._id })
      .sort({ score: -1, penalty: 1, registeredAt: 1 })
      .lean({ virtuals: true });
  }

  async register(slug: string, userId: string) {
    const contest = await Contest.findOne({
      slug: slug.toLowerCase().trim(),
    });
    if (!contest) throw new NotFoundError("Contest not found");

    if (contest.status === "DRAFT" || contest.status === "ARCHIVED") {
      throw new BadRequestError("Contest is not open for registration");
    }
    if (contest.status === "ENDED") {
      throw new BadRequestError("Contest has ended");
    }

    // Enforce window for late registration once LIVE
    if (contest.status === "LIVE") {
      const now = new Date();
      if (now > contest.endTime) {
        throw new BadRequestError("Contest submission window has ended");
      }
    }

    try {
      const participant = await ContestParticipant.create({
        contestId: contest._id,
        userId,
        registeredAt: new Date(),
        score: 0,
        solvedCount: 0,
        penalty: 0,
      });
      return participant;
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictError("Already registered for this contest");
      }
      throw err;
    }
  }

  /**
   * Recompute ranks from ContestSubmission (accepted/scored) and sync
   * ContestParticipant + ContestLeaderboardEntry.
   */
  async recomputeLeaderboard(contestId: string) {
    const contest = await findContestOrThrow(contestId);
    const cid = contest._id as Types.ObjectId;

    const problemPoints = await ContestProblem.find({ contestId: cid })
      .select("problemId points")
      .lean();
    const pointsMap = new Map(
      problemPoints.map((p) => [p.problemId.toString(), p.points ?? 100])
    );

    // Best positive score per (user, problem); first solve time for penalty
    const bestScores = await ContestSubmission.aggregate([
      { $match: { contestId: cid, score: { $gt: 0 } } },
      {
        $group: {
          _id: { userId: "$userId", problemId: "$problemId" },
          bestScore: { $max: "$score" },
          firstSolvedAt: { $min: "$createdAt" },
        },
      },
    ]);

    type Acc = { score: number; solvedCount: number; penalty: number };
    const byUser = new Map<string, Acc>();
    const startMs = contest.startTime.getTime();

    for (const row of bestScores) {
      const userId = String(row._id.userId);
      const problemId = String(row._id.problemId);
      const rawScore = Number(row.bestScore) || 0;
      const points = rawScore > 0 ? rawScore : pointsMap.get(problemId) || 0;
      if (points <= 0) continue;

      const acc = byUser.get(userId) || { score: 0, solvedCount: 0, penalty: 0 };
      acc.score += points;
      acc.solvedCount += 1;
      const first = new Date(row.firstSolvedAt).getTime();
      acc.penalty += Math.max(0, Math.floor((first - startMs) / 60000));
      byUser.set(userId, acc);
    }

    // Also include registered participants with zero solves
    const participants = await ContestParticipant.find({ contestId: cid });
    for (const p of participants) {
      if (!byUser.has(p.userId)) {
        byUser.set(p.userId, { score: 0, solvedCount: 0, penalty: 0 });
      }
    }

    const ranked = [...byUser.entries()]
      .map(([userId, stats]) => ({ userId, ...stats }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.penalty !== b.penalty) return a.penalty - b.penalty;
        return a.userId.localeCompare(b.userId);
      });

    await ContestLeaderboardEntry.deleteMany({ contestId: cid });

    const entries = ranked.map((r, idx) => ({
      contestId: cid,
      userId: r.userId,
      rank: idx + 1,
      score: r.score,
      solvedCount: r.solvedCount,
      penalty: r.penalty,
    }));

    if (entries.length) {
      await ContestLeaderboardEntry.insertMany(entries);
    }

    emitContestLeaderboard(cid, contest.slug, entries);

    // Sync participant aggregates
    await Promise.all(
      ranked.map((r) =>
        ContestParticipant.findOneAndUpdate(
          { contestId: cid, userId: r.userId },
          {
            $set: {
              score: r.score,
              solvedCount: r.solvedCount,
              penalty: r.penalty,
            },
          },
          { upsert: false }
        )
      )
    );

    return entries;
  }

  async getLeaderboard(contestId: string, recompute = false) {
    await findContestOrThrow(contestId);
    if (recompute) {
      return this.recomputeLeaderboard(contestId);
    }

    const entries = await ContestLeaderboardEntry.find({
      contestId: oid(contestId, "contestId"),
    })
      .sort({ rank: 1 })
      .lean();

    if (!entries.length) {
      return this.recomputeLeaderboard(contestId);
    }

    return entries;
  }

  /**
   * Own contest participation summary — real ContestParticipant rows only.
   * No fabricated ranks/scores.
   */
  async getMyContestSummary(userId: string) {
    const uid = String(userId || "").trim();
    if (!uid) {
      return {
        contestsEntered: 0,
        totalScore: 0,
        totalSolved: 0,
        items: [] as Array<Record<string, unknown>>,
      };
    }

    const parts = await ContestParticipant.find({ userId: uid })
      .sort({ registeredAt: -1 })
      .limit(50)
      .lean();

    const contestIds = parts.map((p) => p.contestId);
    const contests = contestIds.length
      ? await Contest.find({ _id: { $in: contestIds } })
          .select("title slug status startTime endTime")
          .lean()
      : [];
    const byId = new Map(contests.map((c) => [String(c._id), c]));

    const leaderboardRanks = await ContestLeaderboardEntry.find({
      userId: uid,
      contestId: { $in: contestIds },
    })
      .select("contestId rank score solvedCount")
      .lean();
    const rankByContest = new Map(
      leaderboardRanks.map((e) => [String(e.contestId), e])
    );

    let totalScore = 0;
    let totalSolved = 0;
    const items = parts.map((p) => {
      const c = byId.get(String(p.contestId));
      const lb = rankByContest.get(String(p.contestId));
      totalScore += Number(p.score) || 0;
      totalSolved += Number(p.solvedCount) || 0;
      return {
        contestId: String(p.contestId),
        title: c?.title || null,
        slug: c?.slug || null,
        status: c?.status || null,
        startTime: c?.startTime || null,
        endTime: c?.endTime || null,
        score: Number(p.score) || 0,
        solvedCount: Number(p.solvedCount) || 0,
        penalty: Number(p.penalty) || 0,
        registeredAt: p.registeredAt,
        rank: lb?.rank != null ? Number(lb.rank) : null,
      };
    });

    return {
      contestsEntered: parts.length,
      totalScore,
      totalSolved,
      items,
    };
  }

  /**
   * S2S: persist an ACCEPTED contest submission (idempotent on contestId+submissionId)
   * then recompute the contest leaderboard.
   */
  async recordAcceptedSubmission(input: {
    contestId: string;
    submissionId: string;
    userId: string;
    problemId: string;
  }) {
    const contest = await findContestOrThrow(input.contestId);
    const uid = String(input.userId || "").trim();
    if (!uid) throw new BadRequestError("userId is required");

    const participant = await ContestParticipant.findOne({
      contestId: contest._id,
      userId: uid,
    }).lean();
    if (!participant) {
      throw new ForbiddenError("User is not registered for this contest");
    }

    const problemOid = oid(input.problemId, "problemId");
    const cp = await ContestProblem.findOne({
      contestId: contest._id,
      problemId: problemOid,
    }).lean();
    if (!cp) {
      throw new BadRequestError("Problem is not part of this contest");
    }
    const score = cp?.points ?? 100;

    const doc = await ContestSubmission.findOneAndUpdate(
      {
        contestId: contest._id,
        submissionId: String(input.submissionId),
      },
      {
        $set: {
          userId: uid,
          problemId: problemOid,
          status: "ACCEPTED",
          score,
        },
        $setOnInsert: {
          contestId: contest._id,
          submissionId: String(input.submissionId),
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    await this.recomputeLeaderboard(input.contestId);
    return doc;
  }
}

export const contestService = new ContestService();
