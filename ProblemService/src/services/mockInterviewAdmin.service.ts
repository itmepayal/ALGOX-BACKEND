/**
 * Admin metrics for MockInterviewSession — real Mongo aggregations only.
 */
import { MockInterviewSession } from "../models/mockInterviewSession.model";

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export async function getMockInterviewAdminOverview() {
  const [
    total,
    completed,
    inProgress,
    timedOut,
    abandoned,
    uniqueUsers,
    byCompany,
    byDifficulty,
    byStatus,
    scoreSamples,
    durationSamples,
    recent,
  ] = await Promise.all([
    MockInterviewSession.countDocuments({}),
    MockInterviewSession.countDocuments({ status: "completed" }),
    MockInterviewSession.countDocuments({ status: "in_progress" }),
    MockInterviewSession.countDocuments({ status: "timed_out" }),
    MockInterviewSession.countDocuments({ status: "abandoned" }),
    MockInterviewSession.distinct("userId").then((ids) => ids.length),
    MockInterviewSession.aggregate([
      {
        $group: {
          _id: { $ifNull: ["$config.company", "Generic"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
    MockInterviewSession.aggregate([
      {
        $group: {
          _id: "$config.difficulty",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
    MockInterviewSession.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    MockInterviewSession.find({
      "report.overallScore": { $ne: null },
      status: { $in: ["completed", "timed_out"] },
    })
      .select("report.overallScore")
      .lean()
      .limit(5000),
    MockInterviewSession.find({
      completedAt: { $exists: true },
      startedAt: { $exists: true },
      status: { $in: ["completed", "timed_out", "abandoned"] },
    })
      .select("startedAt completedAt")
      .lean()
      .limit(5000),
    MockInterviewSession.find({})
      .sort({ createdAt: -1 })
      .limit(40)
      .select(
        "userId config status startedAt endsAt completedAt problemIds report.overallScore report.problemsAccepted report.problemsTotal"
      )
      .lean(),
  ]);

  const overallScores = scoreSamples
    .map((r) => (r.report as { overallScore?: number | null } | undefined)?.overallScore)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));

  const completionMs = durationSamples
    .map((r) => {
      if (!r.startedAt || !r.completedAt) return null;
      const ms =
        new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime();
      return ms > 0 ? ms : null;
    })
    .filter((n): n is number => n != null);

  return {
    generatedAt: new Date().toISOString(),
    overview: {
      total,
      completed,
      inProgress,
      timedOut,
      abandoned,
      uniqueUsers,
      averageOverallScore: avg(overallScores),
      averageCompletionMs: avg(completionMs),
    },
    byCompany: byCompany.map((r) => ({
      company: String(r._id || "Generic"),
      count: Number(r.count || 0),
    })),
    byDifficulty: byDifficulty.map((r) => ({
      difficulty: String(r._id || "unknown"),
      count: Number(r.count || 0),
    })),
    byStatus: byStatus.map((r) => ({
      status: String(r._id || "unknown"),
      count: Number(r.count || 0),
    })),
    recent: recent.map((r) => ({
      id: String(r._id),
      userId: r.userId,
      company: r.config?.company || "Generic",
      role: r.config?.role || null,
      difficulty: r.config?.difficulty,
      language: r.config?.language,
      durationMinutes: r.config?.durationMinutes,
      status: r.status,
      startedAt: r.startedAt,
      completedAt: r.completedAt || null,
      endsAt: r.endsAt,
      problemsTotal: r.problemIds?.length || 0,
      overallScore:
        (r.report as { overallScore?: number | null } | undefined)?.overallScore ??
        null,
      problemsAccepted:
        (r.report as { problemsAccepted?: number } | undefined)?.problemsAccepted ??
        null,
    })),
    note: "All metrics from MockInterviewSession documents — no invented values",
  };
}

export async function getMockInterviewAdminDetail(sessionId: string) {
  const doc = await MockInterviewSession.findById(sessionId).lean();
  if (!doc) return null;
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
    report: doc.report || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
