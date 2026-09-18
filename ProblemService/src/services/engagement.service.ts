import mongoose from "mongoose";
import { Problem } from "../models/problem.model";
import {
  ProblemReaction,
  ReactionType,
} from "../models/problemReaction.model";
import { ProblemBookmark } from "../models/problemBookmark.model";
import { ProblemFavorite } from "../models/problemFavorite.model";
import { ProblemImportant } from "../models/problemImportant.model";
import { ProblemRevision } from "../models/problemRevision.model";
import {
  UserProblemProgress,
  type PersonalConfidence,
  PERSONAL_CONFIDENCE,
} from "../models/userProblemProgress.model";
import {
  PROBLEM_PROGRESS_STATUS,
  type ProblemProgressStatus,
} from "../constants/progressStatus";
import { BadRequestError, NotFoundError } from "../utils/errors/app.error";
import logger from "../config/logger.config";

export interface EngagementState {
  likeCount: number;
  dislikeCount: number;
  bookmarkCount: number;
  favoriteCount: number;
  importantCount: number;
  currentUserReaction: "like" | "dislike" | null;
  isBookmarked: boolean;
  /** Independent of bookmark — preferred problems. */
  isFavourite: boolean;
  isImportant: boolean;
  isRevision: boolean;
  /** Personal confidence; null if unset. Does not alter official difficulty. */
  personalConfidence: PersonalConfidence | null;
}

export interface FavouriteListQuery {
  page?: number;
  limit?: number;
  search?: string;
  difficulty?: string;
  category?: string;
  /** all | solved | attempted | unsolved */
  solved?: string;
  /** all | free | premium — based on resources[].isPremium */
  accessType?: string;
  /** recent | oldest | title_asc | title_desc | difficulty */
  sort?: string;
}

const DIFFICULTY_RANK: Record<string, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

const CONFIDENCE_VALUES = new Set<string>(Object.values(PERSONAL_CONFIDENCE));

function clampNonNeg(n: number): number {
  return Math.max(0, n | 0);
}

function isPremiumProblem(p: any): boolean {
  if (Boolean(p?.isPremium)) return true;
  return Array.isArray(p?.resources) && p.resources.some((r: any) => r?.isPremium);
}

function sanitizePublicProblem(
  p: any,
  markedAt?: Date | string | null,
  flags?: { isBookmarked?: boolean; isFavourite?: boolean; isImportant?: boolean }
) {
  const id = p._id?.toString?.() || String(p._id || p.id);
  return {
    id,
    _id: id,
    title: p.title,
    slug: p.slug,
    difficulty: p.difficulty,
    category: p.category,
    tags: Array.isArray(p.tags) ? p.tags : [],
    resources: Array.isArray(p.resources)
      ? p.resources.map((r: any) => ({
          type: r.type,
          url: r.url,
          label: r.label,
          isPremium: Boolean(r.isPremium),
        }))
      : [],
    likeCount: clampNonNeg(p.likeCount ?? 0),
    dislikeCount: clampNonNeg(p.dislikeCount ?? 0),
    bookmarkCount: clampNonNeg(p.bookmarkCount ?? 0),
    favoriteCount: clampNonNeg(p.favoriteCount ?? 0),
    importantCount: clampNonNeg(p.importantCount ?? 0),
    isBookmarked: Boolean(flags?.isBookmarked),
    isFavourite: Boolean(flags?.isFavourite),
    isImportant: Boolean(flags?.isImportant),
    isPremium: isPremiumProblem(p),
    favouritedAt: markedAt || null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

async function ensureProblemExists(problemId: string) {
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    throw new BadRequestError("Invalid problem id");
  }
  const exists = await Problem.exists({ _id: problemId });
  if (!exists) throw new NotFoundError("Problem not found");
}

/** Favouriting is only allowed for publicly available problems. */
async function ensureProblemFavouritable(problemId: string) {
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    throw new BadRequestError("Invalid problem id");
  }
  const problem = await Problem.findById(problemId).select("status").lean();
  if (!problem) throw new NotFoundError("Problem not found");
  const status = (problem as any).status;
  if (status && status !== "published") {
    throw new BadRequestError("Problem is not available");
  }
}

async function readCounts(problemId: string): Promise<{
  likeCount: number;
  dislikeCount: number;
  bookmarkCount: number;
  favoriteCount: number;
  importantCount: number;
}> {
  const problem = await Problem.findById(problemId)
    .select("likeCount dislikeCount bookmarkCount favoriteCount importantCount")
    .lean();
  return {
    likeCount: clampNonNeg((problem as any)?.likeCount ?? 0),
    dislikeCount: clampNonNeg((problem as any)?.dislikeCount ?? 0),
    bookmarkCount: clampNonNeg((problem as any)?.bookmarkCount ?? 0),
    favoriteCount: clampNonNeg((problem as any)?.favoriteCount ?? 0),
    importantCount: clampNonNeg((problem as any)?.importantCount ?? 0),
  };
}

async function bumpCounter(
  problemId: string,
  field: "bookmarkCount" | "favoriteCount" | "importantCount",
  delta: number
) {
  if (delta === 0) return;
  await Problem.findByIdAndUpdate(problemId, { $inc: { [field]: delta } });
  await Problem.updateOne(
    { _id: problemId, [field]: { $lt: 0 } },
    { $set: { [field]: 0 } }
  );
}

export class EngagementService {
  async getEngagement(
    problemId: string,
    userId?: string | null
  ): Promise<EngagementState> {
    await ensureProblemExists(problemId);
    const counts = await readCounts(problemId);

    let currentUserReaction: "like" | "dislike" | null = null;
    let isBookmarked = false;
    let isFavourite = false;
    let isImportant = false;
    let isRevision = false;
    let personalConfidence: PersonalConfidence | null = null;

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const [reaction, bookmark, favorite, important, revision, progress] =
        await Promise.all([
          ProblemReaction.findOne({ userId, problemId }).lean(),
          ProblemBookmark.findOne({ userId, problemId }).lean(),
          ProblemFavorite.findOne({ userId, problemId }).lean(),
          ProblemImportant.findOne({ userId, problemId }).lean(),
          ProblemRevision.findOne({ userId, problemId }).lean(),
          UserProblemProgress.findOne({ userId: String(userId), problemId })
            .select("personalConfidence")
            .lean(),
        ]);
      currentUserReaction = (reaction?.reaction as ReactionType) || null;
      isBookmarked = Boolean(bookmark);
      isFavourite = Boolean(favorite);
      isImportant = Boolean(important);
      isRevision = Boolean(revision);
      const conf = (progress as any)?.personalConfidence;
      personalConfidence =
        conf && CONFIDENCE_VALUES.has(String(conf))
          ? (String(conf) as PersonalConfidence)
          : null;
    }

    return {
      ...counts,
      currentUserReaction,
      isBookmarked,
      isFavourite,
      isImportant,
      isRevision,
      personalConfidence,
    };
  }

  async setReaction(
    problemId: string,
    userId: string,
    reaction: ReactionType
  ): Promise<EngagementState> {
    await ensureProblemExists(problemId);
    if (reaction !== "like" && reaction !== "dislike") {
      throw new BadRequestError('reaction must be "like" or "dislike"');
    }

    const existing = await ProblemReaction.findOne({ userId, problemId });
    const prev = existing?.reaction as ReactionType | undefined;

    let likeDelta = 0;
    let dislikeDelta = 0;
    let nextReaction: ReactionType | null = reaction;

    if (!prev) {
      try {
        await ProblemReaction.create({ userId, problemId, reaction });
        if (reaction === "like") likeDelta = 1;
        else dislikeDelta = 1;
      } catch (err: any) {
        if (err?.code === 11000) {
          return this.getEngagement(problemId, userId);
        }
        throw err;
      }
    } else if (prev === reaction) {
      nextReaction = null;
      if (prev === "like") likeDelta = -1;
      else dislikeDelta = -1;
      await ProblemReaction.deleteOne({ userId, problemId });
    } else {
      if (prev === "like") {
        likeDelta = -1;
        dislikeDelta = 1;
      } else {
        dislikeDelta = -1;
        likeDelta = 1;
      }
      existing!.reaction = reaction;
      await existing!.save();
    }

    if (likeDelta !== 0 || dislikeDelta !== 0) {
      await Problem.findByIdAndUpdate(problemId, {
        $inc: {
          ...(likeDelta !== 0 ? { likeCount: likeDelta } : {}),
          ...(dislikeDelta !== 0 ? { dislikeCount: dislikeDelta } : {}),
        },
      });
      await Problem.updateOne(
        { _id: problemId, likeCount: { $lt: 0 } },
        { $set: { likeCount: 0 } }
      );
      await Problem.updateOne(
        { _id: problemId, dislikeCount: { $lt: 0 } },
        { $set: { dislikeCount: 0 } }
      );
    }

    logger.info("Reaction updated", {
      problemId,
      userId,
      prev: prev || null,
      next: nextReaction,
    });

    return this.getEngagement(problemId, userId);
  }

  async clearReaction(
    problemId: string,
    userId: string
  ): Promise<EngagementState> {
    await ensureProblemExists(problemId);
    const existing = await ProblemReaction.findOneAndDelete({
      userId,
      problemId,
    });

    if (existing) {
      const field =
        existing.reaction === "like" ? "likeCount" : "dislikeCount";
      await Problem.findByIdAndUpdate(problemId, { $inc: { [field]: -1 } });
      await Problem.updateOne(
        { _id: problemId, [field]: { $lt: 0 } },
        { $set: { [field]: 0 } }
      );
    }

    return this.getEngagement(problemId, userId);
  }

  async addBookmark(
    problemId: string,
    userId: string
  ): Promise<EngagementState> {
    await ensureProblemFavouritable(problemId);
    try {
      await ProblemBookmark.create({ userId, problemId });
      await bumpCounter(problemId, "bookmarkCount", 1);
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
    }
    return this.getEngagement(problemId, userId);
  }

  /**
   * Remove bookmark only. Never touches Favourite / Important / Revision.
   */
  async removeBookmark(
    problemId: string,
    userId: string
  ): Promise<EngagementState> {
    await ensureProblemExists(problemId);
    const removed = await ProblemBookmark.findOneAndDelete({
      userId,
      problemId,
    });
    if (removed) {
      await bumpCounter(problemId, "bookmarkCount", -1);
    }
    return this.getEngagement(problemId, userId);
  }

  async toggleBookmark(
    problemId: string,
    userId: string
  ): Promise<EngagementState> {
    await ensureProblemFavouritable(problemId);
    const existing = await ProblemBookmark.findOne({ userId, problemId });
    if (existing) return this.removeBookmark(problemId, userId);
    return this.addBookmark(problemId, userId);
  }

  async addFavorite(
    problemId: string,
    userId: string
  ): Promise<EngagementState> {
    await ensureProblemFavouritable(problemId);
    try {
      await ProblemFavorite.create({ userId, problemId });
      await bumpCounter(problemId, "favoriteCount", 1);
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
    }
    return this.getEngagement(problemId, userId);
  }

  async removeFavorite(
    problemId: string,
    userId: string
  ): Promise<EngagementState> {
    await ensureProblemExists(problemId);
    const removed = await ProblemFavorite.findOneAndDelete({
      userId,
      problemId,
    });
    if (removed) {
      await bumpCounter(problemId, "favoriteCount", -1);
    }
    return this.getEngagement(problemId, userId);
  }

  async toggleFavorite(
    problemId: string,
    userId: string
  ): Promise<EngagementState> {
    await ensureProblemFavouritable(problemId);
    const existing = await ProblemFavorite.findOne({ userId, problemId });
    if (existing) return this.removeFavorite(problemId, userId);
    return this.addFavorite(problemId, userId);
  }

  async addImportant(
    problemId: string,
    userId: string
  ): Promise<EngagementState> {
    await ensureProblemExists(problemId);
    try {
      await ProblemImportant.create({ userId, problemId });
      await bumpCounter(problemId, "importantCount", 1);
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
    }
    return this.getEngagement(problemId, userId);
  }

  async removeImportant(
    problemId: string,
    userId: string
  ): Promise<EngagementState> {
    await ensureProblemExists(problemId);
    const removed = await ProblemImportant.findOneAndDelete({
      userId,
      problemId,
    });
    if (removed) {
      await bumpCounter(problemId, "importantCount", -1);
    }
    return this.getEngagement(problemId, userId);
  }

  async toggleImportant(
    problemId: string,
    userId: string
  ): Promise<EngagementState> {
    await ensureProblemExists(problemId);
    const existing = await ProblemImportant.findOne({ userId, problemId });
    if (existing) return this.removeImportant(problemId, userId);
    return this.addImportant(problemId, userId);
  }

  /**
   * Set personal confidence. Pass null to clear.
   * Does not modify official problem.difficulty.
   */
  async setPersonalConfidence(
    problemId: string,
    userId: string,
    confidence: PersonalConfidence | null
  ): Promise<EngagementState> {
    await ensureProblemExists(problemId);
    if (confidence !== null && !CONFIDENCE_VALUES.has(confidence)) {
      throw new BadRequestError(
        'confidence must be "easy_for_me", "needs_practice", "difficult", or null'
      );
    }
    await UserProblemProgress.findOneAndUpdate(
      { userId: String(userId), problemId: String(problemId) },
      {
        $set: {
          personalConfidence: confidence,
          source: "manual",
        },
        $setOnInsert: {
          status: PROBLEM_PROGRESS_STATUS.NOT_STARTED,
          totalSubmissions: 0,
          acceptedSubmissions: 0,
          imported: false,
          suggestedForRevision: false,
        },
      },
      { upsert: true, returnDocument: "after" }
    );
    return this.getEngagement(problemId, userId);
  }

  async addRevision(problemId: string, userId: string): Promise<EngagementState> {
    await ensureProblemExists(problemId);
    try {
      await ProblemRevision.create({ userId, problemId });
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
    }
    return this.getEngagement(problemId, userId);
  }

  /**
   * Remove revision only. Never touches Bookmark / Favourite / Important.
   */
  async removeRevision(
    problemId: string,
    userId: string
  ): Promise<EngagementState> {
    await ensureProblemExists(problemId);
    await ProblemRevision.findOneAndDelete({ userId, problemId });
    return this.getEngagement(problemId, userId);
  }

  async toggleRevision(
    problemId: string,
    userId: string
  ): Promise<EngagementState> {
    const existing = await ProblemRevision.findOne({ userId, problemId });
    if (existing) return this.removeRevision(problemId, userId);
    return this.addRevision(problemId, userId);
  }

  async listRevisionProblemIds(userId: string): Promise<string[]> {
    const rows = await ProblemRevision.find({ userId })
      .select("problemId")
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((r) => r.problemId.toString());
  }

  async listBookmarkedProblemIds(userId: string): Promise<string[]> {
    const rows = await ProblemBookmark.find({ userId })
      .select("problemId")
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((r) => r.problemId.toString());
  }

  async listFavoriteProblemIds(userId: string): Promise<string[]> {
    const rows = await ProblemFavorite.find({ userId })
      .select("problemId")
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((r) => r.problemId.toString());
  }

  async listImportantProblemIds(userId: string): Promise<string[]> {
    const rows = await ProblemImportant.find({ userId })
      .select("problemId")
      .sort({ createdAt: -1 })
      .lean();
    return rows.map((r) => r.problemId.toString());
  }

  /** Real counts for My Problems hub — never hardcoded. */
  async getPersonalizationSummary(userId: string) {
    const [
      bookmarked,
      favourites,
      important,
      revision,
      difficult,
      needsPractice,
    ] = await Promise.all([
      ProblemBookmark.countDocuments({ userId }),
      ProblemFavorite.countDocuments({ userId }),
      ProblemImportant.countDocuments({ userId }),
      ProblemRevision.countDocuments({ userId }),
      UserProblemProgress.countDocuments({
        userId: String(userId),
        personalConfidence: PERSONAL_CONFIDENCE.DIFFICULT,
      }),
      UserProblemProgress.countDocuments({
        userId: String(userId),
        personalConfidence: PERSONAL_CONFIDENCE.NEEDS_PRACTICE,
      }),
    ]);
    return {
      bookmarked,
      favourites,
      important,
      revision,
      difficult,
      needsPractice,
    };
  }

  /**
   * Paginated list for a mark collection (favourites or bookmarks).
   */
  private async listMarkedProblems(
    userId: string,
    mark: "favourite" | "bookmark" | "important",
    query: FavouriteListQuery = {}
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const search = String(query.search || "").trim();
    const difficulty = String(query.difficulty || "")
      .trim()
      .toLowerCase();
    const category = String(query.category || "").trim();
    const solvedFilter = String(query.solved || "all").trim().toLowerCase();
    const accessType = String(query.accessType || "all")
      .trim()
      .toLowerCase();
    const sort = String(query.sort || "recent").trim().toLowerCase();

    const Model =
      mark === "favourite"
        ? ProblemFavorite
        : mark === "important"
          ? ProblemImportant
          : ProblemBookmark;

    const marks = await Model.find({ userId })
      .select("problemId createdAt")
      .lean();

    const emptyStats = {
      total: 0,
      solved: 0,
      unsolved: 0,
      attempted: 0,
      easy: 0,
      medium: 0,
      hard: 0,
    };

    if (!marks.length) {
      return {
        items: [] as any[],
        meta: { total: 0, page, limit, totalPages: 0 },
        stats: emptyStats,
        filters: { categories: [] as string[] },
      };
    }

    const markedAtById = new Map(
      marks.map((b) => [b.problemId.toString(), b.createdAt])
    );
    const ids = marks.map((b) => b.problemId);

    const problems = await Problem.find({
      _id: { $in: ids },
      $or: [{ status: "published" }, { status: { $exists: false } }],
    })
      .select(
        "title slug difficulty category tags resources likeCount dislikeCount bookmarkCount favoriteCount importantCount createdAt updatedAt"
      )
      .lean();

    const idStrings = problems.map((p: any) => p._id.toString());
    const progressRows = await UserProblemProgress.find({
      userId: String(userId),
      problemId: { $in: idStrings },
    })
      .select("problemId status personalConfidence")
      .lean();

    const progressById = new Map(
      progressRows.map((r) => [
        String(r.problemId),
        (r.status || PROBLEM_PROGRESS_STATUS.NOT_STARTED) as ProblemProgressStatus,
      ])
    );

    type Row = ReturnType<typeof sanitizePublicProblem> & {
      progressStatus: ProblemProgressStatus;
      solvedStatus: "solved" | "attempted" | "unsolved";
      personalConfidence: PersonalConfidence | null;
    };

    let rows: Row[] = problems.map((p: any) => {
      const id = p._id.toString();
      const progressStatus =
        progressById.get(id) || PROBLEM_PROGRESS_STATUS.NOT_STARTED;
      const solvedStatus =
        progressStatus === PROBLEM_PROGRESS_STATUS.SOLVED
          ? ("solved" as const)
          : progressStatus === PROBLEM_PROGRESS_STATUS.ATTEMPTED
            ? ("attempted" as const)
            : ("unsolved" as const);
      const prog = progressRows.find((r) => String(r.problemId) === id) as any;
      const conf = prog?.personalConfidence;
      return {
        ...sanitizePublicProblem(p, markedAtById.get(id) || null, {
          isBookmarked: mark === "bookmark",
          isFavourite: mark === "favourite",
          isImportant: mark === "important",
        }),
        progressStatus,
        solvedStatus,
        personalConfidence:
          conf && CONFIDENCE_VALUES.has(String(conf))
            ? (String(conf) as PersonalConfidence)
            : null,
      };
    });

    const categories = [
      ...new Set(
        rows
          .map((r) => String(r.category || "").trim())
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b));

    const stats = {
      total: rows.length,
      solved: rows.filter((r) => r.solvedStatus === "solved").length,
      attempted: rows.filter((r) => r.solvedStatus === "attempted").length,
      unsolved: rows.filter((r) => r.solvedStatus === "unsolved").length,
      easy: rows.filter((r) => String(r.difficulty).toLowerCase() === "easy")
        .length,
      medium: rows.filter(
        (r) => String(r.difficulty).toLowerCase() === "medium"
      ).length,
      hard: rows.filter((r) => String(r.difficulty).toLowerCase() === "hard")
        .length,
    };

    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      rows = rows.filter(
        (r) =>
          re.test(r.title || "") ||
          re.test(r.slug || "") ||
          re.test(r.category || "") ||
          (r.tags || []).some((t: string) => re.test(String(t)))
      );
    }

    if (difficulty && difficulty !== "all") {
      rows = rows.filter(
        (r) => String(r.difficulty).toLowerCase() === difficulty
      );
    }

    if (category && category.toLowerCase() !== "all") {
      const catRe = new RegExp(
        category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      );
      rows = rows.filter((r) => catRe.test(String(r.category || "")));
    }

    if (solvedFilter === "solved") {
      rows = rows.filter((r) => r.solvedStatus === "solved");
    } else if (solvedFilter === "attempted") {
      rows = rows.filter((r) => r.solvedStatus === "attempted");
    } else if (solvedFilter === "unsolved") {
      rows = rows.filter((r) => r.solvedStatus === "unsolved");
    }

    if (accessType === "premium") {
      rows = rows.filter((r) => r.isPremium);
    } else if (accessType === "free") {
      rows = rows.filter((r) => !r.isPremium);
    }

    rows.sort((a, b) => {
      switch (sort) {
        case "oldest": {
          const ta = a.favouritedAt
            ? new Date(a.favouritedAt).getTime()
            : 0;
          const tb = b.favouritedAt
            ? new Date(b.favouritedAt).getTime()
            : 0;
          return ta - tb;
        }
        case "title_asc":
          return String(a.title).localeCompare(String(b.title));
        case "title_desc":
          return String(b.title).localeCompare(String(a.title));
        case "difficulty": {
          const da =
            DIFFICULTY_RANK[String(a.difficulty).toLowerCase()] ?? 99;
          const db =
            DIFFICULTY_RANK[String(b.difficulty).toLowerCase()] ?? 99;
          if (da !== db) return da - db;
          return String(a.title).localeCompare(String(b.title));
        }
        case "recent":
        default: {
          const ta = a.favouritedAt
            ? new Date(a.favouritedAt).getTime()
            : 0;
          const tb = b.favouritedAt
            ? new Date(b.favouritedAt).getTime()
            : 0;
          return tb - ta;
        }
      }
    });

    const total = rows.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const start = (page - 1) * limit;
    const items = rows.slice(start, start + limit);

    return {
      items,
      meta: { total, page, limit, totalPages },
      stats,
      filters: { categories },
    };
  }

  /**
   * Paginated favourites (ProblemFavorite — independent of bookmarks).
   */
  async listFavourites(userId: string, query: FavouriteListQuery = {}) {
    return this.listMarkedProblems(userId, "favourite", query);
  }

  async listBookmarksPaged(userId: string, query: FavouriteListQuery = {}) {
    return this.listMarkedProblems(userId, "bookmark", query);
  }

  async listImportantPaged(userId: string, query: FavouriteListQuery = {}) {
    return this.listMarkedProblems(userId, "important", query);
  }

  /** Backward-compatible flat list of bookmarks. */
  async listBookmarkedProblems(userId: string) {
    const result = await this.listBookmarksPaged(userId, {
      page: 1,
      limit: 500,
      sort: "recent",
    });
    return result.items;
  }

  async getBookmarkSetForUser(
    userId: string,
    problemIds: string[]
  ): Promise<Set<string>> {
    if (!problemIds.length) return new Set();
    const rows = await ProblemBookmark.find({
      userId,
      problemId: { $in: problemIds },
    })
      .select("problemId")
      .lean();
    return new Set(rows.map((r) => r.problemId.toString()));
  }

  /** Admin analytics — most bookmarked / favourited / important (real counters). */
  async getMostFavourited(limit = 10) {
    const take = Math.min(50, Math.max(1, Number(limit) || 10));
    const rows = await Problem.find({
      $and: [
        { $or: [{ status: "published" }, { status: { $exists: false } }] },
        {
          $or: [
            { bookmarkCount: { $gt: 0 } },
            { favoriteCount: { $gt: 0 } },
            { importantCount: { $gt: 0 } },
          ],
        },
      ],
    })
      .select(
        "title slug difficulty category bookmarkCount favoriteCount importantCount resources"
      )
      .sort({ favoriteCount: -1, bookmarkCount: -1 })
      .limit(take)
      .lean();

    return rows.map((p: any) => ({
      id: p._id.toString(),
      title: p.title,
      slug: p.slug,
      difficulty: p.difficulty,
      category: p.category,
      favouriteCount: clampNonNeg(p.favoriteCount ?? 0),
      bookmarkCount: clampNonNeg(p.bookmarkCount ?? 0),
      importantCount: clampNonNeg(p.importantCount ?? 0),
      isPremium: isPremiumProblem(p),
    }));
  }

  /** Admin analytics — daily favourite creates over the last N days. */
  async getFavouriteTrends(days = 30) {
    const takeDays = Math.min(90, Math.max(1, Number(days) || 30));
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (takeDays - 1));

    const rows = await ProblemFavorite.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const byDate = new Map(rows.map((r) => [String(r._id), Number(r.count)]));
    const series: { date: string; count: number }[] = [];
    for (let i = 0; i < takeDays; i++) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      series.push({ date: key, count: byDate.get(key) || 0 });
    }
    return series;
  }

  async getFavouriteAnalytics() {
    const [mostFavourited, trends, totals] = await Promise.all([
      this.getMostFavourited(10),
      this.getFavouriteTrends(30),
      Promise.all([
        ProblemBookmark.countDocuments({}),
        ProblemFavorite.countDocuments({}),
        ProblemImportant.countDocuments({}),
        ProblemRevision.countDocuments({}),
      ]),
    ]);

    const [bookmarkTotal, favoriteTotal, importantTotal, revisionTotal] =
      totals;

    let freeFavourites = 0;
    let premiumFavourites = 0;
    for (const p of mostFavourited) {
      if (p.isPremium) premiumFavourites += p.favouriteCount;
      else freeFavourites += p.favouriteCount;
    }

    return {
      mostFavourited,
      trends,
      freeFavourites,
      premiumFavourites,
      mostFavouritedFree: mostFavourited.filter((p) => !p.isPremium),
      mostFavouritedPremium: mostFavourited.filter((p) => p.isPremium),
      aggregates: {
        bookmarks: bookmarkTotal,
        favourites: favoriteTotal,
        important: importantTotal,
        revision: revisionTotal,
      },
    };
  }
}

export const engagementService = new EngagementService();
