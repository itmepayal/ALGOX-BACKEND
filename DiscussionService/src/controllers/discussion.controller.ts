import { Request, Response, NextFunction } from "express";
import { DiscussionService } from "../services/discussion.service";

export class DiscussionController {
  constructor(private discussionService: DiscussionService) {}

  async createPost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const post = await this.discussionService.createPost(req.body);
      res.status(201).json({ success: true, message: "Post created successfully", data: post });
    } catch (error) {
      next(error);
    }
  }

  async getPosts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { category, problemId, language, companyTag, q, sortBy, page, limit } = req.query;
      const result = await this.discussionService.getPosts(
        category ? String(category) : undefined,
        problemId ? String(problemId) : undefined,
        language ? String(language) : undefined,
        companyTag ? String(companyTag) : undefined,
        q ? String(q) : undefined,
        sortBy as any,
        page ? Number(page) : 1,
        limit ? Number(limit) : 10
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getPostById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const post = await this.discussionService.getPostById(String(id));
      res.status(200).json({ success: true, data: post });
    } catch (error) {
      next(error);
    }
  }

  async votePost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { userId, voteType } = req.body;
      const post = await this.discussionService.votePost(String(id), userId, voteType);
      res.status(200).json({ success: true, message: "Vote recorded", data: post });
    } catch (error) {
      next(error);
    }
  }

  async bookmarkPost(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { userId } = req.body;
      const post = await this.discussionService.bookmarkPost(String(id), userId);
      res.status(200).json({ success: true, message: "Bookmark updated", data: post });
    } catch (error) {
      next(error);
    }
  }

  async addComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const comment = await this.discussionService.addComment(req.body);
      res.status(201).json({ success: true, message: "Comment added", data: comment });
    } catch (error) {
      next(error);
    }
  }

  async getComments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const comments = await this.discussionService.getComments(String(id));
      res.status(200).json({ success: true, data: comments });
    } catch (error) {
      next(error);
    }
  }
}
