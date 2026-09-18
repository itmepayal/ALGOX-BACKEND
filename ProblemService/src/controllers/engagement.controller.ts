import { Response, NextFunction } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { engagementService } from "../services/engagement.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";
import { PERSONAL_CONFIDENCE } from "../models/userProblemProgress.model";

const reactionBodySchema = z.object({
  reaction: z.enum(["like", "dislike"]),
});

const confidenceBodySchema = z.object({
  confidence: z
    .enum([
      PERSONAL_CONFIDENCE.EASY_FOR_ME,
      PERSONAL_CONFIDENCE.NEEDS_PRACTICE,
      PERSONAL_CONFIDENCE.DIFFICULT,
    ])
    .nullable(),
});

function engagementPayload(data: Awaited<
  ReturnType<typeof engagementService.getEngagement>
>) {
  return {
    likeCount: data.likeCount,
    dislikeCount: data.dislikeCount,
    bookmarkCount: data.bookmarkCount,
    favoriteCount: data.favoriteCount,
    favouriteCount: data.favoriteCount,
    importantCount: data.importantCount,
    currentUserReaction: data.currentUserReaction,
    isBookmarked: data.isBookmarked,
    isFavourite: data.isFavourite,
    isImportant: data.isImportant,
    isRevision: data.isRevision,
    personalConfidence: data.personalConfidence,
  };
}

function requireUserId(req: AuthenticatedRequest): string {
  const userId = req.user?.userId;
  if (!userId) throw new UnauthorizedError("Authentication required");
  return userId;
}

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
        data: engagementPayload(data),
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
      const userId = requireUserId(req);
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
        data: engagementPayload(data),
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
      const userId = requireUserId(req);
      const problemId = String(req.params.id);
      const data = await engagementService.clearReaction(problemId, userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Reaction removed",
        data: engagementPayload(data),
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
      const userId = requireUserId(req);
      const problemId = String(req.params.id);
      const data = await engagementService.addBookmark(problemId, userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Bookmarked",
        data: engagementPayload(data),
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
      const userId = requireUserId(req);
      const problemId = String(req.params.id);
      const data = await engagementService.removeBookmark(problemId, userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Bookmark removed",
        data: engagementPayload(data),
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
      const userId = requireUserId(req);
      const problemId = String(req.params.id);
      const data = await engagementService.toggleBookmark(problemId, userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.isBookmarked ? "Bookmarked" : "Bookmark removed",
        data: engagementPayload(data),
      });
    } catch (error) {
      next(error);
    }
  }

  async addFavorite(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = requireUserId(req);
      const problemId = String(req.params.id);
      const data = await engagementService.addFavorite(problemId, userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Added to favourites",
        data: engagementPayload(data),
      });
    } catch (error) {
      next(error);
    }
  }

  async removeFavorite(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = requireUserId(req);
      const problemId = String(req.params.id);
      const data = await engagementService.removeFavorite(problemId, userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Removed from favourites",
        data: engagementPayload(data),
      });
    } catch (error) {
      next(error);
    }
  }

  async toggleFavorite(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = requireUserId(req);
      const problemId = String(req.params.id);
      const data = await engagementService.toggleFavorite(problemId, userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.isFavourite
          ? "Added to favourites"
          : "Removed from favourites",
        data: engagementPayload(data),
      });
    } catch (error) {
      next(error);
    }
  }

  async toggleImportant(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = requireUserId(req);
      const problemId = String(req.params.id);
      const data = await engagementService.toggleImportant(problemId, userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.isImportant ? "Marked important" : "Important removed",
        data: {
          isImportant: data.isImportant,
          importantCount: data.importantCount,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async setPersonalConfidence(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = requireUserId(req);
      const { confidence } = confidenceBodySchema.parse(req.body || {});
      const problemId = String(req.params.id);
      const data = await engagementService.setPersonalConfidence(
        problemId,
        userId,
        confidence
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Personal confidence updated",
        data: {
          personalConfidence: data.personalConfidence,
          problemId,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getPersonalizationSummary(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = requireUserId(req);
      const data = await engagementService.getPersonalizationSummary(userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Personalization summary retrieved",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET bookmarks for the authenticated user (flat or paged).
   */
  async listMyBookmarks(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = requireUserId(req);
      const q = req.query || {};
      const wantsPaged =
        q.paginated === "1" ||
        q.paginated === "true" ||
        q.page != null ||
        q.limit != null ||
        q.search != null ||
        q.difficulty != null ||
        q.category != null ||
        q.solved != null ||
        q.accessType != null ||
        q.sort != null;

      if (!wantsPaged) {
        const data = await engagementService.listBookmarkedProblems(userId);
        sendResponse({
          res,
          statusCode: HTTP_STATUS.OK,
          message: "Bookmarks retrieved",
          data,
        });
        return;
      }

      const result = await engagementService.listBookmarksPaged(userId, {
        page: q.page ? Number(q.page) : 1,
        limit: q.limit ? Number(q.limit) : 20,
        search: q.search ? String(q.search) : undefined,
        difficulty: q.difficulty ? String(q.difficulty) : undefined,
        category: q.category ? String(q.category) : undefined,
        solved: q.solved ? String(q.solved) : undefined,
        accessType: q.accessType ? String(q.accessType) : undefined,
        sort: q.sort ? String(q.sort) : undefined,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Bookmarks retrieved",
        data: {
          items: result.items,
          stats: result.stats,
          filters: result.filters,
        },
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET favourites — independent of bookmarks. */
  async listMyFavourites(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = requireUserId(req);
      const q = req.query || {};
      const result = await engagementService.listFavourites(userId, {
        page: q.page ? Number(q.page) : 1,
        limit: q.limit ? Number(q.limit) : 20,
        search: q.search ? String(q.search) : undefined,
        difficulty: q.difficulty ? String(q.difficulty) : undefined,
        category: q.category ? String(q.category) : undefined,
        solved: q.solved ? String(q.solved) : undefined,
        accessType: q.accessType ? String(q.accessType) : undefined,
        sort: q.sort ? String(q.sort) : undefined,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Favourites retrieved",
        data: {
          items: result.items,
          stats: result.stats,
          filters: result.filters,
        },
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async getFavouriteAnalytics(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await engagementService.getFavouriteAnalytics();
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Favourite analytics retrieved",
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
      const userId = requireUserId(req);
      const problemId = String(req.params.id);
      const data = await engagementService.toggleRevision(problemId, userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.isRevision ? "Marked for revision" : "Revision removed",
        data: { isRevision: data.isRevision },
      });
    } catch (error) {
      next(error);
    }
  }

  async addRevision(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = requireUserId(req);
      const problemId = String(req.params.id);
      const data = await engagementService.addRevision(problemId, userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Marked for revision",
        data: { isRevision: data.isRevision },
      });
    } catch (error) {
      next(error);
    }
  }

  async removeRevision(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = requireUserId(req);
      const problemId = String(req.params.id);
      const data = await engagementService.removeRevision(problemId, userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Revision removed",
        data: { isRevision: data.isRevision },
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
      const userId = requireUserId(req);
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

  async listMyImportantIds(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = requireUserId(req);
      const ids = await engagementService.listImportantProblemIds(userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Important problems retrieved",
        data: { problemIds: ids },
      });
    } catch (error) {
      next(error);
    }
  }

  async listMyFavoriteIds(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = requireUserId(req);
      const ids = await engagementService.listFavoriteProblemIds(userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Favourite ids retrieved",
        data: { problemIds: ids },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const engagementController = new EngagementController();
