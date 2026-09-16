import { Types } from "mongoose";
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
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../utils/errors/app.error";

export type ActorCtx = {
  userId: string;
  email?: string;
  authorization?: string;
  ip?: string;
  userAgent?: string;
};

const ALLOWED_TRANSITIONS: Record<ContestStatus, ContestStatus[]> = {
  DRAFT: ["SCHEDULED", "ARCHIVED"],
  SCHEDULED: ["LIVE", "DRAFT", "ARCHIVED"],
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
    return contest;
  }

  async end(contestId: string, actor: ActorCtx) {
    const contest = await this.transition(contestId, "ENDED", actor);
    await this.recomputeLeaderboard(contestId);
    return contest;
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
    const problemOid = oid(input.problemId, "problemId");
    const cp = await ContestProblem.findOne({
      contestId: contest._id,
      problemId: problemOid,
    }).lean();
    const score = cp?.points ?? 100;

    const doc = await ContestSubmission.findOneAndUpdate(
      {
        contestId: contest._id,
        submissionId: String(input.submissionId),
      },
      {
        $set: {
          userId: String(input.userId),
          problemId: problemOid,
          status: "ACCEPTED",
          score,
        },
        $setOnInsert: {
          contestId: contest._id,
          submissionId: String(input.submissionId),
        },
      },
      { upsert: true, new: true }
    );

    await this.recomputeLeaderboard(input.contestId);
    return doc;
  }
}

export const contestService = new ContestService();
