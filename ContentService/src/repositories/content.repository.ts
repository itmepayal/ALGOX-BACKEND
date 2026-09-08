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
}
