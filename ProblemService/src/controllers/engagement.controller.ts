import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { engagementService } from "../services/engagement.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";

const reactionBodySchema = z.object({
  reaction: z.enum(["like", "dislike"]),
});

export class EngagementController {
  async getEngagement(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const problemId = String(req.params.id);
      const data = await engagementService.getEngagement(
        problemId,
        req.user?.userId
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Engagement retrieved",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async setReaction(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required");

      const { reaction } = reactionBodySchema.parse(req.body);
      const problemId = String(req.params.id);
      const data = await engagementService.setReaction(
        problemId,
        userId,
        reaction
      );

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Reaction updated",
        data: {
          likeCount: data.likeCount,
          dislikeCount: data.dislikeCount,
          currentUserReaction: data.currentUserReaction,
          isBookmarked: data.isBookmarked,
          bookmarkCount: data.bookmarkCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async clearReaction(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required");

      const problemId = String(req.params.id);
      const data = await engagementService.clearReaction(problemId, userId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Reaction removed",
        data: {
          likeCount: data.likeCount,
          dislikeCount: data.dislikeCount,
          currentUserReaction: data.currentUserReaction,
          isBookmarked: data.isBookmarked,
          bookmarkCount: data.bookmarkCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async addBookmark(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required");

      const problemId = String(req.params.id);
      const data = await engagementService.addBookmark(problemId, userId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Bookmarked",
        data: {
          isBookmarked: data.isBookmarked,
          bookmarkCount: data.bookmarkCount,
          likeCount: data.likeCount,
          dislikeCount: data.dislikeCount,
          currentUserReaction: data.currentUserReaction,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async removeBookmark(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required");

      const problemId = String(req.params.id);
      const data = await engagementService.removeBookmark(problemId, userId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Bookmark removed",
        data: {
          isBookmarked: data.isBookmarked,
          bookmarkCount: data.bookmarkCount,
          likeCount: data.likeCount,
          dislikeCount: data.dislikeCount,
          currentUserReaction: data.currentUserReaction,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async toggleBookmark(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required");

      const problemId = String(req.params.id);
      const data = await engagementService.toggleBookmark(problemId, userId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.isBookmarked ? "Bookmarked" : "Bookmark removed",
        data: {
          isBookmarked: data.isBookmarked,
          bookmarkCount: data.bookmarkCount,
          likeCount: data.likeCount,
          dislikeCount: data.dislikeCount,
          currentUserReaction: data.currentUserReaction,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async listMyBookmarks(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required");

      const data = await engagementService.listBookmarkedProblems(userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Bookmarks retrieved",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async toggleRevision(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required");

      const problemId = String(req.params.id);
      const data = await engagementService.toggleRevision(problemId, userId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.isRevision ? "Marked for revision" : "Revision removed",
        data: {
          isRevision: data.isRevision,
          isBookmarked: data.isBookmarked,
          likeCount: data.likeCount,
          dislikeCount: data.dislikeCount,
          currentUserReaction: data.currentUserReaction,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async listMyRevisions(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required");

      const ids = await engagementService.listRevisionProblemIds(userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Revisions retrieved",
        data: { problemIds: ids },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const engagementController = new EngagementController();
