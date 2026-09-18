/**
 * Premium virtual contests — server timer, no rating manipulation.
 * Reuses ENDED contest problem sets; EvaluationService remains judge.
 */
import { Contest } from "../models/contest.model";
import { ContestProblem } from "../models/contestProblem.model";
import {
  VirtualContestSession,
  type IVirtualContestAttempt,
  type IVirtualContestReport,
  type IVirtualContestSession,
  type VirtualContestMode,
} from "../models/virtualContestSession.model";
import {
  resolveEntitlements,
  hasFeature,
} from "../utils/entitlementClient";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
} from "../utils/errors/app.error";
import { checkPremiumAbuseLimit } from "../utils/premiumAbuseLimit";

const FEATURE = "premium.virtual_contest";

type SessionDoc = IVirtualContestSession;

function publicSession(doc: SessionDoc, now = new Date()) {
  const remainingMs = Math.max(0, new Date(doc.endsAt).getTime() - now.getTime());
  return {
    id: String(doc._id),
    userId: doc.userId,
    sourceContestId: String(doc.sourceContestId),
    sourceContestSlug: doc.sourceContestSlug,
    mode: doc.mode,
    status: doc.status,
    problemIds: doc.problemIds || [],
    attempts: doc.attempts || [],
    startedAt: doc.startedAt,
    endsAt: doc.endsAt,
    completedAt: doc.completedAt || null,
    remainingMs,
    serverNow: now.toISOString(),
    report: doc.report || null,
  };
}

function buildReport(doc: SessionDoc): IVirtualContestReport {
  const attempts: IVirtualContestAttempt[] = doc.attempts || [];
  const solved = new Set(
    attempts.filter((a) => a.solved).map((a) => String(a.problemId))
  );
  const attempted = new Set(attempts.map((a) => String(a.problemId)));
  const unsolved = (doc.problemIds || []).filter(
    (id: string) => !solved.has(String(id))
  );
  const recommendations: IVirtualContestReport["recommendations"] = [];
  if (unsolved.length) {
    recommendations.push({
      title: "Practice unsolved contest problems",
      evidence: `${unsolved.length} of ${(doc.problemIds || []).length} problems without ACCEPTED in this session`,
      action: `Retry problem(s): ${unsolved.slice(0, 3).join(", ")}`,
    });
  }
  if (doc.mode === "practice") {
    recommendations.push({
      title: "Practice mode — no rating impact",
      evidence: "Virtual practice sessions never modify contest rating",
      action: "Start a live contest when ready for rated competition",
    });
  }
  return {
    status: doc.status,
    mode: doc.mode,
    durationMinutes: Math.max(
      1,
      Math.round(
        (new Date(doc.endsAt).getTime() - new Date(doc.startedAt).getTime()) /
          60000
      )
    ),
    solvedCount: solved.size,
    attemptedCount: attempted.size,
    problemIds: doc.problemIds || [],
    attempts,
    recommendations,
    note: "Report built from real session attempts only — rating unchanged for virtual/practice",
  };
}

export class VirtualContestService {
  private async requirePremium(authorization?: string | null) {
    const snap = await resolveEntitlements(authorization);
    if (!hasFeature(snap, FEATURE)) {
      throw new ForbiddenError(
        "Virtual contests require premium.virtual_contest"
      );
    }
  }

  private assertOwner(session: SessionDoc, userId: string) {
    if (session.userId !== userId) {
      throw new ForbiddenError("Unauthorized session access");
    }
  }

  async applyTimeoutIfNeeded(session: SessionDoc): Promise<SessionDoc> {
    if (session.status !== "in_progress") return session;
    const now = new Date();
    if (now <= session.endsAt) return session;
    session.status = "timed_out";
    session.completedAt = session.endsAt;
    session.report = buildReport(session);
    await session.save();
    return session;
  }

  async start(
    userId: string,
    input: { contestSlug: string; mode?: VirtualContestMode },
    authorization?: string | null
  ) {
    await this.requirePremium(authorization);
    const rl = checkPremiumAbuseLimit(`virtual-start:${userId}`, 5, 60_000);
    if (!rl.allowed) {
      throw new TooManyRequestsError(
        `Virtual contest start rate limited. Retry after ${rl.retryAfterSec}s`,
        { retryAfterSec: rl.retryAfterSec }
      );
    }
    const slug = String(input.contestSlug || "")
      .toLowerCase()
      .trim();
    if (!slug) throw new BadRequestError("contestSlug is required");

    const contest = await Contest.findOne({ slug });
    if (!contest) throw new NotFoundError("Contest not found");
    if (contest.status !== "ENDED" && contest.status !== "ARCHIVED") {
      throw new BadRequestError(
        "Virtual contests can only start from ENDED or ARCHIVED contests"
      );
    }

    const active = await VirtualContestSession.findOne({
      userId,
      status: "in_progress",
    });
    if (active) {
      throw new ConflictError("Finish or abandon your active virtual contest first");
    }

    const cps = await ContestProblem.find({ contestId: contest._id })
      .sort({ order: 1 })
      .lean();
    if (!cps.length) {
      throw new BadRequestError("Contest has no problems");
    }

    const now = new Date();
    const durationMinutes = Math.max(1, Number(contest.durationMinutes) || 90);
    const endsAt = new Date(now.getTime() + durationMinutes * 60_000);
    const mode: VirtualContestMode =
      input.mode === "practice" ? "practice" : "virtual";

    const session = await VirtualContestSession.create({
      userId,
      sourceContestId: contest._id,
      sourceContestSlug: contest.slug,
      mode,
      status: "in_progress",
      problemIds: cps.map((c) => String(c.problemId)),
      attempts: [],
      startedAt: now,
      endsAt,
    });

    return publicSession(session, now);
  }

  async getActive(userId: string, authorization?: string | null) {
    await this.requirePremium(authorization);
    const found = await VirtualContestSession.findOne({
      userId,
      status: "in_progress",
    });
    if (!found) return null;
    const session = await this.applyTimeoutIfNeeded(found);
    if (session.status !== "in_progress") return null;
    return publicSession(session);
  }

  async getById(
    userId: string,
    sessionId: string,
    authorization?: string | null
  ) {
    await this.requirePremium(authorization);
    const found = await VirtualContestSession.findById(sessionId);
    if (!found) throw new NotFoundError("Virtual contest session not found");
    this.assertOwner(found, userId);
    const session = await this.applyTimeoutIfNeeded(found);
    return publicSession(session);
  }

  async complete(
    userId: string,
    sessionId: string,
    authorization?: string | null
  ) {
    await this.requirePremium(authorization);
    const found = await VirtualContestSession.findById(sessionId);
    if (!found) throw new NotFoundError("Virtual contest session not found");
    this.assertOwner(found, userId);
    const session = await this.applyTimeoutIfNeeded(found);
    if (session.status !== "in_progress") {
      return publicSession(session);
    }
    session.status = "completed";
    session.completedAt = new Date();
    session.report = buildReport(session);
    await session.save();
    return publicSession(session);
  }

  async abandon(
    userId: string,
    sessionId: string,
    authorization?: string | null
  ) {
    await this.requirePremium(authorization);
    const session = await VirtualContestSession.findById(sessionId);
    if (!session) throw new NotFoundError("Virtual contest session not found");
    this.assertOwner(session, userId);
    if (session.status !== "in_progress") {
      return publicSession(session);
    }
    session.status = "abandoned";
    session.completedAt = new Date();
    session.report = buildReport(session);
    await session.save();
    return publicSession(session);
  }

  async assertAllowsSubmission(
    sessionId: string,
    userId?: string,
    problemId?: string
  ) {
    const found = await VirtualContestSession.findById(sessionId);
    if (!found) throw new NotFoundError("Virtual contest session not found");
    const session = await this.applyTimeoutIfNeeded(found);
    if (session.status !== "in_progress") {
      throw new BadRequestError(
        `Virtual contest is not accepting submissions (status=${session.status})`
      );
    }
    const uid = String(userId || "").trim();
    if (!uid) {
      throw new BadRequestError("userId is required for virtual contest submissions");
    }
    if (session.userId !== uid) {
      throw new ForbiddenError("Submission user does not own this session");
    }
    const now = new Date();
    if (now > session.endsAt) {
      throw new BadRequestError("Virtual contest timer has ended");
    }
    const pid = String(problemId || "").trim();
    if (pid && !session.problemIds.map(String).includes(pid)) {
      throw new BadRequestError("Problem is not part of this virtual contest");
    }
    return { allowed: true, problemIds: session.problemIds, endsAt: session.endsAt };
  }

  async recordSubmission(input: {
    sessionId: string;
    submissionId: string;
    userId: string;
    problemId: string;
    status: string;
    testCasesPassed?: number;
    totalTestCases?: number;
  }) {
    const found = await VirtualContestSession.findById(input.sessionId);
    if (!found) throw new NotFoundError("Virtual contest session not found");
    const live = await this.applyTimeoutIfNeeded(found);
    if (live.userId !== String(input.userId)) {
      throw new ForbiddenError("Submission user mismatch");
    }
    if (!live.problemIds.map(String).includes(String(input.problemId))) {
      throw new BadRequestError("Problem not in this virtual contest");
    }
    if (live.status !== "in_progress") {
      return publicSession(live);
    }

    const solved = String(input.status).toUpperCase() === "ACCEPTED";
    live.attempts.push({
      problemId: String(input.problemId),
      submissionId: String(input.submissionId),
      status: String(input.status),
      solved,
      testCasesPassed: input.testCasesPassed,
      totalTestCases: input.totalTestCases,
      at: new Date(),
    });
    await live.save();
    return publicSession(live);
  }

  /** Premium analytics for a finished or active session. */
  async analytics(
    userId: string,
    sessionId: string,
    authorization?: string | null
  ) {
    await this.requirePremium(authorization);
    const found = await VirtualContestSession.findById(sessionId);
    if (!found) throw new NotFoundError("Virtual contest session not found");
    this.assertOwner(found, userId);
    const live = await this.applyTimeoutIfNeeded(found);
    const report = live.report || buildReport(live);
    return {
      session: publicSession(live),
      breakdown: {
        solvedCount: report.solvedCount,
        attemptedCount: report.attemptedCount,
        unsolvedCount: Math.max(
          0,
          (live.problemIds || []).length - report.solvedCount
        ),
        mode: live.mode,
        ratingImpact: "none",
      },
      recommendations: report.recommendations,
    };
  }
}

export const virtualContestService = new VirtualContestService();
