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

function favouritePayload(data: {
  isBookmarked: boolean;
  bookmarkCount: number;
  likeCount: number;
  dislikeCount: number;
  currentUserReaction: "like" | "dislike" | null;
}) {
  return {
    isFavourite: data.isBookmarked,
    isBookmarked: data.isBookmarked,
    bookmarkCount: data.bookmarkCount,
    favouriteCount: data.bookmarkCount,
    likeCount: data.likeCount,
    dislikeCount: data.dislikeCount,
    currentUserReaction: data.currentUserReaction,
  };
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
        data: {
          ...data,
          isFavourite: data.isBookmarked,
          favouriteCount: data.bookmarkCount,
        },
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
        data: favouritePayload(data),
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
        data: favouritePayload(data),
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
        message: "Added to favourites",
        data: favouritePayload(data),
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
        message: "Removed from favourites",
        data: favouritePayload(data),
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
        message: data.isBookmarked
          ? "Added to favourites"
          : "Removed from favourites",
        data: favouritePayload(data),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET favourites / bookmarks for the authenticated user.
   * Supports page, limit, search, difficulty, category, solved, accessType, sort.
   * When `paginated=1` or any filter/page param is present, returns { items, stats, filters } + meta.
   * Otherwise returns a flat array for backward compatibility with existing clients.
   */
  async listMyBookmarks(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required");

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
          message: "Favourites retrieved",
          data,
        });
        return;
      }

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
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required");

      const problemId = String(req.params.id);
      const data = await engagementService.toggleRevision(problemId, userId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: data.isRevision ? "Marked for revision" : "Revision removed",
        // Intentionally omit bookmark/reaction fields — revision must stay independent.
        data: {
          isRevision: data.isRevision,
        },
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
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required");

      const problemId = String(req.params.id);
      const data = await engagementService.removeRevision(problemId, userId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Revision removed",
        data: {
          isRevision: data.isRevision,
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
