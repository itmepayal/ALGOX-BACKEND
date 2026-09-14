import { Request, Response, NextFunction } from "express";
import { ContentService } from "../services/content.service";
import {
  AuthenticatedRequest,
  ForbiddenError,
  UnauthorizedError,
} from "../middlewares/auth.middleware";
import { hasAnyPermission } from "../rbac/permissions";
import { writeAdminAudit } from "../utils/helpers/audit.helper";

function actorId(req: Request): string | undefined {
  return (req as AuthenticatedRequest).user?.userId;
}

async function auditContent(
  req: Request,
  action: string,
  resource: string,
  resourceId?: string,
  after?: Record<string, unknown>
) {
  const user = (req as AuthenticatedRequest).user;
  if (!user?.userId) return;
  await writeAdminAudit({
    actorId: user.userId,
    actorEmail: user.email,
    action,
    resource,
    resourceId,
    after,
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
    authorization: req.headers.authorization,
  });
}

function canManageContent(req: Request): boolean {
  const role = (req as AuthenticatedRequest).user?.role;
  return hasAnyPermission(role, ["content:view", "content:update"]);
}

function assertSelfOrStaff(req: Request, targetUserId: string): void {
  const actor = actorId(req);
  if (!actor) throw new UnauthorizedError("Authentication required");
  if (actor !== targetUserId && !canManageContent(req)) {
    throw new ForbiddenError("You cannot access another user's content");
  }
}

export class ContentController {
  constructor(private contentService: ContentService) {}

  async upsertEditorial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const editorial = await this.contentService.upsertEditorial(req.body);
      await auditContent(
        req,
        "content.editorial.upsert",
        "editorial",
        String((editorial as any)?._id || req.body?.problemId),
        { problemId: req.body?.problemId }
      );
      res.status(200).json({ success: true, message: "Editorial updated", data: editorial });
    } catch (error) {
      next(error);
    }
  }

  async getEditorialByProblemId(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { problemId } = req.params;
      const editorial = await this.contentService.getEditorialByProblemId(String(problemId));
      res.status(200).json({ success: true, data: editorial });
    } catch (error) {
      next(error);
    }
  }

  async createStudyPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studyPlan = await this.contentService.createStudyPlan(req.body);
      await auditContent(
        req,
        "content.study_plan.create",
        "study_plan",
        String((studyPlan as any)?._id),
        { slug: (studyPlan as any)?.slug }
      );
      res.status(201).json({ success: true, message: "Study plan created", data: studyPlan });
    } catch (error) {
      next(error);
    }
  }

  async getStudyPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { category } = req.query;
      const studyPlans = await this.contentService.getStudyPlans(category ? String(category) : undefined);
      res.status(200).json({ success: true, data: studyPlans });
    } catch (error) {
      next(error);
    }
  }

  async getStudyPlanBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      const studyPlan = await this.contentService.getStudyPlanBySlug(String(slug));
      res.status(200).json({ success: true, data: studyPlan });
    } catch (error) {
      next(error);
    }
  }

  async updateStudyPlanProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = actorId(req);
      if (!actor) throw new UnauthorizedError("Authentication required");
      const { studyPlanSlug, problemId } = req.body;
      // Force JWT user — never trust body userId
      const progress = await this.contentService.updateStudyPlanProgress(
        actor,
        studyPlanSlug,
        problemId
      );
      res.status(200).json({ success: true, message: "Progress updated", data: progress });
    } catch (error) {
      next(error);
    }
  }

  async getUserStudyPlanProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, slug } = req.params;
      assertSelfOrStaff(req, String(userId));
      const progress = await this.contentService.getUserStudyPlanProgress(String(userId), String(slug));
      res.status(200).json({ success: true, data: progress });
    } catch (error) {
      next(error);
    }
  }

  async createArticle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const article = await this.contentService.createArticle(req.body);
      await auditContent(
        req,
        "content.article.create",
        "article",
        String((article as any)?._id),
        { slug: (article as any)?.slug }
      );
      res.status(201).json({ success: true, message: "Article created", data: article });
    } catch (error) {
      next(error);
    }
  }

  async getArticles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { category, q, page, limit } = req.query;
      const result = await this.contentService.getArticles(
        category ? String(category) : undefined,
        q ? String(q) : undefined,
        page ? Number(page) : 1,
        limit ? Number(limit) : 10
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getArticleBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      const article = await this.contentService.getArticleBySlug(String(slug));
      res.status(200).json({ success: true, data: article });
    } catch (error) {
      next(error);
    }
  }

  async upsertProblemNote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const actor = actorId(req);
      if (!actor) throw new UnauthorizedError("Authentication required");
      const { problemId, noteText, tags } = req.body;
      const note = await this.contentService.upsertProblemNote(
        actor,
        problemId,
        noteText,
        tags
      );
      res.status(200).json({ success: true, message: "Note saved", data: note });
    } catch (error) {
      next(error);
    }
  }

  async getProblemNote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, problemId } = req.params;
      assertSelfOrStaff(req, String(userId));
      const note = await this.contentService.getProblemNote(String(userId), String(problemId));
      res.status(200).json({ success: true, data: note });
    } catch (error) {
      next(error);
    }
  }

  async getUserNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      assertSelfOrStaff(req, String(userId));
      const notes = await this.contentService.getUserNotes(String(userId));
      res.status(200).json({ success: true, data: notes });
    } catch (error) {
      next(error);
    }
  }

  async adminListArticles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.contentService.adminListArticles({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        search: req.query.search ? String(req.query.search) : undefined,
        published: req.query.published ? String(req.query.published) : undefined,
        category: req.query.category ? String(req.query.category) : undefined,
      });
      res.status(200).json({
        success: true,
        data: result.articles,
        meta: {
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateArticle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const article = await this.contentService.updateArticle(
        String(req.params.id),
        req.body || {}
      );
      await auditContent(req, "content.article.update", "article", String(req.params.id));
      res.status(200).json({ success: true, message: "Article updated", data: article });
    } catch (error) {
      next(error);
    }
  }

  async deleteArticle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.contentService.deleteArticle(String(req.params.id));
      await auditContent(req, "content.article.delete", "article", String(req.params.id));
      res.status(200).json({ success: true, message: "Article deleted" });
    } catch (error) {
      next(error);
    }
  }

  async adminListStudyPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.contentService.adminListStudyPlans({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        search: req.query.search ? String(req.query.search) : undefined,
      });
      res.status(200).json({
        success: true,
        data: result.studyPlans,
        meta: {
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateStudyPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plan = await this.contentService.updateStudyPlan(
        String(req.params.id),
        req.body || {}
      );
      await auditContent(req, "content.study_plan.update", "study_plan", String(req.params.id));
      res.status(200).json({ success: true, message: "Study plan updated", data: plan });
    } catch (error) {
      next(error);
    }
  }

  async deleteStudyPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.contentService.deleteStudyPlan(String(req.params.id));
      await auditContent(req, "content.study_plan.delete", "study_plan", String(req.params.id));
      res.status(200).json({ success: true, message: "Study plan deleted" });
    } catch (error) {
      next(error);
    }
  }

  async adminListEditorials(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.contentService.adminListEditorials({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      });
      res.status(200).json({
        success: true,
        data: result.editorials,
        meta: {
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteEditorial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.contentService.deleteEditorial(String(req.params.id));
      await auditContent(req, "content.editorial.delete", "editorial", String(req.params.id));
      res.status(200).json({ success: true, message: "Editorial deleted" });
    } catch (error) {
      next(error);
    }
  }

  async adminListNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.contentService.adminListNotes({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        userId: req.query.userId ? String(req.query.userId) : undefined,
        problemId: req.query.problemId ? String(req.query.problemId) : undefined,
      });
      res.status(200).json({
        success: true,
        data: result.notes,
        meta: {
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteNote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.contentService.deleteNote(String(req.params.id));
      await auditContent(req, "content.note.delete", "note", String(req.params.id));
      res.status(200).json({ success: true, message: "Note deleted" });
    } catch (error) {
      next(error);
    }
  }
}
