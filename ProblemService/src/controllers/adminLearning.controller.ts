import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UserSheetProgress } from "../models/userSheetProgress.model";
import { UserProblemProgress } from "../models/userProblemProgress.model";
import { ProblemRevision } from "../models/problemRevision.model";
import { Problem } from "../models/problem.model";
import { Sheet } from "../models/sheet.model";

export class AdminLearningController {
  /** Cross-user sheet progress overview. */
  sheetProgressOverview = async (
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const sheets = await Sheet.find({ status: { $ne: "ARCHIVED" } })
        .select("sheetId title totalProblems status")
        .lean();

      const bySheet = await UserSheetProgress.aggregate([
        {
          $group: {
            _id: "$sheetId",
            users: { $sum: 1 },
            avgCompleted: { $avg: "$completedCached" },
            avgAttempted: { $avg: "$attemptedCached" },
            totalCompleted: { $sum: "$completedCached" },
            totalAttempted: { $sum: "$attemptedCached" },
          },
        },
      ]);

      const map = new Map(bySheet.map((r) => [String(r._id), r]));
      const rows = sheets.map((s: any) => {
        const agg = map.get(String(s.sheetId));
        const total = Number(s.totalProblems) || 0;
        const avgCompleted = agg?.avgCompleted || 0;
        const completionPct =
          total > 0
            ? Math.round((avgCompleted / total) * 1000) / 10
            : 0;
        return {
          sheetId: s.sheetId,
          title: s.title,
          status: s.status,
          totalProblems: total,
          usersWithProgress: agg?.users || 0,
          avgCompleted: Math.round(avgCompleted * 10) / 10,
          avgAttempted: Math.round((agg?.avgAttempted || 0) * 10) / 10,
          completionPct,
        };
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Sheet progress overview",
        data: rows,
      });
    } catch (e) {
      next(e);
    }
  };

  /** Topic engagement from UserProblemProgress + problem tags/category. */
  topicEngagement = async (
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const progress = await UserProblemProgress.find({})
        .select("problemId status")
        .lean();
      const problemIds = [
        ...new Set(progress.map((p) => String(p.problemId))),
      ];
      const problems = await Problem.find({ _id: { $in: problemIds } })
        .select("category tags difficulty")
        .lean();
      const pmap = new Map(
        problems.map((p: any) => [String(p._id), p])
      );

      const topicMap = new Map<
        string,
        { attempted: number; solved: number; problems: Set<string> }
      >();

      const bump = (topic: string, problemId: string, status: string) => {
        if (!topicMap.has(topic)) {
          topicMap.set(topic, {
            attempted: 0,
            solved: 0,
            problems: new Set(),
          });
        }
        const row = topicMap.get(topic)!;
        row.problems.add(problemId);
        if (status === "SOLVED") row.solved += 1;
        if (status === "ATTEMPTED" || status === "SOLVED") row.attempted += 1;
      };

      for (const pr of progress) {
        const pid = String(pr.problemId);
        const meta = pmap.get(pid);
        if (!meta) continue;
        const topics = [
          String(meta.category || "Uncategorized"),
          ...((meta.tags as string[]) || []).map(String),
        ];
        for (const t of topics) bump(t, pid, String(pr.status));
      }

      const rows = [...topicMap.entries()]
        .map(([topic, v]) => ({
          topic,
          problemCount: v.problems.size,
          attempted: v.attempted,
          solved: v.solved,
          solveRate:
            v.attempted > 0
              ? Math.round((v.solved / v.attempted) * 1000) / 10
              : 0,
        }))
        .sort((a, b) => b.attempted - a.attempted)
        .slice(0, 100);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Topic engagement",
        data: rows,
      });
    } catch (e) {
      next(e);
    }
  };

  /** Weak topics: low solve rate with meaningful attempts. */
  weakTopics = async (
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      // Reuse topic engagement then filter
      const progress = await UserProblemProgress.find({
        status: { $in: ["ATTEMPTED", "SOLVED"] },
      })
        .select("problemId status suggestedForRevision")
        .lean();
      const problemIds = [
        ...new Set(progress.map((p) => String(p.problemId))),
      ];
      const problems = await Problem.find({ _id: { $in: problemIds } })
        .select("category tags")
        .lean();
      const pmap = new Map(
        problems.map((p: any) => [String(p._id), p])
      );

      const topicMap = new Map<
        string,
        { attempted: number; solved: number; revisionHints: number }
      >();

      for (const pr of progress) {
        const meta = pmap.get(String(pr.problemId));
        if (!meta) continue;
        const topics = [
          String(meta.category || "Uncategorized"),
          ...((meta.tags as string[]) || []).map(String),
        ];
        for (const t of topics) {
          if (!topicMap.has(t)) {
            topicMap.set(t, { attempted: 0, solved: 0, revisionHints: 0 });
          }
          const row = topicMap.get(t)!;
          row.attempted += 1;
          if (pr.status === "SOLVED") row.solved += 1;
          if ((pr as any).suggestedForRevision) row.revisionHints += 1;
        }
      }

      const rows = [...topicMap.entries()]
        .map(([topic, v]) => {
          const solveRate =
            v.attempted > 0
              ? Math.round((v.solved / v.attempted) * 1000) / 10
              : 0;
          return {
            topic,
            attempted: v.attempted,
            solved: v.solved,
            solveRate,
            revisionHints: v.revisionHints,
          };
        })
        .filter((r) => r.attempted >= 5 && r.solveRate < 40)
        .sort((a, b) => a.solveRate - b.solveRate)
        .slice(0, 50);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Weak topics",
        data: rows,
      });
    } catch (e) {
      next(e);
    }
  };

  /** Platform revision list aggregates. */
  revisionSummary = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
      const byProblem = await ProblemRevision.aggregate([
        { $group: { _id: "$problemId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit },
      ]);

      const ids = byProblem.map((r) => r._id);
      const problems = await Problem.find({ _id: { $in: ids } })
        .select("title slug difficulty category tags")
        .lean();
      const pmap = new Map(
        problems.map((p: any) => [String(p._id), p])
      );

      const rows = byProblem.map((r) => {
        const p = pmap.get(String(r._id));
        return {
          problemId: String(r._id),
          title: p?.title || "Unknown",
          slug: p?.slug,
          difficulty: p?.difficulty,
          category: p?.category,
          revisionCount: r.count,
        };
      });

      const totalRevisions = await ProblemRevision.countDocuments({});
      const uniqueUsers = await ProblemRevision.distinct("userId");

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Revision summary",
        data: {
          totalRevisions,
          usersWithRevision: uniqueUsers.length,
          topProblems: rows,
        },
      });
    } catch (e) {
      next(e);
    }
  };
}

export const adminLearningController = new AdminLearningController();
