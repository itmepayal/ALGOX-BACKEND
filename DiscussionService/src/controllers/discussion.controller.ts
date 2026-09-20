import { Response, NextFunction } from "express";
import { DiscussionService } from "../services/discussion.service";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { BadRequestError, UnauthorizedError } from "../utils/errors/app.error";
import { forwardAdminAudit } from "../utils/helpers/audit.helper";
import { isStaffRole } from "../rbac/permissions";

export class DiscussionController {
  constructor(private discussionService: DiscussionService) {}

  async createPost(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const { title, content, category, problemId, language, tags, companyTags, authorName, authorAvatar } =
        req.body;
      const trimmedTitle = String(title || "").trim();
      const trimmedContent = String(content || "").trim();
      if (!trimmedTitle || !trimmedContent) {
        throw new BadRequestError("title and content are required");
      }
      if (trimmedTitle.length > 200) {
        throw new BadRequestError("title must be 200 characters or fewer");
      }
      if (trimmedContent.length > 50000) {
        throw new BadRequestError("content is too long");
      }
      const allowedCategories = [
        "interview_experience",
        "compensation",
        "solution",
        "general",
        "career",
      ] as const;
      const safeCategory =
        category && allowedCategories.includes(category)
          ? category
          : "general";
      const displayName = String(authorName || "")
        .trim()
        .slice(0, 80);
      const post = await this.discussionService.createPost({
        title: trimmedTitle,
        content: trimmedContent,
        category: safeCategory,
        problemId,
        language,
        tags: Array.isArray(tags)
          ? tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 12)
          : undefined,
        companyTags,
        authorId: req.user.userId as any,
        authorName: displayName || req.user.email || "User",
        authorAvatar,
      });
      res.status(201).json({ success: true, message: "Post created successfully", data: post });
    } catch (error) {
      next(error);
    }
  }

  async getPosts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { category, problemId, language, companyTag, q, sortBy, page, limit, status } = req.query;
      const staff = isStaffRole(req.user?.role);
      const pageNum = Math.max(1, Math.floor(Number(page) || 1));
      const limitNum = Math.min(100, Math.max(1, Math.floor(Number(limit) || 20)));
      const allowedSort = ["latest", "most_upvoted", "hot"] as const;
      const safeSort = allowedSort.includes(sortBy as (typeof allowedSort)[number])
        ? (sortBy as (typeof allowedSort)[number])
        : "latest";
      const result = await this.discussionService.getPosts(
        category ? String(category) : undefined,
        problemId ? String(problemId) : undefined,
        language ? String(language) : undefined,
        companyTag ? String(companyTag) : undefined,
        q ? String(q).slice(0, 200) : undefined,
        safeSort,
        pageNum,
        limitNum,
        staff && status
          ? { status: String(status), includeHidden: true }
          : staff
            ? { includeHidden: true }
            : undefined
      );
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getPostById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const post = await this.discussionService.getPostById(
        String(id),
        isStaffRole(req.user?.role)
      );
      res.status(200).json({ success: true, data: post });
    } catch (error) {
      next(error);
    }
  }

  async updatePost(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const post = await this.discussionService.updatePost(
        String(req.params.id),
        req.user.userId,
        req.user.role,
        {
          title: req.body.title,
          content: req.body.content,
          tags: req.body.tags,
        }
      );
      res.status(200).json({ success: true, message: "Post updated", data: post });
    } catch (error) {
      next(error);
    }
  }

  async deletePost(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const post = await this.discussionService.deletePost(
        String(req.params.id),
        req.user.userId,
        req.user.role
      );
      res.status(200).json({ success: true, message: "Post deleted", data: post });
    } catch (error) {
      next(error);
    }
  }

  async moderate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const action = String(req.body.action || req.params.action || "") as
        | "pin"
        | "unpin"
        | "lock"
        | "unlock"
        | "hide"
        | "restore"
        | "delete";
      const before = { id: req.params.id };
      const post = await this.discussionService.moderate(String(req.params.id), action);
      await forwardAdminAudit({
        authorizationHeader: req.headers.authorization,
        action: `discussion.${action}`,
        resource: "discussion",
        resourceId: String(req.params.id),
        before,
        after: {
          status: post.status,
          isPinned: post.isPinned,
          isLocked: post.isLocked,
        },
      });
      res.status(200).json({ success: true, message: `Discussion ${action} applied`, data: post });
    } catch (error) {
      next(error);
    }
  }

  async votePost(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const { id } = req.params;
      const { voteType } = req.body;
      if (voteType !== "upvote" && voteType !== "downvote") {
        throw new BadRequestError("voteType must be upvote or downvote");
      }
      const post = await this.discussionService.votePost(String(id), req.user.userId, voteType);
      res.status(200).json({ success: true, message: "Vote recorded", data: post });
    } catch (error) {
      next(error);
    }
  }

  async bookmarkPost(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const { id } = req.params;
      const post = await this.discussionService.bookmarkPost(String(id), req.user.userId);
      res.status(200).json({ success: true, message: "Bookmark updated", data: post });
    } catch (error) {
      next(error);
    }
  }

  async addComment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const { postId, content, parentId, authorName } = req.body;
      if (!postId || !content?.trim()) {
        throw new BadRequestError("postId and content are required");
      }
      const comment = await this.discussionService.addComment({
        postId,
        content: content.trim(),
        parentId,
        authorId: req.user.userId as any,
        authorName: authorName || req.user.email || "User",
      });
      res.status(201).json({ success: true, message: "Comment added", data: comment });
    } catch (error) {
      next(error);
    }
  }

  async updateComment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      if (!req.body.content?.trim()) throw new BadRequestError("content is required");
      const comment = await this.discussionService.updateComment(
        String(req.params.id),
        req.user.userId,
        req.user.role,
        req.body.content.trim()
      );
      res.status(200).json({ success: true, message: "Comment updated", data: comment });
    } catch (error) {
      next(error);
    }
  }

  async deleteComment(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError("Authentication required");
      const comment = await this.discussionService.deleteComment(
        String(req.params.id),
        req.user.userId,
        req.user.role
      );
      res.status(200).json({ success: true, message: "Comment deleted", data: comment });
    } catch (error) {
      next(error);
    }
  }

  async getComments(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const comments = await this.discussionService.getComments(
        String(id),
        isStaffRole(req.user?.role)
      );
      res.status(200).json({ success: true, data: comments });
    } catch (error) {
      next(error);
    }
  }
}
