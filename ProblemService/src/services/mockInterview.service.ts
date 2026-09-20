import axios from "axios";
import {
  MockInterviewSession,
  type IMockInterviewProblemAttempt,
} from "../models/mockInterviewSession.model";
import { Problem } from "../models/problem.model";
import { serverConfig } from "../config";
import {
  MOCK_INTERVIEW_FEATURE,
  getMockInterviewPublicConfig,
} from "../config/mockInterview.config";
import {
  resolveEntitlements,
  hasFeature,
} from "../utils/entitlementClient";
import { PremiumRequiredError } from "../utils/problemAccess";
import { buildMockInterviewReport } from "../utils/mockInterviewReport";
import type { StartMockInterviewDto } from "../validators/mockInterview.validator";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors/app.error";

const FEATURE = MOCK_INTERVIEW_FEATURE;

type SessionDoc = any;

function publicSession(doc: SessionDoc, now = new Date()) {
  const remainingMs = Math.max(0, doc.endsAt.getTime() - now.getTime());
  return {
    id: String(doc._id),
    userId: doc.userId,
    config: doc.config,
    status: doc.status,
    problemIds: doc.problemIds,
    attempts: doc.attempts,
    startedAt: doc.startedAt,
    endsAt: doc.endsAt,
    completedAt: doc.completedAt || null,
    remainingMs,
    serverNow: now.toISOString(),
    report: doc.report || null,
  };
}

export class MockInterviewService {
  getPublicConfig() {
    return getMockInterviewPublicConfig();
  }

  private async requirePremium(authorization?: string | null) {
    const snap = await resolveEntitlements(authorization);
    if (!hasFeature(snap, FEATURE)) {
      throw new PremiumRequiredError(
        "Mock interviews require an active Premium subscription.",
        { feature: FEATURE, accessTier: snap.accessTier }
      );
    }
  }

  private assertOwner(session: SessionDoc, userId: string) {
    if (session.userId !== userId) {
      throw new ForbiddenError("Unauthorized session access");
    }
  }

  /**
   * Apply server timeout if window elapsed. Client cannot extend endsAt.
   */
  async applyTimeoutIfNeeded(session: SessionDoc): Promise<SessionDoc> {
    if (session.status !== "in_progress") return session;
    const now = new Date();
    if (now <= session.endsAt) return session;

    session.status = "timed_out";
    session.completedAt = session.endsAt;
    session.report = buildMockInterviewReport({
      status: "timed_out",
      durationMinutes: session.config.durationMinutes,
      startedAt: session.startedAt,
      endsAt: session.endsAt,
      completedAt: session.completedAt,
      attempts: session.attempts || [],
      problemIds: session.problemIds,
    });
    await session.save();
    return session;
  }

  /**
   * Deterministic problem selection:
   * 1) Prefer published problems tagged with company (when company set and not Generic)
   * 2) Filter by difficulty + topics
   * 3) Fall back to any published set
   * Once stored on the session, the set never re-rolls on refresh.
   */
  private async selectProblems(cfg: StartMockInterviewDto) {
    const want = cfg.problemCount;
    const company = (cfg.company || "").trim();
    const useCompany =
      company.length > 0 && !/^generic$/i.test(company);

    const baseFilter: Record<string, unknown> = { status: "published" };
    if (cfg.difficulty !== "mixed") {
      baseFilter.difficulty = cfg.difficulty;
    }
    if (cfg.topics?.length) {
      baseFilter.$or = [
        { tags: { $in: cfg.topics.map((t) => new RegExp(`^${escapeRe(t)}$`, "i")) } },
        { category: { $in: cfg.topics.map((t) => new RegExp(`^${escapeRe(t)}$`, "i")) } },
      ];
    }

    const select = "_id slug title difficulty category tags";
    let pool: Array<{
      _id: unknown;
      slug?: string;
      title?: string;
      difficulty?: string;
      category?: string;
      tags?: string[];
    }> = [];

    if (useCompany) {
      // Prefer company-tagged published problems (difficulty when not mixed)
      const companyOnly: Record<string, unknown> = {
        status: "published",
        tags: { $elemMatch: { $regex: new RegExp(`^${escapeRe(company)}$`, "i") } },
      };
      if (cfg.difficulty !== "mixed") companyOnly.difficulty = cfg.difficulty;
      pool = await Problem.find(companyOnly).select(select).limit(80).lean();
    }

    if (pool.length < want) {
      const broader = await Problem.find(baseFilter).select(select).limit(80).lean();
      pool = mergeUniqueProblems(pool, broader);
    }

    if (pool.length < want) {
      const anyPublished = await Problem.find({ status: "published" })
        .select(select)
        .limit(80)
        .lean();
      pool = mergeUniqueProblems(pool, anyPublished);
    }

    if (!pool.length) {
      throw new NotFoundError("No published problems available for mock interview");
    }

    // Deterministic shuffle: config + minute bucket (variety without client control)
    const seed = hashStr(
      `${cfg.language}|${cfg.difficulty}|${cfg.interviewType || "coding"}|${company}|${(cfg.topics || []).join(",")}|${Math.floor(Date.now() / 60_000)}`
    );
    const shuffled = [...pool].sort(
      (a, b) => hashStr(String(a._id) + seed) - hashStr(String(b._id) + seed)
    );
    // Deduplicate by id
    const seen = new Set<string>();
    const unique = shuffled.filter((p) => {
      const id = String(p._id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return unique.slice(0, want);
  }

  async start(userId: string, body: StartMockInterviewDto, authorization?: string | null) {
    await this.requirePremium(authorization);

    const existing = await MockInterviewSession.findOne({
      userId,
      status: "in_progress",
    });
    if (existing) {
      const live = await this.applyTimeoutIfNeeded(existing);
      if (live.status === "in_progress") {
        throw new ConflictError(
          "An active mock interview already exists; resume or complete it first",
          { sessionId: String(live._id) }
        );
      }
    }

    const picked = await this.selectProblems(body);
    const now = new Date();
    const endsAt = new Date(now.getTime() + body.durationMinutes * 60_000);

    const attempts: IMockInterviewProblemAttempt[] = picked.map((p, i) => ({
      problemId: String(p._id),
      problemSlug: p.slug,
      title: p.title,
      difficulty: p.difficulty,
      order: i,
      attemptCount: 0,
    }));

    try {
      const session = await MockInterviewSession.create({
        userId,
        config: {
          company: body.company,
          role: body.role,
          interviewType: body.interviewType || "coding",
          difficulty: body.difficulty,
          durationMinutes: body.durationMinutes,
          language: body.language,
          topics: body.topics || [],
          problemCount: body.problemCount,
        },
        status: "in_progress",
        problemIds: picked.map((p) => String(p._id)),
        attempts,
        startedAt: now,
        endsAt,
      });
      return publicSession(session, now);
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictError("An active mock interview already exists");
      }
      throw err;
    }
  }

  async getActive(userId: string, authorization?: string | null) {
    await this.requirePremium(authorization);
    const found = await MockInterviewSession.findOne({
      userId,
      status: "in_progress",
    });
    if (!found) return null;
    const session = await this.applyTimeoutIfNeeded(found as SessionDoc);
    if (session.status !== "in_progress") return null;
    return publicSession(session);
  }

  async getById(sessionId: string, userId: string, authorization?: string | null) {
    await this.requirePremium(authorization);
    const found = await MockInterviewSession.findById(sessionId);
    if (!found) throw new NotFoundError("Mock interview session not found");
    this.assertOwner(found as SessionDoc, userId);
    const session = await this.applyTimeoutIfNeeded(found as SessionDoc);
    return publicSession(session);
  }

  async listMine(userId: string, authorization?: string | null, limit = 20) {
    await this.requirePremium(authorization);
    const rows = await MockInterviewSession.find({ userId })
      .sort({ createdAt: -1 })
      .limit(Math.min(50, limit))
      .lean();
    return rows.map((r) => ({
      id: String(r._id),
      status: r.status,
      config: r.config,
      startedAt: r.startedAt,
      endsAt: r.endsAt,
      completedAt: r.completedAt || null,
      problemsTotal: r.problemIds?.length || 0,
      hasReport: Boolean(r.report),
      overallScore:
        (r.report as { overallScore?: number | null } | undefined)?.overallScore ??
        null,
      problemsAccepted:
        (r.report as { problemsAccepted?: number } | undefined)?.problemsAccepted ??
        null,
    }));
  }

  /**
   * Attach a judged submission to the session.
   * Verifies ownership + problem membership + window via SubmissionService fetch.
   * Client cannot forge judge fields — we read them from SubmissionService.
   */
  async attachSubmission(
    sessionId: string,
    userId: string,
    problemId: string,
    submissionId: string,
    authorization?: string | null
  ) {
    await this.requirePremium(authorization);
    const found = await MockInterviewSession.findById(sessionId);
    if (!found) throw new NotFoundError("Mock interview session not found");
    this.assertOwner(found as SessionDoc, userId);
    let session = await this.applyTimeoutIfNeeded(found as SessionDoc);

    if (session.status !== "in_progress") {
      throw new ConflictError(`Session is ${session.status}; submissions closed`, {
        code: "INTERVIEW_CLOSED",
        status: session.status,
      });
    }
    if (!this.sessionHasProblem(session, problemId)) {
      throw new BadRequestError("Problem is not part of this interview");
    }

    const sub = await this.fetchSubmission(submissionId, authorization);
    if (!sub) throw new NotFoundError("Submission not found");
    if (String(sub.userId) !== userId) {
      throw new ForbiddenError("Submission does not belong to you");
    }
    if (String(sub.problemId) !== String(problemId)) {
      throw new BadRequestError("Submission problem mismatch");
    }
    if (sub.source === "run") {
      throw new BadRequestError("Run attempts do not count; use official submit");
    }

    // Prefer submissions already bound to this session (workspace submit).
    // Otherwise enforce configured interview language for manual attaches.
    const subSessionId = sub.mockInterviewSessionId
      ? String(sub.mockInterviewSessionId)
      : "";
    const boundToSession = subSessionId && subSessionId === String(sessionId);
    if (
      !boundToSession &&
      sub.language &&
      session.config?.language &&
      String(sub.language).toLowerCase() !==
        String(session.config.language).toLowerCase()
    ) {
      throw new BadRequestError(
        `Submission language ${sub.language} does not match interview language ${session.config.language}`
      );
    }

    const now = new Date();
    if (now > session.endsAt) {
      await this.applyTimeoutIfNeeded(session);
      throw new ConflictError("Interview timer has expired", {
        code: "INTERVIEW_EXPIRED",
      });
    }

    return this.upsertAttempt(session, {
      problemId: String(problemId),
      submissionId: String(submissionId),
      status: String(sub.status || "PENDING"),
      testCasesPassed: num(sub.testCasesPassed),
      totalTestCases: num(sub.totalTestCases),
      executionTimeMs: num(sub.executionTime ?? sub.executionTimeMs),
      memoryMb: num(sub.memory ?? sub.memoryMb),
      language: sub.language ? String(sub.language) : session.config.language,
      submittedAt: now,
      source: "submit",
    });
  }

  /** Internal: Evaluation/Submission callback with real judge fields. */
  async recordInternal(sessionId: string, payload: {
    submissionId: string;
    userId: string;
    problemId: string;
    status: string;
    testCasesPassed?: number;
    totalTestCases?: number;
    executionTimeMs?: number;
    memoryMb?: number;
    language?: string;
    source?: string;
  }) {
    const found = await MockInterviewSession.findById(sessionId);
    if (!found) throw new NotFoundError("Mock interview session not found");
    if (found.userId !== payload.userId) {
      throw new ForbiddenError("Unauthorized session access");
    }
    const session = await this.applyTimeoutIfNeeded(found as SessionDoc);

    if (!this.sessionHasProblem(session, payload.problemId)) {
      throw new BadRequestError("Problem is not part of this interview");
    }
    if (payload.source === "run") {
      throw new BadRequestError("Run attempts do not count");
    }

    return this.upsertAttempt(session, {
      problemId: String(payload.problemId),
      submissionId: String(payload.submissionId),
      status: String(payload.status),
      testCasesPassed: payload.testCasesPassed,
      totalTestCases: payload.totalTestCases,
      executionTimeMs: payload.executionTimeMs,
      memoryMb: payload.memoryMb,
      language: payload.language || session.config.language,
      submittedAt: new Date(),
      source: "submit",
    });
  }

  async assertAllowsSubmission(sessionId: string, userId?: string) {
    const found = await MockInterviewSession.findById(sessionId);
    if (!found) throw new NotFoundError("Mock interview session not found");
    if (userId && found.userId !== userId) {
      throw new ForbiddenError("Unauthorized session access");
    }
    const session = await this.applyTimeoutIfNeeded(found as SessionDoc);
    if (session.status !== "in_progress") {
      throw new ConflictError(
        `Mock interview is not accepting submissions (status=${session.status})`,
        { code: "INTERVIEW_CLOSED", status: session.status }
      );
    }
    const now = new Date();
    if (now > session.endsAt) {
      throw new ConflictError("Mock interview submission window has ended", {
        code: "INTERVIEW_EXPIRED",
      });
    }
    return { ok: true, endsAt: session.endsAt, remainingMs: session.endsAt.getTime() - now.getTime() };
  }

  async complete(sessionId: string, userId: string, authorization?: string | null) {
    await this.requirePremium(authorization);
    const found = await MockInterviewSession.findById(sessionId);
    if (!found) throw new NotFoundError("Mock interview session not found");
    this.assertOwner(found as SessionDoc, userId);
    const session = await this.applyTimeoutIfNeeded(found as SessionDoc);

    // Idempotent: already finished states return current snapshot
    if (session.status === "timed_out" || session.status === "completed") {
      return publicSession(session);
    }
    if (session.status !== "in_progress") {
      throw new ConflictError(`Cannot complete session in status ${session.status}`, {
        code: "INTERVIEW_CLOSED",
        status: session.status,
      });
    }

    const now = new Date();
    session.status = "completed";
    session.completedAt = now;
    session.report = buildMockInterviewReport({
      status: "completed",
      durationMinutes: session.config.durationMinutes,
      startedAt: session.startedAt,
      endsAt: session.endsAt,
      completedAt: now,
      attempts: session.attempts || [],
      problemIds: session.problemIds,
    });
    await session.save();
    return publicSession(session);
  }

  async getReport(sessionId: string, userId: string, authorization?: string | null) {
    await this.requirePremium(authorization);
    const found = await MockInterviewSession.findById(sessionId);
    if (!found) throw new NotFoundError("Mock interview session not found");
    this.assertOwner(found as SessionDoc, userId);
    const session = await this.applyTimeoutIfNeeded(found as SessionDoc);

    if (!session.report) {
      if (session.status === "in_progress") {
        throw new BadRequestError("Report available after complete or timeout");
      }
      session.report = buildMockInterviewReport({
        status: session.status,
        durationMinutes: session.config.durationMinutes,
        startedAt: session.startedAt,
        endsAt: session.endsAt,
        completedAt: session.completedAt || new Date(),
        attempts: session.attempts || [],
        problemIds: session.problemIds,
      });
      await session.save();
    }
    return {
      sessionId: String(session._id),
      status: session.status,
      config: session.config,
      report: session.report,
      remainingMs: Math.max(0, session.endsAt.getTime() - Date.now()),
    };
  }

  async abandon(sessionId: string, userId: string, authorization?: string | null) {
    await this.requirePremium(authorization);
    const found = await MockInterviewSession.findById(sessionId);
    if (!found) throw new NotFoundError("Mock interview session not found");
    this.assertOwner(found as SessionDoc, userId);
    const session = await this.applyTimeoutIfNeeded(found as SessionDoc);
    // Idempotent abandon
    if (session.status !== "in_progress") {
      return publicSession(session);
    }
    session.status = "abandoned";
    session.completedAt = new Date();
    session.report = buildMockInterviewReport({
      status: "abandoned",
      durationMinutes: session.config.durationMinutes,
      startedAt: session.startedAt,
      endsAt: session.endsAt,
      completedAt: session.completedAt,
      attempts: session.attempts || [],
      problemIds: session.problemIds,
    });
    await session.save();
    return publicSession(session);
  }

  private sessionHasProblem(session: SessionDoc, problemId: string): boolean {
    const want = String(problemId);
    return (session.problemIds || []).some((id: unknown) => String(id) === want);
  }

  private async upsertAttempt(
    session: SessionDoc,
    patch: Partial<IMockInterviewProblemAttempt> & { problemId: string; submissionId?: string }
  ) {
    const attempts = [...(session.attempts || [])];
    const want = String(patch.problemId);
    const idx = attempts.findIndex(
      (a: IMockInterviewProblemAttempt) => String(a.problemId) === want
    );
    if (idx >= 0) {
      const prev = attempts[idx];
      const isNewSubmission =
        patch.submissionId &&
        String(patch.submissionId) !== String(prev.submissionId || "");
      const nextCount = isNewSubmission
        ? (typeof prev.attemptCount === "number" ? prev.attemptCount : 0) + 1
        : typeof prev.attemptCount === "number"
          ? prev.attemptCount
          : patch.submissionId
            ? 1
            : 0;
      attempts[idx] = {
        ...prev,
        ...patch,
        order: prev.order,
        attemptCount: nextCount || (patch.submissionId ? 1 : prev.attemptCount || 0),
      };
    } else {
      attempts.push({
        order: attempts.length,
        attemptCount: patch.submissionId ? 1 : 0,
        ...patch,
      } as IMockInterviewProblemAttempt);
    }
    session.attempts = attempts;
    await session.save();
    return publicSession(session);
  }

  private async fetchSubmission(
    submissionId: string,
    authorization?: string | null
  ): Promise<any | null> {
    const base = String(serverConfig.SUBMISSION_SERVICE_URL || "").replace(/\/$/, "");
    try {
      const res = await axios.get(`${base}/api/v1/submissions/${submissionId}`, {
        headers: authorization ? { Authorization: authorization } : {},
        timeout: 8000,
        validateStatus: () => true,
      });
      if (res.status !== 200) return null;
      return res.data?.data || res.data || null;
    } catch {
      return null;
    }
  }
}

function mergeUniqueProblems<T extends { _id: unknown }>(a: T[], b: T[]): T[] {
  const seen = new Set(a.map((p) => String(p._id)));
  const out = [...a];
  for (const p of b) {
    const id = String(p._id);
    if (!seen.has(id)) {
      seen.add(id);
      out.push(p);
    }
  }
  return out;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

export const mockInterviewService = new MockInterviewService();
