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
    language?: string;
    problemId?: string;
    userId?: string;
    from?: string;
    to?: string;
    source?: string;
  }): Promise<{
    submissions: ISubmission[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  internalStats(rangeDays?: number): Promise<Record<string, unknown>>;
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
    return await Submission.findByIdAndUpdate(id, data, { new: true });
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
    language?: string;
    problemId?: string;
    userId?: string;
    from?: string;
    to?: string;
    source?: string;
  }) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;
    const filter: any = {};

    if (filters.status && filters.status !== "all") filter.status = filters.status;
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
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const rangeStart = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);

    const [
      total,
      today,
      accepted,
      byStatus,
      byLanguage,
      byDifficultyProxy,
      series,
      topProblems,
      activeUsers,
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
      // placeholder — difficulty lives on problems; return empty map for fan-in
      Promise.resolve([] as any[]),
      Submission.aggregate([
        { $match: { createdAt: { $gte: rangeStart } } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
              status: "$status",
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.date": 1 } },
      ]),
      Submission.aggregate([
        { $match: { createdAt: { $gte: rangeStart } } },
        { $group: { _id: "$problemId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Submission.aggregate([
        { $match: { createdAt: { $gte: rangeStart }, userId: { $exists: true } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const statusMap: Record<string, number> = {};
    for (const s of byStatus) statusMap[s._id] = s.count;
    const languageMap: Record<string, number> = {};
    for (const s of byLanguage) languageMap[s._id || "unknown"] = s.count;

    const successRate =
      total > 0 ? Math.round((accepted / total) * 10000) / 100 : 0;

    return {
      total,
      today,
      accepted,
      successRate,
      byStatus: statusMap,
      byLanguage: languageMap,
      series: series.map((r) => ({
        date: r._id.date,
        status: r._id.status,
        count: r.count,
      })),
      topProblems: topProblems.map((r) => ({
        problemId: r._id?.toString?.() || r._id,
        count: r.count,
      })),
      mostActiveUsers: activeUsers.map((r) => ({
        userId: r._id?.toString?.() || r._id,
        count: r.count,
      })),
      byDifficultyProxy,
    };
  }
}
