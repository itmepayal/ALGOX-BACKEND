import { Problem, IProblem, ProblemStatus } from "../models/problem.model";
import { ProblemQueryDto } from "../validators/problem.validator";

export interface IProblemRepository {
  createProblem(data: Partial<IProblem>): Promise<IProblem>;
  updateProblem(id: string, data: Partial<IProblem>): Promise<IProblem | null>;
  deleteProblem(id: string): Promise<boolean>;
  getProblemById(id: string): Promise<IProblem | null>;
  getProblemBySlug(slug: string): Promise<IProblem | null>;
  getProblems(query: ProblemQueryDto, opts?: { publicOnly?: boolean }): Promise<{
    problems: IProblem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  findByDifficulty(difficulty: "easy" | "medium" | "hard"): Promise<IProblem[]>;
  searchProblems(query: string, publicOnly?: boolean): Promise<IProblem[]>;
  updateStatus(
    id: string,
    status: ProblemStatus,
    updatedBy?: string
  ): Promise<IProblem | null>;
  duplicateProblem(id: string, createdBy?: string): Promise<IProblem | null>;
  bulkUpdate(
    ids: string[],
    update: Partial<IProblem> | { $addToSet?: { tags: { $each: string[] } } }
  ): Promise<number>;
  internalStats(): Promise<Record<string, unknown>>;
}

export class ProblemRepository implements IProblemRepository {
  async createProblem(problem: Partial<IProblem>): Promise<IProblem> {
    const slug = problem.slug || slugify(problem.title || "");
    return await Problem.create({ ...problem, slug });
  }

  async updateProblem(
    id: string,
    problem: Partial<IProblem>
  ): Promise<IProblem | null> {
    const updateData: Partial<IProblem> = { ...problem };
    if (problem.title && !problem.slug) {
      updateData.slug = slugify(problem.title);
    }
    return await Problem.findByIdAndUpdate(id, updateData, { new: true });
  }

  async deleteProblem(id: string): Promise<boolean> {
    const res = await Problem.findByIdAndDelete(id);
    return res !== null;
  }

  async getProblemById(id: string): Promise<IProblem | null> {
    return await Problem.findById(id);
  }

  async getProblemBySlug(slug: string): Promise<IProblem | null> {
    return await Problem.findOne({ slug });
  }

  async getProblems(
    query: ProblemQueryDto,
    opts?: { publicOnly?: boolean }
  ): Promise<{
    problems: IProblem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const skip = (page - 1) * limit;

    const filter: any = {};
    const and: any[] = [];

    if (opts?.publicOnly) {
      // Missing status treated as published until migrate-problem-status.js runs
      and.push({
        $or: [{ status: "published" }, { status: { $exists: false } }],
      });
    } else if (query.status && query.status !== "all") {
      filter.status = query.status;
    }

    if (query.difficulty) {
      filter.difficulty = query.difficulty;
    }

    if (query.category) {
      filter.category = new RegExp(query.category, "i");
    }

    if (query.tag) {
      filter.tags = { $in: [new RegExp(query.tag, "i")] };
    }

    if (query.search) {
      and.push({
        $or: [
          { title: new RegExp(query.search, "i") },
          { category: new RegExp(query.search, "i") },
          { tags: { $in: [new RegExp(query.search, "i")] } },
          { slug: new RegExp(query.search, "i") },
        ],
      });
    }

    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(query.from);
      if (query.to) filter.createdAt.$lte = new Date(query.to);
    }

    if (and.length) {
      filter.$and = and;
    }

    const [problems, total] = await Promise.all([
      Problem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Problem.countDocuments(filter),
    ]);

    return {
      problems,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findByDifficulty(
    difficulty: "easy" | "medium" | "hard"
  ): Promise<IProblem[]> {
    return await Problem.find({
      difficulty,
      $or: [{ status: "published" }, { status: { $exists: false } }],
    }).sort({
      createdAt: -1,
    });
  }

  async searchProblems(query: string, publicOnly = true): Promise<IProblem[]> {
    const filter: any = {
      $and: [
        {
          $or: [
            { title: new RegExp(query, "i") },
            { category: new RegExp(query, "i") },
            { tags: { $in: [new RegExp(query, "i")] } },
          ],
        },
      ],
    };
    if (publicOnly) {
      filter.$and.push({
        $or: [{ status: "published" }, { status: { $exists: false } }],
      });
    }
    return await Problem.find(filter).sort({ createdAt: -1 });
  }

  async updateStatus(
    id: string,
    status: ProblemStatus,
    updatedBy?: string
  ): Promise<IProblem | null> {
    const update: Partial<IProblem> = { status, updatedBy };
    if (status === "published") {
      update.publishedAt = new Date();
    }
    return await Problem.findByIdAndUpdate(id, update, { new: true });
  }

  async duplicateProblem(
    id: string,
    createdBy?: string
  ): Promise<IProblem | null> {
    const src = await Problem.findById(id).lean();
    if (!src) return null;
    const { _id, createdAt, updatedAt, publishedAt, ...rest } = src as any;
    const title = `${rest.title} (Copy)`;
    return await Problem.create({
      ...rest,
      title,
      slug: slugify(`${title}-${Date.now()}`),
      status: "draft",
      createdBy,
      updatedBy: createdBy,
      publishedAt: undefined,
    });
  }

  async bulkUpdate(
    ids: string[],
    update: Partial<IProblem> | { $addToSet?: { tags: { $each: string[] } } }
  ): Promise<number> {
    const result = await Problem.updateMany({ _id: { $in: ids } }, update as any);
    return result.modifiedCount || 0;
  }

  async internalStats(): Promise<Record<string, unknown>> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [total, draft, published, archived, today, byDifficulty, byTopic] =
      await Promise.all([
        Problem.countDocuments({}),
        Problem.countDocuments({ status: "draft" }),
        Problem.countDocuments({ status: "published" }),
        Problem.countDocuments({ status: "archived" }),
        Problem.countDocuments({ createdAt: { $gte: startOfDay } }),
        Problem.aggregate([
          { $match: { status: "published" } },
          { $group: { _id: "$difficulty", count: { $sum: 1 } } },
        ]),
        Problem.aggregate([
          { $match: { status: "published", tags: { $exists: true, $ne: [] } } },
          { $unwind: "$tags" },
          { $group: { _id: "$tags", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 20 },
        ]),
      ]);

    const difficulty: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
    for (const row of byDifficulty) {
      difficulty[row._id] = row.count;
    }

    const topicMap: Record<string, number> = {};
    for (const row of byTopic) {
      const key = String(row._id || "").trim();
      if (key) topicMap[key] = row.count;
    }

    return {
      total,
      draft,
      published,
      archived,
      today,
      byDifficulty: difficulty,
      byTopic: topicMap,
    };
  }
}

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-");
}
