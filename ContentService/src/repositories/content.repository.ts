import { ProblemEditorial, IProblemEditorial } from "../models/problemEditorial.model";
import { StudyPlan, IStudyPlan } from "../models/studyPlan.model";
import { UserStudyPlanProgress, IUserStudyPlanProgress } from "../models/userStudyPlanProgress.model";
import { Article, IArticle } from "../models/article.model";
import { ProblemNote, IProblemNote } from "../models/problemNote.model";
import redis from "../config/redis.config";

export class ContentRepository {
  async upsertEditorial(data: Partial<IProblemEditorial>): Promise<IProblemEditorial> {
    const editorial = await ProblemEditorial.findOneAndUpdate(
      { problemId: data.problemId },
      { $set: data },
      { upsert: true, new: true }
    );
    try {
      await redis.del(`editorial:problem:${data.problemId}`);
    } catch {}
    return editorial;
  }

  async getEditorialByProblemId(problemId: string): Promise<any> {
    const cacheKey = `editorial:problem:${problemId}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return typeof cached === "string" ? JSON.parse(cached) : cached;
      }
    } catch {}

    const editorial = await ProblemEditorial.findOne({ problemId });
    if (editorial) {
      try {
        await redis.set(cacheKey, JSON.stringify(editorial.toObject()), { ex: 3600 }); // 1 Hour TTL
      } catch {}
      return editorial.toObject();
    }
    return null;
  }

  async createStudyPlan(data: Partial<IStudyPlan>): Promise<IStudyPlan> {
    return await StudyPlan.create(data);
  }

  async getStudyPlans(category?: string): Promise<IStudyPlan[]> {
    const query: any = {};
    if (category) query.category = category;
    return await StudyPlan.find(query);
  }

  async getStudyPlanBySlug(slug: string): Promise<IStudyPlan | null> {
    return await StudyPlan.findOne({ slug });
  }

  async updateStudyPlanProgress(
    userId: string,
    studyPlanSlug: string,
    problemId: string
  ): Promise<IUserStudyPlanProgress> {
    const studyPlan = await StudyPlan.findOne({ slug: studyPlanSlug });
    if (!studyPlan) throw new Error("Study plan not found");

    let progress = await UserStudyPlanProgress.findOne({ userId, studyPlanSlug });

    if (!progress) {
      progress = new UserStudyPlanProgress({
        userId,
        studyPlanSlug,
        completedProblemIds: [],
        solvedCount: 0,
        totalProblemsCount: studyPlan.totalProblemsCount || 50,
        completionPercentage: 0,
      });
    }

    if (!progress.completedProblemIds.includes(problemId)) {
      progress.completedProblemIds.push(problemId);
      progress.solvedCount = progress.completedProblemIds.length;
      progress.completionPercentage = Number(
        ((progress.solvedCount / (progress.totalProblemsCount || 1)) * 100).toFixed(2)
      );
    }
    progress.lastStudiedAt = new Date();
    await progress.save();
    return progress;
  }

  async getUserStudyPlanProgress(
    userId: string,
    studyPlanSlug: string
  ): Promise<IUserStudyPlanProgress | null> {
    return await UserStudyPlanProgress.findOne({ userId, studyPlanSlug });
  }

  async createArticle(data: Partial<IArticle>): Promise<IArticle> {
    return await Article.create(data);
  }

  async getArticles(category?: string, searchQuery?: string, page: number = 1, limit: number = 10) {
    const query: any = { isPublished: true };
    if (category) query.category = category;
    if (searchQuery) query.$text = { $search: searchQuery };

    const skip = (page - 1) * limit;
    const [articles, total] = await Promise.all([
      Article.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Article.countDocuments(query),
    ]);

    return { articles, total, page, totalPages: Math.ceil(total / limit) };
  }

  async getArticleBySlug(slug: string): Promise<IArticle | null> {
    return await Article.findOneAndUpdate(
      { slug, isPublished: true },
      { $inc: { viewsCount: 1 } },
      { new: true }
    );
  }

  async upsertProblemNote(
    userId: string,
    problemId: string,
    noteText: string,
    tags: string[] = []
  ): Promise<IProblemNote> {
    return await ProblemNote.findOneAndUpdate(
      { userId, problemId },
      { userId, problemId, noteText, tags },
      { upsert: true, new: true }
    );
  }

  async getProblemNote(userId: string, problemId: string): Promise<IProblemNote | null> {
    return await ProblemNote.findOne({ userId, problemId });
  }

  async getUserNotes(userId: string): Promise<IProblemNote[]> {
    return await ProblemNote.find({ userId }).sort({ updatedAt: -1 });
  }

  /** Admin: list articles including drafts. */
  async adminListArticles(params: {
    page?: number;
    limit?: number;
    search?: string;
    published?: string;
    category?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const query: Record<string, unknown> = {};
    if (params.category) query.category = params.category;
    if (params.published === "true") query.isPublished = true;
    if (params.published === "false") query.isPublished = false;
    if (params.search?.trim()) {
      query.$or = [
        { title: { $regex: params.search.trim(), $options: "i" } },
        { slug: { $regex: params.search.trim(), $options: "i" } },
      ];
    }
    const [articles, total] = await Promise.all([
      Article.find(query)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Article.countDocuments(query),
    ]);
    return {
      articles,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async updateArticle(id: string, data: Partial<IArticle>) {
    const article = await Article.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    );
    if (!article) throw new Error("Article not found");
    return article;
  }

  async deleteArticle(id: string) {
    const article = await Article.findByIdAndDelete(id);
    if (!article) throw new Error("Article not found");
    return article;
  }

  async adminListStudyPlans(params: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const query: Record<string, unknown> = {};
    if (params.search?.trim()) {
      query.$or = [
        { title: { $regex: params.search.trim(), $options: "i" } },
        { slug: { $regex: params.search.trim(), $options: "i" } },
      ];
    }
    const [items, total] = await Promise.all([
      StudyPlan.find(query)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      StudyPlan.countDocuments(query),
    ]);
    return {
      studyPlans: items,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async updateStudyPlan(id: string, data: Partial<IStudyPlan>) {
    const plan = await StudyPlan.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    );
    if (!plan) throw new Error("Study plan not found");
    return plan;
  }

  async deleteStudyPlan(id: string) {
    const plan = await StudyPlan.findByIdAndDelete(id);
    if (!plan) throw new Error("Study plan not found");
    return plan;
  }

  async adminListEditorials(params: { page?: number; limit?: number }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const [items, total] = await Promise.all([
      ProblemEditorial.find({})
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ProblemEditorial.countDocuments({}),
    ]);
    return {
      editorials: items,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async deleteEditorial(id: string) {
    const doc = await ProblemEditorial.findByIdAndDelete(id);
    if (!doc) throw new Error("Editorial not found");
    try {
      await redis.del(`editorial:problem:${doc.problemId}`);
    } catch {}
    return doc;
  }

  async adminListNotes(params: {
    page?: number;
    limit?: number;
    userId?: string;
    problemId?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const query: Record<string, unknown> = {};
    if (params.userId) query.userId = params.userId;
    if (params.problemId) query.problemId = params.problemId;
    const [notes, total] = await Promise.all([
      ProblemNote.find(query)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ProblemNote.countDocuments(query),
    ]);
    return {
      notes,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async deleteNote(id: string) {
    const note = await ProblemNote.findByIdAndDelete(id);
    if (!note) throw new Error("Note not found");
    return note;
  }
}
