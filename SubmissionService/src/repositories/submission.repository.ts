import { Types } from "mongoose";
import { Submission, ISubmission, SubmissionStatus } from "../models/submission.model";

export interface ISubmissionRepository {
  createSubmission(data: Partial<ISubmission>): Promise<ISubmission>;
  getSubmissionById(id: string): Promise<ISubmission | null>;
  getAllSubmissions(
    page: number,
    limit: number
  ): Promise<{
    submissions: ISubmission[];
    total: number;
    page: number;
    totalPages: number;
  }>;
  updateSubmission(
    id: string,
    data: Partial<ISubmission>
  ): Promise<ISubmission | null>;
  deleteSubmission(id: string): Promise<boolean>;
  getByProblemId(problemId: string): Promise<ISubmission[]>;
  getByUserId(userId: string): Promise<ISubmission[]>;
  getImportSourceByUserId(userId: string): Promise<
    Array<{
      problemId: string;
      status: string;
      source?: string;
      executionTime?: number;
      memory?: number;
      createdAt: Date;
      updatedAt: Date;
    }>
  >;
  getByStatus(status: SubmissionStatus): Promise<ISubmission[]>;
  getByLanguage(language: string): Promise<ISubmission[]>;
  searchSubmissions(query: string): Promise<ISubmission[]>;
  adminList(filters: {
    page?: number;
    limit?: number;
    status?: string;
    statuses?: string;
    language?: string;
    problemId?: string;
    userId?: string;
    from?: string;
    to?: string;
    source?: string;
    search?: string;
  }): Promise<{
    submissions: ISubmission[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  internalStats(rangeDays?: number): Promise<Record<string, unknown>>;
  problemStats(problemId: string, rangeDays?: number): Promise<Record<string, unknown>>;
  countActiveByUser(userId: string): Promise<number>;
  countInLastHourByUser(
    userId: string,
    source: "run" | "submit"
  ): Promise<number>;
  userSubmissionAnalytics(filters: {
    userId: string;
    from?: Date;
    to?: Date;
    status?: string;
    language?: string;
    source?: string;
    page?: number;
    limit?: number;
  }): Promise<Record<string, unknown>>;
}

export class SubmissionRepository implements ISubmissionRepository {
  async createSubmission(data: Partial<ISubmission>): Promise<ISubmission> {
    return await Submission.create(data);
  }

  async getSubmissionById(id: string): Promise<ISubmission | null> {
    return await Submission.findById(id);
  }

  async getAllSubmissions(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [submissions, total] = await Promise.all([
      Submission.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Submission.countDocuments(),
    ]);

    return {
      submissions,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateSubmission(
    id: string,
    data: Partial<ISubmission>
  ): Promise<ISubmission | null> {
    return await Submission.findByIdAndUpdate(id, data, { returnDocument: "after" });
  }

  async deleteSubmission(id: string): Promise<boolean> {
    const deleted = await Submission.findByIdAndDelete(id);
    return deleted !== null;
  }

  async getByProblemId(problemId: string): Promise<ISubmission[]> {
    return await Submission.find({ problemId }).sort({ createdAt: -1 });
  }

  async getByUserId(userId: string): Promise<ISubmission[]> {
    return await Submission.find({ userId }).sort({ createdAt: -1 });
  }

  /** Lean projection for progress import — no code/output payload. */
  async getImportSourceByUserId(userId: string): Promise<
    Array<{
      problemId: string;
      status: string;
      source?: string;
      executionTime?: number;
      memory?: number;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    const rows = await Submission.find({ userId })
      .select("problemId status source executionTime memory createdAt updatedAt")
      .sort({ createdAt: 1 })
      .lean();

    return rows.map((r) => ({
      problemId: String(r.problemId),
      status: r.status,
      source: r.source,
      executionTime: r.executionTime,
      memory: r.memory,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getByStatus(status: SubmissionStatus): Promise<ISubmission[]> {
    return await Submission.find({ status }).sort({ createdAt: -1 });
  }

  async getByLanguage(language: string): Promise<ISubmission[]> {
    return await Submission.find({ language }).sort({ createdAt: -1 });
  }

  async searchSubmissions(query: string): Promise<ISubmission[]> {
    return await Submission.find({
      $or: [
        { status: new RegExp(query, "i") },
        { language: new RegExp(query, "i") },
      ],
    }).sort({ createdAt: -1 });
  }

  async adminList(filters: {
    page?: number;
    limit?: number;
    status?: string;
    /** Comma-separated statuses, e.g. failed group */
    statuses?: string;
    language?: string;
    problemId?: string;
    userId?: string;
    from?: string;
    to?: string;
    source?: string;
    search?: string;
  }) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;
    const filter: any = {};

    if (filters.statuses?.trim()) {
      const list = filters.statuses
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length) filter.status = { $in: list };
    } else if (filters.status && filters.status !== "all") {
      filter.status = filters.status;
    }
    if (filters.language && filters.language !== "all") {
      filter.language = filters.language;
    }
    if (filters.problemId) filter.problemId = filters.problemId;
    if (filters.userId) filter.userId = filters.userId;
    if (filters.source && filters.source !== "all") filter.source = filters.source;
    if (filters.from || filters.to) {
      filter.createdAt = {};
      if (filters.from) filter.createdAt.$gte = new Date(filters.from);
      if (filters.to) filter.createdAt.$lte = new Date(filters.to);
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim();
      const or: any[] = [
        { language: new RegExp(q, "i") },
        { status: new RegExp(q, "i") },
      ];
      if (/^[a-f\d]{24}$/i.test(q)) {
        or.push({ problemId: q });
        or.push({ userId: q });
      }
      filter.$or = or;
    }

    const [submissions, total] = await Promise.all([
      Submission.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Submission.countDocuments(filter),
    ]);

    return {
      submissions,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async internalStats(rangeDays = 30): Promise<Record<string, unknown>> {
    const days = Math.min(Math.max(Number(rangeDays) || 30, 1), 366);
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const rangeStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const prevRangeStart = new Date(
      rangeStart.getTime() - days * 24 * 60 * 60 * 1000
    );

    const [
      total,
      today,
      accepted,
      byStatus,
      byLanguage,
      series,
      topProblemsAgg,
      activeUsers,
      avgMetrics,
      rangeTotal,
      rangeAccepted,
      uniqueSolved,
      prevRangeTotal,
      prevRangeAccepted,
    ] = await Promise.all([
      Submission.countDocuments({}),
      Submission.countDocuments({ createdAt: { $gte: startOfDay } }),
      Submission.countDocuments({ status: "ACCEPTED", source: { $ne: "run" } }),
      Submission.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Submission.aggregate([
        { $group: { _id: "$language", count: { $sum: 1 } } },
      ]),
      Submission.aggregate([
        { $match: { createdAt: { $gte: rangeStart } } },
        {
          $group: {
            _id: {
              date: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              status: "$status",
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.date": 1 } },
      ]),
      Submission.aggregate([
        { $match: { createdAt: { $gte: rangeStart } } },
        {
          $group: {
            _id: "$problemId",
            attempts: { $sum: 1 },
            accepted: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", "ACCEPTED"] },
                      { $ne: ["$source", "run"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { attempts: -1 } },
        { $limit: 25 },
      ]),
      Submission.aggregate([
        {
          $match: {
            createdAt: { $gte: rangeStart },
            userId: { $exists: true },
          },
        },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      Submission.aggregate([
        {
          $match: {
            createdAt: { $gte: rangeStart },
            status: {
              $in: [
                "ACCEPTED",
                "WRONG_ANSWER",
                "TIME_LIMIT_EXCEEDED",
                "MEMORY_LIMIT_EXCEEDED",
                "RUNTIME_ERROR",
              ],
            },
            executionTime: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            avgExecutionTime: { $avg: "$executionTime" },
            avgMemory: { $avg: "$memory" },
            samples: { $sum: 1 },
          },
        },
      ]),
      Submission.countDocuments({ createdAt: { $gte: rangeStart } }),
      Submission.countDocuments({
        createdAt: { $gte: rangeStart },
        status: "ACCEPTED",
        source: { $ne: "run" },
      }),
      Submission.aggregate([
        {
          $match: {
            status: "ACCEPTED",
            source: { $ne: "run" },
            problemId: { $exists: true },
          },
        },
        { $group: { _id: "$problemId" } },
        { $count: "count" },
      ]),
      Submission.countDocuments({
        createdAt: { $gte: prevRangeStart, $lt: rangeStart },
      }),
      Submission.countDocuments({
        createdAt: { $gte: prevRangeStart, $lt: rangeStart },
        status: "ACCEPTED",
        source: { $ne: "run" },
      }),
    ]);

    const statusMap: Record<string, number> = {};
    for (const s of byStatus) statusMap[s._id] = s.count;
    const languageMap: Record<string, number> = {};
    for (const s of byLanguage) languageMap[s._id || "unknown"] = s.count;

    const successRate =
      total > 0 ? Math.round((accepted / total) * 10000) / 100 : 0;
    const rangeSuccessRate =
      rangeTotal > 0
        ? Math.round((rangeAccepted / rangeTotal) * 10000) / 100
        : 0;
    const prevRangeSuccessRate =
      prevRangeTotal > 0
        ? Math.round((prevRangeAccepted / prevRangeTotal) * 10000) / 100
        : 0;

    let rangeSubmissionsTrendPct: number | null = null;
    if (prevRangeTotal > 0) {
      rangeSubmissionsTrendPct =
        Math.round(
          ((rangeTotal - prevRangeTotal) / prevRangeTotal) * 1000
        ) / 10;
    } else if (rangeTotal > 0) {
      rangeSubmissionsTrendPct = null;
    }

    let rangeAcceptedTrendPct: number | null = null;
    if (prevRangeAccepted > 0) {
      rangeAcceptedTrendPct =
        Math.round(
          ((rangeAccepted - prevRangeAccepted) / prevRangeAccepted) * 1000
        ) / 10;
    } else if (rangeAccepted > 0) {
      rangeAcceptedTrendPct = null;
    }

    let rangeSuccessRateTrendPct: number | null = null;
    if (prevRangeTotal > 0 && prevRangeSuccessRate != null) {
      rangeSuccessRateTrendPct =
        Math.round((rangeSuccessRate - prevRangeSuccessRate) * 10) / 10;
    }

    const avgRow = avgMetrics[0];
    const avgExecutionTime =
      avgRow?.avgExecutionTime != null
        ? Math.round(Number(avgRow.avgExecutionTime) * 100) / 100
        : null;
    const avgMemory =
      avgRow?.avgMemory != null
        ? Math.round(Number(avgRow.avgMemory) * 100) / 100
        : null;

    const topProblems = topProblemsAgg.map((r) => {
      const attempts = r.attempts || 0;
      const acceptedCount = r.accepted || 0;
      return {
        problemId: r._id?.toString?.() || r._id,
        count: attempts,
        attempts,
        accepted: acceptedCount,
        acceptanceRate:
          attempts > 0
            ? Math.round((acceptedCount / attempts) * 10000) / 100
            : 0,
      };
    });

    return {
      total,
      today,
      accepted,
      successRate,
      rangeTotal,
      rangeAccepted,
      rangeSuccessRate,
      prevRangeTotal,
      prevRangeAccepted,
      prevRangeSuccessRate,
      rangeSubmissionsTrendPct,
      rangeAcceptedTrendPct,
      rangeSuccessRateTrendPct,
      solvedProblems: uniqueSolved[0]?.count ?? 0,
      avgExecutionTime,
      avgMemory,
      byStatus: statusMap,
      byLanguage: languageMap,
      series: series.map((r) => ({
        date: r._id.date,
        status: r._id.status,
        count: r.count,
      })),
      topProblems,
      mostActiveUsers: activeUsers.map((r) => ({
        userId: r._id?.toString?.() || r._id,
        count: r.count,
      })),
      byDifficultyProxy: [],
    };
  }

  async problemStats(problemId: string, rangeDays = 30) {
    const days = Math.min(Math.max(Number(rangeDays) || 30, 1), 366);
    const rangeStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const pid = problemId;
    const base = {
      problemId: pid,
      source: { $ne: "run" },
    };
    const ranged = { ...base, createdAt: { $gte: rangeStart } };

    const FAIL = [
      "WRONG_ANSWER",
      "RUNTIME_ERROR",
      "TIME_LIMIT_EXCEEDED",
      "MEMORY_LIMIT_EXCEEDED",
      "COMPILATION_ERROR",
    ];

    const [
      totalAttempts,
      totalAccepted,
      failedCount,
      byStatus,
      byLanguage,
      series,
      avgMetrics,
      mostCommonFail,
    ] = await Promise.all([
      Submission.countDocuments(base),
      Submission.countDocuments({ ...base, status: "ACCEPTED" }),
      Submission.countDocuments({ ...base, status: { $in: FAIL } }),
      Submission.aggregate([
        { $match: base },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Submission.aggregate([
        { $match: base },
        { $group: { _id: "$language", count: { $sum: 1 } } },
      ]),
      Submission.aggregate([
        { $match: ranged },
        {
          $group: {
            _id: {
              date: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              status: "$status",
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.date": 1 } },
      ]),
      Submission.aggregate([
        {
          $match: {
            ...base,
            executionTime: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            avgExecutionTime: { $avg: "$executionTime" },
            avgMemory: { $avg: "$memory" },
          },
        },
      ]),
      Submission.aggregate([
        { $match: { ...base, status: { $in: FAIL } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 1 },
      ]),
    ]);

    const statusMap: Record<string, number> = {};
    for (const s of byStatus) statusMap[String(s._id)] = s.count;
    const languageMap: Record<string, number> = {};
    for (const s of byLanguage) languageMap[String(s._id || "unknown")] = s.count;

    const acceptanceRate =
      totalAttempts > 0
        ? Math.round((totalAccepted / totalAttempts) * 10000) / 100
        : 0;
    const avgRow = avgMetrics[0];

    return {
      problemId: pid,
      rangeDays: days,
      totalAttempts,
      totalAccepted,
      failedCount,
      acceptanceRate,
      solveRate: acceptanceRate,
      avgExecutionTime:
        avgRow?.avgExecutionTime != null
          ? Math.round(Number(avgRow.avgExecutionTime) * 100) / 100
          : null,
      avgMemory:
        avgRow?.avgMemory != null
          ? Math.round(Number(avgRow.avgMemory) * 100) / 100
          : null,
      byStatus: statusMap,
      byLanguage: languageMap,
      mostCommonFailureStatus: mostCommonFail[0]?._id || null,
      series: series.map((r) => ({
        date: r._id.date,
        status: r._id.status,
        count: r.count,
      })),
    };
  }

  async countActiveByUser(userId: string): Promise<number> {
    return Submission.countDocuments({
      userId,
      source: "submit",
      status: { $in: ["PENDING", "RUNNING"] },
    });
  }

  async countInLastHourByUser(
    userId: string,
    source: "run" | "submit"
  ): Promise<number> {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    return Submission.countDocuments({
      userId,
      source,
      createdAt: { $gte: since },
    });
  }

  /**
   * Per-user submission analytics — server aggregation only.
   * Never invents runtime/memory; averages only over docs where fields exist.
   * Uses userId+createdAt index; paginated lean rows (no code).
   */
  async userSubmissionAnalytics(filters: {
    userId: string;
    from?: Date;
    to?: Date;
    status?: string;
    language?: string;
    source?: string;
    page?: number;
    limit?: number;
  }): Promise<Record<string, unknown>> {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(filters.limit) || 20));
    const skip = (page - 1) * limit;

    // Aggregate $match does not cast strings → ObjectId; normalize for index use.
    const userObjectId = Types.ObjectId.isValid(filters.userId)
      ? new Types.ObjectId(filters.userId)
      : filters.userId;

    const match: Record<string, unknown> = {
      userId: userObjectId,
    };
    if (filters.from || filters.to) {
      const createdAt: Record<string, Date> = {};
      if (filters.from) createdAt.$gte = filters.from;
      if (filters.to) createdAt.$lte = filters.to;
      match.createdAt = createdAt;
    }
    if (filters.status) match.status = filters.status;
    if (filters.language) match.language = filters.language;
    if (filters.source === "run" || filters.source === "submit") {
      match.source = filters.source;
    } else {
      // Default: official submits only (runs excluded from product analytics)
      match.source = { $ne: "run" };
    }

    const [
      total,
      items,
      byStatus,
      byLanguage,
      daily,
      avgRow,
      attemptAgg,
      acceptedDays,
    ] = await Promise.all([
      Submission.countDocuments(match),
      Submission.find(match)
        .select(
          "problemId status language executionTime memory source createdAt testCasesPassed totalTestCases"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Submission.aggregate([
        { $match: match },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Submission.aggregate([
        { $match: match },
        { $group: { _id: "$language", count: { $sum: 1 } } },
      ]),
      Submission.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            count: { $sum: 1 },
            accepted: {
              $sum: {
                $cond: [{ $eq: ["$status", "ACCEPTED"] }, 1, 0],
              },
            },
            avgExecutionTime: {
              $avg: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$executionTime", null] },
                      { $eq: ["$status", "ACCEPTED"] },
                    ],
                  },
                  "$executionTime",
                  null,
                ],
              },
            },
            avgMemory: {
              $avg: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$memory", null] },
                      { $eq: ["$status", "ACCEPTED"] },
                    ],
                  },
                  "$memory",
                  null,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Submission.aggregate([
        {
          $match: {
            ...match,
            // Headline averages: measured ACCEPTED samples only (align with daily trends).
            // Per-row History still shows runtime/memory for any verdict when measured.
            status: "ACCEPTED",
            executionTime: {
              $exists: true,
              $ne: null,
              $type: ["double", "int", "long", "decimal"],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgExecutionTime: { $avg: "$executionTime" },
            avgMemory: { $avg: "$memory" },
            sampleCount: { $sum: 1 },
          },
        },
      ]),
      // Attempt analysis: submissions per problem
      Submission.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$problemId",
            attempts: { $sum: 1 },
            accepted: {
              $sum: { $cond: [{ $eq: ["$status", "ACCEPTED"] }, 1, 0] },
            },
          },
        },
        {
          $group: {
            _id: null,
            problemsAttempted: { $sum: 1 },
            problemsSolved: {
              $sum: { $cond: [{ $gt: ["$accepted", 0] }, 1, 0] },
            },
            totalAttempts: { $sum: "$attempts" },
            avgAttemptsPerProblem: { $avg: "$attempts" },
          },
        },
      ]),
      Submission.aggregate([
        { $match: { ...match, status: "ACCEPTED" } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const statusMap: Record<string, number> = {};
    for (const s of byStatus) statusMap[String(s._id)] = s.count;
    const languageMap: Record<string, number> = {};
    for (const s of byLanguage) {
      languageMap[String(s._id || "unknown")] = s.count;
    }

    const accepted = statusMap["ACCEPTED"] || 0;
    const acceptanceRate =
      total > 0 ? Math.round((accepted / total) * 10000) / 100 : 0;

    const avg = avgRow[0];
    const attempts = attemptAgg[0];

    return {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / Math.max(limit, 1))),
      items: items.map((doc: any) => ({
        id: String(doc._id),
        problemId: String(doc.problemId),
        status: doc.status,
        language: doc.language || null,
        executionTime:
          typeof doc.executionTime === "number" ? doc.executionTime : null,
        memory: typeof doc.memory === "number" ? doc.memory : null,
        source: doc.source || "submit",
        createdAt: doc.createdAt,
        testCasesPassed:
          typeof doc.testCasesPassed === "number" ? doc.testCasesPassed : null,
        totalTestCases:
          typeof doc.totalTestCases === "number" ? doc.totalTestCases : null,
      })),
      aggregates: {
        byStatus: statusMap,
        byLanguage: languageMap,
        acceptanceRate,
        acceptedCount: accepted,
        // null when no measured samples — never fabricate
        avgExecutionTimeMs:
          avg?.avgExecutionTime != null
            ? Math.round(Number(avg.avgExecutionTime) * 100) / 100
            : null,
        avgMemoryMb:
          avg?.avgMemory != null
            ? Math.round(Number(avg.avgMemory) * 100) / 100
            : null,
        runtimeSampleCount: avg?.sampleCount || 0,
        daily: daily.map((d: any) => ({
          date: d._id,
          count: d.count,
          accepted: d.accepted || 0,
          avgExecutionTimeMs:
            d.avgExecutionTime != null
              ? Math.round(Number(d.avgExecutionTime) * 100) / 100
              : null,
          avgMemoryMb:
            d.avgMemory != null
              ? Math.round(Number(d.avgMemory) * 100) / 100
              : null,
        })),
        acceptanceDaily: acceptedDays.map((d: any) => ({
          date: d._id,
          accepted: d.count,
        })),
        attempts: attempts
          ? {
              problemsAttempted: attempts.problemsAttempted || 0,
              problemsSolved: attempts.problemsSolved || 0,
              totalAttempts: attempts.totalAttempts || 0,
              avgAttemptsPerProblem:
                attempts.avgAttemptsPerProblem != null
                  ? Math.round(Number(attempts.avgAttemptsPerProblem) * 100) /
                    100
                  : null,
            }
          : {
              problemsAttempted: 0,
              problemsSolved: 0,
              totalAttempts: 0,
              avgAttemptsPerProblem: null,
            },
      },
    };
  }
}
