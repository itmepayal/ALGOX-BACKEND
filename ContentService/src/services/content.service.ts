import { ContentRepository } from "../repositories/content.repository";
import { IProblemEditorial } from "../models/problemEditorial.model";
import { IStudyPlan } from "../models/studyPlan.model";

export class ContentService {
  constructor(private contentRepository: ContentRepository) {}

  async upsertEditorial(data: Partial<IProblemEditorial>) {
    return await this.contentRepository.upsertEditorial(data);
  }

  async getEditorialByProblemId(problemId: string) {
    const editorial = await this.contentRepository.getEditorialByProblemId(problemId);
    if (!editorial) {
      return {
        problemId,
        hints: [],
        solutions: [],
        isPremiumOnly: false,
      };
    }
    return editorial;
  }

  async createStudyPlan(data: Partial<IStudyPlan>) {
    const payload: any = { ...data };
    if (!payload.slug && payload.title) {
      payload.slug = String(payload.title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }
    return await this.contentRepository.createStudyPlan(payload);
  }

  async getStudyPlans(category?: string) {
    return await this.contentRepository.getStudyPlans(category);
  }

  async getStudyPlanBySlug(slug: string) {
    const studyPlan = await this.contentRepository.getStudyPlanBySlug(slug);
    if (!studyPlan) throw new Error("Study plan not found");
    return studyPlan;
  }

  async updateStudyPlanProgress(userId: string, studyPlanSlug: string, problemId: string) {
    return await this.contentRepository.updateStudyPlanProgress(userId, studyPlanSlug, problemId);
  }

  async getUserStudyPlanProgress(userId: string, studyPlanSlug: string) {
    const progress = await this.contentRepository.getUserStudyPlanProgress(userId, studyPlanSlug);
    if (!progress) {
      return {
        userId,
        studyPlanSlug,
        completedProblemIds: [],
        solvedCount: 0,
        completionPercentage: 0,
      };
    }
    return progress;
  }

  async createArticle(data: any) {
    const payload = { ...data };
    if (!payload.slug && payload.title) {
      payload.slug = String(payload.title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }
    return await this.contentRepository.createArticle(payload);
  }

  async getArticles(category?: string, searchQuery?: string, page?: number, limit?: number) {
    return await this.contentRepository.getArticles(category, searchQuery, page, limit);
  }

  async getArticleBySlug(slug: string) {
    const article = await this.contentRepository.getArticleBySlug(slug);
    if (!article) throw new Error("Article not found");
    return article;
  }

  async upsertProblemNote(userId: string, problemId: string, noteText: string, tags?: string[]) {
    return await this.contentRepository.upsertProblemNote(userId, problemId, noteText, tags);
  }

  async getProblemNote(userId: string, problemId: string) {
    const note = await this.contentRepository.getProblemNote(userId, problemId);
    if (!note) return { userId, problemId, noteText: "", tags: [] };
    return note;
  }

  async getUserNotes(userId: string) {
    return await this.contentRepository.getUserNotes(userId);
  }

  async adminListArticles(params: {
    page?: number;
    limit?: number;
    search?: string;
    published?: string;
    category?: string;
  }) {
    return this.contentRepository.adminListArticles(params);
  }

  async updateArticle(id: string, data: any) {
    return this.contentRepository.updateArticle(id, data);
  }

  async deleteArticle(id: string) {
    return this.contentRepository.deleteArticle(id);
  }

  async adminListStudyPlans(params: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    return this.contentRepository.adminListStudyPlans(params);
  }

  async updateStudyPlan(id: string, data: any) {
    return this.contentRepository.updateStudyPlan(id, data);
  }

  async deleteStudyPlan(id: string) {
    return this.contentRepository.deleteStudyPlan(id);
  }

  async adminListEditorials(params: { page?: number; limit?: number }) {
    return this.contentRepository.adminListEditorials(params);
  }

  async deleteEditorial(id: string) {
    return this.contentRepository.deleteEditorial(id);
  }

  async adminListNotes(params: {
    page?: number;
    limit?: number;
    userId?: string;
    problemId?: string;
  }) {
    return this.contentRepository.adminListNotes(params);
  }

  async deleteNote(id: string) {
    return this.contentRepository.deleteNote(id);
  }
}
