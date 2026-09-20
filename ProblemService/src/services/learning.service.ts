import crypto from "crypto";
import {
  UserLearningGoals,
  type IDailyGoalConfig,
} from "../models/userLearningGoals.model";
import { UserDailyPlan } from "../models/userDailyPlan.model";
import { UserStudySession } from "../models/userStudySession.model";
import { BadRequestError, ConflictError } from "../utils/errors/app.error";
import type {
  DailyGoalsDto,
  DailyPlanDto,
} from "../validators/learning.validator";

const DEFAULT_GOALS: IDailyGoalConfig = {
  problemsPerDay: 8,
  studyMinutes: 120,
  revisionTopics: 1,
  sessionsPerDay: 1,
};

function newClientId(): string {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function sessionDto(doc: InstanceType<typeof UserStudySession>) {
  return {
    id: doc.clientId,
    topic: doc.topic,
    status: doc.status,
    startedAt: doc.startedAt,
    segmentStartedAt: doc.segmentStartedAt,
    accumulatedMs: doc.accumulatedMs,
    endedAt: doc.endedAt,
    attemptedProblemIds: doc.attemptedProblemIds || [],
    solvedProblemIds: doc.solvedProblemIds || [],
    updatedAt: doc.updatedAtMs,
  };
}

function activeMs(
  session: {
    status: string;
    accumulatedMs: number;
    segmentStartedAt: number | null;
  },
  now = Date.now()
): number {
  if (session.status === "running" && session.segmentStartedAt != null) {
    return Math.max(
      0,
      session.accumulatedMs + (now - session.segmentStartedAt)
    );
  }
  return Math.max(0, session.accumulatedMs);
}

export class LearningService {
  async getGoals(userId: string): Promise<IDailyGoalConfig> {
    const doc = await UserLearningGoals.findOne({ userId }).lean();
    if (!doc?.goals) return { ...DEFAULT_GOALS };
    return { ...DEFAULT_GOALS, ...doc.goals };
  }

  async putGoals(userId: string, goals: DailyGoalsDto): Promise<IDailyGoalConfig> {
    const doc = await UserLearningGoals.findOneAndUpdate(
      { userId },
      { $set: { goals } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    ).lean();
    return { ...DEFAULT_GOALS, ...(doc?.goals || goals) };
  }

  async getPlan(userId: string, dateKey: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new BadRequestError("Invalid date key (expected YYYY-MM-DD)");
    }
    const doc = await UserDailyPlan.findOne({ userId, date: dateKey }).lean();
    if (!doc) {
      return {
        date: dateKey,
        tasks: [] as DailyPlanDto["tasks"],
        updatedAt: Date.now(),
      };
    }
    return {
      date: doc.date,
      tasks: doc.tasks || [],
      notes: doc.notes,
      updatedAt: doc.updatedAtMs || Date.now(),
    };
  }

  /** Inclusive date range (max 62 days) for calendar enrichment — one query. */
  async listPlansInRange(userId: string, from: string, to: string) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      from > to
    ) {
      throw new BadRequestError("Invalid date range");
    }
    const rows = await UserDailyPlan.find({
      userId,
      date: { $gte: from, $lte: to },
    })
      .select("date tasks notes updatedAtMs")
      .lean();
    return rows.map((doc) => ({
      date: doc.date,
      tasks: doc.tasks || [],
      notes: doc.notes,
      updatedAt: doc.updatedAtMs || Date.now(),
    }));
  }

  async putPlan(userId: string, plan: DailyPlanDto) {
    const updatedAtMs = Date.now();
    const doc = await UserDailyPlan.findOneAndUpdate(
      { userId, date: plan.date },
      {
        $set: {
          tasks: plan.tasks,
          notes: plan.notes,
          updatedAtMs,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    return {
      date: doc.date,
      tasks: doc.tasks || [],
      notes: doc.notes,
      updatedAt: doc.updatedAtMs,
    };
  }

  async listSessions(userId: string, opts?: { limit?: number }) {
    const limit = Math.min(Math.max(opts?.limit || 100, 1), 200);
    const rows = await UserStudySession.find({
      userId,
      status: "completed",
    })
      .sort({ endedAt: -1, updatedAtMs: -1 })
      .limit(limit);
    return rows.map(sessionDto);
  }

  async getActiveSession(userId: string) {
    const doc = await UserStudySession.findOne({
      userId,
      status: { $in: ["running", "paused"] },
    });
    return doc ? sessionDto(doc) : null;
  }

  async startSession(userId: string, topic: string) {
    const existing = await UserStudySession.findOne({
      userId,
      status: { $in: ["running", "paused"] },
    });
    if (existing) return sessionDto(existing);

    const now = Date.now();
    try {
      const doc = await UserStudySession.create({
        userId,
        clientId: newClientId(),
        topic: topic || "General",
        status: "running",
        startedAt: now,
        segmentStartedAt: now,
        accumulatedMs: 0,
        attemptedProblemIds: [],
        solvedProblemIds: [],
        updatedAtMs: now,
      });
      return sessionDto(doc);
    } catch (err: any) {
      if (err?.code === 11000) {
        const again = await UserStudySession.findOne({
          userId,
          status: { $in: ["running", "paused"] },
        });
        if (again) return sessionDto(again);
        throw new ConflictError("Could not start study session");
      }
      throw err;
    }
  }

  async pauseSession(userId: string) {
    const doc = await UserStudySession.findOne({
      userId,
      status: "running",
    });
    if (!doc) {
      return this.getActiveSession(userId);
    }
    const now = Date.now();
    // Fold the live segment BEFORE changing status — activeMs() only
    // adds (now - segmentStartedAt) while status is still "running".
    const nextAccumulated = activeMs(doc, now);
    doc.status = "paused";
    doc.accumulatedMs = nextAccumulated;
    doc.segmentStartedAt = null;
    doc.updatedAtMs = now;
    await doc.save();
    return sessionDto(doc);
  }

  async resumeSession(userId: string) {
    const doc = await UserStudySession.findOne({
      userId,
      status: "paused",
    });
    if (!doc) {
      return this.getActiveSession(userId);
    }
    const now = Date.now();
    doc.status = "running";
    doc.segmentStartedAt = now;
    doc.updatedAtMs = now;
    await doc.save();
    return sessionDto(doc);
  }

  async endSession(userId: string) {
    const doc = await UserStudySession.findOne({
      userId,
      status: { $in: ["running", "paused"] },
    });
    if (!doc) return null;
    const now = Date.now();
    // Capture duration while status is still running/paused, then finalize.
    const nextAccumulated = activeMs(doc, now);
    doc.status = "completed";
    doc.accumulatedMs = nextAccumulated;
    doc.segmentStartedAt = null;
    doc.endedAt = now;
    doc.updatedAtMs = now;
    await doc.save();
    return sessionDto(doc);
  }

  async recordActivity(
    userId: string,
    problemId: string,
    solved: boolean
  ) {
    const doc = await UserStudySession.findOne({
      userId,
      status: { $in: ["running", "paused"] },
    });
    if (!doc) return null;
    const attempted = new Set(doc.attemptedProblemIds || []);
    const solvedSet = new Set(doc.solvedProblemIds || []);
    attempted.add(problemId);
    if (solved) solvedSet.add(problemId);
    doc.attemptedProblemIds = [...attempted];
    doc.solvedProblemIds = [...solvedSet];
    doc.updatedAtMs = Date.now();
    await doc.save();
    return sessionDto(doc);
  }
}

export const learningService = new LearningService();
