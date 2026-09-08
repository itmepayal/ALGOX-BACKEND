import { Request, Response, NextFunction } from "express";
import { ContentService } from "../services/content.service";

export class ContentController {
  constructor(private contentService: ContentService) {}

  async upsertEditorial(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const editorial = await this.contentService.upsertEditorial(req.body);
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
      const { userId, studyPlanSlug, problemId } = req.body;
      const progress = await this.contentService.updateStudyPlanProgress(userId, studyPlanSlug, problemId);
      res.status(200).json({ success: true, message: "Progress updated", data: progress });
    } catch (error) {
      next(error);
    }
  }

  async getUserStudyPlanProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, slug } = req.params;
      const progress = await this.contentService.getUserStudyPlanProgress(String(userId), String(slug));
      res.status(200).json({ success: true, data: progress });
    } catch (error) {
      next(error);
    }
  }

  async createArticle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const article = await this.contentService.createArticle(req.body);
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
      const { userId, problemId, noteText, tags } = req.body;
      const note = await this.contentService.upsertProblemNote(userId, problemId, noteText, tags);
      res.status(200).json({ success: true, message: "Note saved", data: note });
    } catch (error) {
      next(error);
    }
  }

  async getProblemNote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, problemId } = req.params;
      const note = await this.contentService.getProblemNote(String(userId), String(problemId));
      res.status(200).json({ success: true, data: note });
    } catch (error) {
      next(error);
    }
  }

  async getUserNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId } = req.params;
      const notes = await this.contentService.getUserNotes(String(userId));
      res.status(200).json({ success: true, data: notes });
    } catch (error) {
      next(error);
    }
  }
}
