import { ContentRepository } from "../repositories/content.repository";
import { IProblemEditorial } from "../models/problemEditorial.model";
import { IStudyPlan } from "../models/studyPlan.model";

export class ContentService {
  constructor(private contentRepository: ContentRepository) {}

  async upsertEditorial(data: Partial<IProblemEditorial>) {
    return await this.contentRepository.upsertEditorial(data);
  }

  async getEditorialByProblemId(
    problemId: string,
    opts?: { canEditorial?: boolean; canHints?: boolean }
  ) {
    const editorial = await this.contentRepository.getEditorialByProblemId(problemId);
    const canEditorial = Boolean(opts?.canEditorial);
    const canHints = Boolean(opts?.canHints);

    if (!editorial) {
      return {
        problemId,
        hints: [],
        solutions: [],
        isPremiumOnly: false,
        accessLocked: !canEditorial,
        hintsLocked: !canHints,
      };
    }

    const obj: any =
      typeof (editorial as any).toObject === "function"
        ? (editorial as any).toObject()
        : { ...editorial };

    const premiumOnly = Boolean(obj.isPremiumOnly);
    // Premium-only editorials and all solution bodies require premium.editorial
    if (premiumOnly || !canEditorial) {
      return {
        problemId: obj.problemId || problemId,
        isPremiumOnly: premiumOnly,
        accessLocked: true,
        hintsLocked: !canHints,
        hints: canHints && Array.isArray(obj.hints) ? obj.hints : [],
        solutions: [],
        videoUrl: undefined,
        title: obj.title,
      };
    }

    if (!canHints) {
      obj.hints = [];
      obj.hintsLocked = true;
    }
    obj.accessLocked = false;
    return obj;
  }

  async createStudyPlan(data: Partial<IStudyPlan>) {
    const payload: any = { ...data };
    if (!payload.slug && payload.title) {
      payload.slug = String(payload.title)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }
    if (payload.isPremium || payload.access === "PREMIUM") {
      payload.isPremium = true;
      payload.access = "PREMIUM";
    } else {
      payload.isPremium = false;
      payload.access = "FREE";
    }
    return await this.contentRepository.createStudyPlan(payload);
  }

  async getStudyPlans(
    opts?: {
      category?: string;
      access?: string;
      difficulty?: string;
      topic?: string;
    },
    accessCtx?: { canPremiumPlans?: boolean; userId?: string }
  ) {
    const { toPublicPlan } = await import("../utils/studyPlanAccess");
    const plans = await this.contentRepository.getStudyPlans({
      ...opts,
      publishedOnly: true,
    });
    let progressBySlug = new Map<string, any>();
    if (accessCtx?.userId) {
      const rows = await this.contentRepository.listUserStudyPlanProgress(
        accessCtx.userId
      );
      for (const r of rows) {
        progressBySlug.set(String((r as any).studyPlanSlug), r);
      }
    }
    return plans.map((p: any) => {
      const premium = Boolean(p.isPremium || p.access === "PREMIUM");
      const locked = premium && !accessCtx?.canPremiumPlans;
      const progress = progressBySlug.get(String(p.slug));
      return toPublicPlan(p, { locked, includeProgress: progress });
    });
  }

  async getStudyPlanBySlug(
    slug: string,
    accessCtx?: {
      canPremiumPlans?: boolean;
      userId?: string;
    }
  ) {
    const { toPublicPlan } = await import(
      "../utils/studyPlanAccess"
    );
    const studyPlan = await this.contentRepository.getStudyPlanBySlug(slug, {
      publishedOnly: true,
    });
    if (!studyPlan) {
      const err: any = new Error("Study plan not found");
      err.statusCode = 404;
      throw err;
    }
    const premium = Boolean(
      (studyPlan as any).isPremium || (studyPlan as any).access === "PREMIUM"
    );
    const locked = premium && !accessCtx?.canPremiumPlans;
    let progress: any = null;
    if (accessCtx?.userId) {
      progress = await this.contentRepository.getUserStudyPlanProgress(
        accessCtx.userId,
        slug
      );
    }
    return toPublicPlan(studyPlan, {
      locked,
      includeProgress: progress ?? null,
    });
  }

  async enrollStudyPlan(userId: string, studyPlanSlug: string) {
    const { sanitizeProgress } = await import("../utils/studyPlanAccess");
    const plan = await this.contentRepository.getStudyPlanBySlug(studyPlanSlug, {
      publishedOnly: true,
    });
    if (!plan) {
      const err: any = new Error("Study plan not found");
      err.statusCode = 404;
      throw err;
    }
    const premium = Boolean(
      (plan as any).isPremium || (plan as any).access === "PREMIUM"
    );
    // Caller must check entitlement for premium plans

    const prereqs: string[] = Array.isArray((plan as any).prerequisiteSlugs)
      ? (plan as any).prerequisiteSlugs
      : [];
    for (const pre of prereqs) {
      const ok = await this.contentRepository.hasCompletedPlan(userId, pre);
      if (!ok) {
        const err: any = new Error(
          `Complete prerequisite plan first: ${pre}`
        );
        err.statusCode = 403;
        err.code = "PREREQUISITE_REQUIRED";
        err.prerequisite = pre;
        throw err;
      }
    }

    const progress = await this.contentRepository.enrollStudyPlan(
      userId,
      studyPlanSlug
    );
    return { planPremium: premium, progress: sanitizeProgress(progress) };
  }

  async updateStudyPlanProgress(
    userId: string,
    studyPlanSlug: string,
    problemId: string
  ) {
    const { sanitizeProgress } = await import("../utils/studyPlanAccess");
    const progress = await this.contentRepository.updateStudyPlanProgress(
      userId,
      studyPlanSlug,
      problemId
    );
    return sanitizeProgress(progress);
  }

  async completeStudyPlan(userId: string, studyPlanSlug: string) {
    const { sanitizeProgress } = await import("../utils/studyPlanAccess");
    const progress = await this.contentRepository.completeStudyPlan(
      userId,
      studyPlanSlug
    );
    return sanitizeProgress(progress);
  }

  async getUserStudyPlanProgress(userId: string, studyPlanSlug: string) {
    const { sanitizeProgress } = await import("../utils/studyPlanAccess");
    const progress = await this.contentRepository.getUserStudyPlanProgress(
      userId,
      studyPlanSlug
    );
    return sanitizeProgress(progress);
  }

  async listMyStudyPlanProgress(userId: string) {
    const { sanitizeProgress } = await import("../utils/studyPlanAccess");
    const rows = await this.contentRepository.listUserStudyPlanProgress(userId);
    return rows.map((p) => ({
      studyPlanSlug: (p as any).studyPlanSlug,
      ...sanitizeProgress(p),
    }));
  }

  async resumeStudyPlan(userId: string, studyPlanSlug: string) {
    const { sanitizeProgress, computeResume } = await import(
      "../utils/studyPlanAccess"
    );
    const plan = await this.contentRepository.getStudyPlanBySlug(studyPlanSlug, {
      publishedOnly: true,
    });
    if (!plan) {
      const err: any = new Error("Study plan not found");
      err.statusCode = 404;
      throw err;
    }
    let progress = await this.contentRepository.getUserStudyPlanProgress(
      userId,
      studyPlanSlug
    );
    if (!progress) {
      progress = await this.contentRepository.enrollStudyPlan(
        userId,
        studyPlanSlug
      );
    }
    const resume = computeResume(
      plan,
      (progress as any).completedProblemIds || []
    );
    return {
      progress: sanitizeProgress(progress),
      resumeProblemId: resume.resumeProblemId,
      resumeSectionIndex: resume.resumeSectionIndex,
    };
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
    if (!note) return { userId, problemId, noteText: "", tags: [] as string[] };
    return note;
  }

  async getUserNotes(userId: string, tag?: string) {
    return await this.contentRepository.getUserNotes(userId, { tag });
  }

  async deleteUserProblemNote(userId: string, problemId: string) {
    return this.contentRepository.deleteUserProblemNote(userId, problemId);
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
