import mongoose from "mongoose";
import { Problem } from "../models/problem.model";
import {
  ProblemReaction,
  ReactionType,
} from "../models/problemReaction.model";
import { ProblemBookmark } from "../models/problemBookmark.model";
import { ProblemRevision } from "../models/problemRevision.model";
import { BadRequestError, NotFoundError } from "../utils/errors/app.error";
import logger from "../config/logger.config";

export interface EngagementState {
  likeCount: number;
  dislikeCount: number;
  bookmarkCount: number;
  currentUserReaction: "like" | "dislike" | null;
  isBookmarked: boolean;
  isRevision: boolean;
}

function clampNonNeg(n: number): number {
  return Math.max(0, n | 0);
}

async function ensureProblemExists(problemId: string) {
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    throw new BadRequestError("Invalid problem id");
  }
  const exists = await Problem.exists({ _id: problemId });
  if (!exists) throw new NotFoundError("Problem not found");
}

async function readCounts(problemId: string): Promise<{
  likeCount: number;
  dislikeCount: number;
  bookmarkCount: number;
}> {
  const problem = await Problem.findById(problemId)
    .select("likeCount dislikeCount bookmarkCount")
    .lean();
  return {
    likeCount: clampNonNeg((problem as any)?.likeCount ?? 0),
    dislikeCount: clampNonNeg((problem as any)?.dislikeCount ?? 0),
    bookmarkCount: clampNonNeg((problem as any)?.bookmarkCount ?? 0),
  };
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
    let isRevision = false;

    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      const [reaction, bookmark, revision] = await Promise.all([
        ProblemReaction.findOne({ userId, problemId }).lean(),
        ProblemBookmark.findOne({ userId, problemId }).lean(),
        ProblemRevision.findOne({ userId, problemId }).lean(),
      ]);
      currentUserReaction = (reaction?.reaction as ReactionType) || null;
      isBookmarked = Boolean(bookmark);
      isRevision = Boolean(revision);
    }

    return {
      ...counts,
      currentUserReaction,
      isBookmarked,
      isRevision,
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
    await ensureProblemExists(problemId);
    try {
      await ProblemBookmark.create({ userId, problemId });
      await Problem.findByIdAndUpdate(problemId, {
        $inc: { bookmarkCount: 1 },
      });
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
    }
    return this.getEngagement(problemId, userId);
  }

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
      await Problem.findByIdAndUpdate(problemId, {
        $inc: { bookmarkCount: -1 },
      });
      await Problem.updateOne(
        { _id: problemId, bookmarkCount: { $lt: 0 } },
        { $set: { bookmarkCount: 0 } }
      );
    }
    return this.getEngagement(problemId, userId);
  }

  async toggleBookmark(
    problemId: string,
    userId: string
  ): Promise<EngagementState> {
    const existing = await ProblemBookmark.findOne({ userId, problemId });
    if (existing) return this.removeBookmark(problemId, userId);
    return this.addBookmark(problemId, userId);
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

  async listBookmarkedProblems(userId: string) {
    const ids = await this.listBookmarkedProblemIds(userId);
    if (ids.length === 0) return [];

    const problems = await Problem.find({ _id: { $in: ids } }).lean();
    const byId = new Map(problems.map((p: any) => [p._id.toString(), p]));

    return ids
      .map((id) => {
        const p = byId.get(id);
        if (!p) return null;
        return {
          ...p,
          id,
          _id: id,
          isBookmarked: true,
          likeCount: clampNonNeg(p.likeCount ?? 0),
          dislikeCount: clampNonNeg(p.dislikeCount ?? 0),
          testcases: Array.isArray(p.testcases)
            ? p.testcases.filter((tc: any) => !tc.isHidden)
            : [],
        };
      })
      .filter(Boolean);
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
}

export const engagementService = new EngagementService();
