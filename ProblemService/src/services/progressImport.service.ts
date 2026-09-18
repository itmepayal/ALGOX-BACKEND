import fs from "fs";
import path from "path";
import axios from "axios";
import { AnyBulkWriteOperation } from "mongoose";
import { serverConfig } from "../config";
import {
  deriveProblemProgressStatus,
  isOfficialAcceptedSubmission,
  PROBLEM_PROGRESS_STATUS,
  type ProblemProgressStatus,
} from "../constants/progressStatus";
import { FALLBACK_SHEETS } from "../constants/sheets";
import { Problem } from "../models/problem.model";
import { ProgressImportLog } from "../models/progressImportLog.model";
import {
  IUserProblemProgress,
  UserProblemProgress,
} from "../models/userProblemProgress.model";
import { UserSheetProgress } from "../models/userSheetProgress.model";
import { ConflictError, UnauthorizedError } from "../utils/errors/app.error";
import { sheetService } from "./sheet.service";

export type ImportSubmissionRow = {
  problemId: string;
  status?: string;
  source?: string;
  executionTime?: number;
  memory?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

export type ProblemAgg = {
  problemId: string;
  status: ProblemProgressStatus;
  totalSubmissions: number;
  acceptedSubmissions: number;
  firstAttemptAt: Date | null;
  lastAttemptAt: Date | null;
  solvedAt: Date | null;
  bestRuntime: number | null;
  bestMemory: number | null;
  suggestedForRevision: boolean;
};

export type ProgressImportPreview = {
  totalSubmissions: number;
  uniqueProblems: number;
  solvedProblems: number;
  attemptedProblems: number;
  alreadyImportedProblems: number;
  newProblems: number;
  affectedSheets: number;
  revisionItemsAffected: number;
  activityDays: number;
  lastSubmissionAt: string | null;
  estimatedChanges: {
    progressUpserts: number;
    sheetSyncs: number;
    weakProblemFlags: number;
  };
};

export type ProgressImportResult = ProgressImportPreview & {
  updatedProblems: number;
  sheetsSynced: Array<{
    sheetId: string;
    sheetName: string;
    solvedInSheet: number;
    attemptedInSheet: number;
    totalInSheet: number;
  }>;
  dashboard: {
    solvedProblems: number;
    attemptedProblems: number;
    uniqueProblems: number;
    totalSubmissions: number;
  };
  activity: {
    activeDays: number;
    lastActivityAt: string | null;
  };
  lastImportedAt: string;
};

type SheetCatalog = {
  sheetId: string;
  name: string;
  problemIds: Set<string>;
  total: number;
};

const importingUsers = new Set<string>();

function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}


function aggregateByProblem(rows: ImportSubmissionRow[]): Map<string, ProblemAgg> {
  const byProblem = new Map<string, ImportSubmissionRow[]>();
  for (const row of rows) {
    if (!row.problemId) continue;
    const list = byProblem.get(row.problemId) || [];
    list.push(row);
    byProblem.set(row.problemId, list);
  }

  const out = new Map<string, ProblemAgg>();
  for (const [problemId, list] of byProblem) {
    const status = deriveProblemProgressStatus(list);
    let firstAttemptAt: Date | null = null;
    let lastAttemptAt: Date | null = null;
    let solvedAt: Date | null = null;
    let acceptedSubmissions = 0;
    let bestRuntime: number | null = null;
    let bestMemory: number | null = null;

    for (const s of list) {
      const created = toDate(s.createdAt) || toDate(s.updatedAt);
      if (created) {
        if (!firstAttemptAt || created < firstAttemptAt) firstAttemptAt = created;
        if (!lastAttemptAt || created > lastAttemptAt) lastAttemptAt = created;
      }
      if (isOfficialAcceptedSubmission(s)) {
        acceptedSubmissions += 1;
        if (created && (!solvedAt || created < solvedAt)) solvedAt = created;
        if (typeof s.executionTime === "number") {
          if (bestRuntime === null || s.executionTime < bestRuntime) {
            bestRuntime = s.executionTime;
          }
        }
        if (typeof s.memory === "number") {
          if (bestMemory === null || s.memory < bestMemory) {
            bestMemory = s.memory;
          }
        }
      }
    }

    out.set(problemId, {
      problemId,
      status,
      totalSubmissions: list.length,
      acceptedSubmissions,
      firstAttemptAt,
      lastAttemptAt,
      solvedAt,
      bestRuntime,
      bestMemory,
      suggestedForRevision: status === PROBLEM_PROGRESS_STATUS.ATTEMPTED,
    });
  }
  return out;
}

export class ProgressImportService {
  private async fetchUserSubmissions(
    userId: string,
    authHeader?: string
  ): Promise<ImportSubmissionRow[]> {
    const base = serverConfig.SUBMISSION_SERVICE_URL.replace(/\/$/, "");
    const url = `${base}/api/v1/submissions/me/import-source`;
    const res = await axios.get(url, {
      headers: authHeader ? { Authorization: authHeader } : {},
      timeout: 60000,
    });
    const payload = res.data?.data;
    const submissions = (payload?.submissions || payload || []) as ImportSubmissionRow[];
    // Defense in depth: only keep rows for this user if any userId leaked in payload.
    return submissions.filter((s: any) => !s.userId || String(s.userId) === userId);
  }

  private async resolveSheetCatalogs(): Promise<SheetCatalog[]> {
    const metas = await sheetService.listPublishedMetas();
    const catalogs: SheetCatalog[] = [];

    for (const meta of metas) {
      const problemIds = await sheetService.getUniqueProblemIdSet(meta.id);
      // Fallback to JSON slugs if DB sheet has no links yet (pre-seed race).
      if (problemIds.size === 0 && meta.id in FALLBACK_SHEETS) {
        const candidates = [
          path.join(process.cwd(), "scripts/data/dsa-best-sheet.json"),
          path.join(__dirname, "../../scripts/data/dsa-best-sheet.json"),
        ];
        let slugs: string[] = [];
        for (const file of candidates) {
          if (!fs.existsSync(file)) continue;
          const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
            topics?: Array<{ problems?: Array<{ slug?: string }> }>;
          };
          const set = new Set<string>();
          for (const topic of raw.topics || []) {
            for (const p of topic.problems || []) {
              if (p.slug) set.add(p.slug);
            }
          }
          slugs = [...set];
          break;
        }
        if (slugs.length) {
          const problems = await Problem.find({ slug: { $in: slugs } })
            .select("_id")
            .lean();
          for (const p of problems) problemIds.add(String(p._id));
        }
      }
      catalogs.push({
        sheetId: meta.id,
        name: meta.name,
        problemIds,
        total: meta.totalProblems || problemIds.size,
      });
    }

    return catalogs;
  }

  private buildPreviewStats(
    aggs: Map<string, ProblemAgg>,
    existingIds: Set<string>,
    sheets: SheetCatalog[],
    totalSubmissions: number,
    lastSubmissionAt: Date | null,
    activityDays: number
  ): ProgressImportPreview {
    let solvedProblems = 0;
    let attemptedProblems = 0;
    let alreadyImportedProblems = 0;
    let newProblems = 0;
    let revisionItemsAffected = 0;

    for (const agg of aggs.values()) {
      if (agg.status === PROBLEM_PROGRESS_STATUS.SOLVED) solvedProblems += 1;
      else if (agg.status === PROBLEM_PROGRESS_STATUS.ATTEMPTED) {
        attemptedProblems += 1;
      }
      if (existingIds.has(agg.problemId)) alreadyImportedProblems += 1;
      else newProblems += 1;
      if (agg.suggestedForRevision) revisionItemsAffected += 1;
    }

    let affectedSheets = 0;
    for (const sheet of sheets) {
      if (aggs.size === 0) continue;
      if (sheet.problemIds.size === 0) {
        affectedSheets += 1;
        continue;
      }
      for (const pid of aggs.keys()) {
        if (sheet.problemIds.has(pid)) {
          affectedSheets += 1;
          break;
        }
      }
    }

    return {
      totalSubmissions,
      uniqueProblems: aggs.size,
      solvedProblems,
      attemptedProblems,
      alreadyImportedProblems,
      newProblems,
      affectedSheets,
      revisionItemsAffected,
      activityDays,
      lastSubmissionAt: lastSubmissionAt ? lastSubmissionAt.toISOString() : null,
      estimatedChanges: {
        progressUpserts: aggs.size,
        sheetSyncs: affectedSheets,
        weakProblemFlags: revisionItemsAffected,
      },
    };
  }

  async getStatus(userId: string, authHeader?: string) {
    if (!userId) throw new UnauthorizedError("Authentication required");

    const [progressCount, solved, attempted, lastImport, lastProgress, rows] =
      await Promise.all([
        UserProblemProgress.countDocuments({ userId }),
        UserProblemProgress.countDocuments({
          userId,
          status: PROBLEM_PROGRESS_STATUS.SOLVED,
        }),
        UserProblemProgress.countDocuments({
          userId,
          status: PROBLEM_PROGRESS_STATUS.ATTEMPTED,
        }),
        ProgressImportLog.findOne({ userId, mode: "import" })
          .sort({ createdAt: -1 })
          .lean(),
        UserProblemProgress.findOne({ userId })
          .sort({ lastAttemptAt: -1 })
          .select("lastAttemptAt lastImportedAt")
          .lean(),
        this.fetchUserSubmissions(userId, authHeader).catch(() => [] as ImportSubmissionRow[]),
      ]);

    const uniqueFromSubs = new Set(rows.map((r) => r.problemId)).size;
    let lastSubmissionDate: string | null = lastProgress?.lastAttemptAt
      ? new Date(lastProgress.lastAttemptAt).toISOString()
      : null;
    for (const row of rows) {
      const d = toDate(row.createdAt) || toDate(row.updatedAt);
      if (!d) continue;
      if (!lastSubmissionDate || d > new Date(lastSubmissionDate)) {
        lastSubmissionDate = d.toISOString();
      }
    }

    let solvedFromSubs = 0;
    let attemptedFromSubs = 0;
    const aggs = aggregateByProblem(rows);
    for (const agg of aggs.values()) {
      if (agg.status === PROBLEM_PROGRESS_STATUS.SOLVED) solvedFromSubs += 1;
      else if (agg.status === PROBLEM_PROGRESS_STATUS.ATTEMPTED) {
        attemptedFromSubs += 1;
      }
    }

    return {
      totalSubmissions: rows.length,
      problemsAttempted: Math.max(attempted + solved, uniqueFromSubs),
      problemsSolved: Math.max(solved, solvedFromSubs),
      problemsAttemptedOnly: Math.max(attempted, attemptedFromSubs),
      totalProgressRecords: progressCount,
      lastSubmissionDate,
      lastSyncDate: lastImport?.createdAt
        ? new Date(lastImport.createdAt).toISOString()
        : lastProgress?.lastImportedAt
          ? new Date(lastProgress.lastImportedAt).toISOString()
          : null,
      hasImportedBefore: Boolean(lastImport),
    };
  }

  async preview(userId: string, authHeader?: string): Promise<ProgressImportPreview> {
    if (!userId) throw new UnauthorizedError("Authentication required");

    const [rows, existing, sheets] = await Promise.all([
      this.fetchUserSubmissions(userId, authHeader),
      UserProblemProgress.find({ userId }).select("problemId").lean(),
      this.resolveSheetCatalogs(),
    ]);

    const aggs = aggregateByProblem(rows);
    const existingIds = new Set(existing.map((e) => String(e.problemId)));

    const activityDays = new Set<string>();
    let lastSubmissionAt: Date | null = null;
    for (const row of rows) {
      const d = toDate(row.createdAt) || toDate(row.updatedAt);
      if (!d) continue;
      activityDays.add(dayKey(d));
      if (!lastSubmissionAt || d > lastSubmissionAt) lastSubmissionAt = d;
    }

    return this.buildPreviewStats(
      aggs,
      existingIds,
      sheets,
      rows.length,
      lastSubmissionAt,
      activityDays.size
    );
  }

  async importProgress(
    userId: string,
    authHeader?: string
  ): Promise<ProgressImportResult> {
    if (!userId) throw new UnauthorizedError("Authentication required");
    if (importingUsers.has(userId)) {
      throw new ConflictError(
        "An import is already in progress for your account. Please wait."
      );
    }

    importingUsers.add(userId);
    try {
      const [rows, existing, sheets] = await Promise.all([
        this.fetchUserSubmissions(userId, authHeader),
        UserProblemProgress.find({ userId }).select("problemId").lean(),
        this.resolveSheetCatalogs(),
      ]);

      const aggs = aggregateByProblem(rows);
      const existingIds = new Set(existing.map((e) => String(e.problemId)));
      const now = new Date();

      const activityDays = new Set<string>();
      let lastSubmissionAt: Date | null = null;
      for (const row of rows) {
        const d = toDate(row.createdAt) || toDate(row.updatedAt);
        if (!d) continue;
        activityDays.add(dayKey(d));
        if (!lastSubmissionAt || d > lastSubmissionAt) lastSubmissionAt = d;
      }

      const preview = this.buildPreviewStats(
        aggs,
        existingIds,
        sheets,
        rows.length,
        lastSubmissionAt,
        activityDays.size
      );

      const ops: AnyBulkWriteOperation<IUserProblemProgress>[] = [];
      for (const agg of aggs.values()) {
        ops.push({
          updateOne: {
            filter: { userId, problemId: agg.problemId },
            update: {
              $set: {
                userId,
                problemId: agg.problemId,
                status: agg.status,
                firstAttemptAt: agg.firstAttemptAt,
                lastAttemptAt: agg.lastAttemptAt,
                solvedAt: agg.solvedAt,
                totalSubmissions: agg.totalSubmissions,
                acceptedSubmissions: agg.acceptedSubmissions,
                bestRuntime: agg.bestRuntime,
                bestMemory: agg.bestMemory,
                source: "import",
                imported: true,
                lastImportedAt: now,
                suggestedForRevision: agg.suggestedForRevision,
              },
            },
            upsert: true,
          },
        });
      }

      let updatedProblems = 0;
      if (ops.length) {
        const result = await UserProblemProgress.bulkWrite(ops, {
          ordered: false,
        });
        updatedProblems =
          (result.upsertedCount || 0) +
          (result.modifiedCount || 0) +
          (result.matchedCount || 0);
      }

      const sheetsSynced: ProgressImportResult["sheetsSynced"] = [];
      for (const sheet of sheets) {
        let solvedInSheet = 0;
        let attemptedInSheet = 0;
        const hasCatalog = sheet.problemIds.size > 0;

        for (const agg of aggs.values()) {
          if (hasCatalog && !sheet.problemIds.has(agg.problemId)) continue;
          if (!hasCatalog) {
            // Without resolved IDs, attribute all progress to known sheet once.
          }
          if (agg.status === PROBLEM_PROGRESS_STATUS.SOLVED) solvedInSheet += 1;
          else if (agg.status === PROBLEM_PROGRESS_STATUS.ATTEMPTED) {
            attemptedInSheet += 1;
          }
        }

        if (!hasCatalog && aggs.size === 0) continue;
        if (hasCatalog && solvedInSheet + attemptedInSheet === 0) continue;

        await UserSheetProgress.findOneAndUpdate(
          { userId, sheetId: sheet.sheetId },
          {
            $set: {
              userId,
              sheetId: sheet.sheetId,
              lastSyncedAt: now,
              completedCached: solvedInSheet,
              attemptedCached: attemptedInSheet,
              // Restore sheet visibility of historical solves after import.
              resetAt: null,
            },
          },
          { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
        );

        sheetsSynced.push({
          sheetId: sheet.sheetId,
          sheetName: sheet.name,
          solvedInSheet,
          attemptedInSheet,
          totalInSheet: sheet.total,
        });
      }

      await ProgressImportLog.create({
        userId,
        mode: "import",
        totalSubmissions: preview.totalSubmissions,
        uniqueProblems: preview.uniqueProblems,
        solvedProblems: preview.solvedProblems,
        attemptedProblems: preview.attemptedProblems,
        newProblems: preview.newProblems,
        updatedProblems,
        affectedSheets: sheetsSynced.length,
        revisionItemsAffected: preview.revisionItemsAffected,
        summary: {
          sheetsSynced,
          activityDays: activityDays.size,
          lastSubmissionAt: preview.lastSubmissionAt,
        },
      });

      return {
        ...preview,
        affectedSheets: sheetsSynced.length,
        updatedProblems,
        sheetsSynced,
        dashboard: {
          solvedProblems: preview.solvedProblems,
          attemptedProblems: preview.attemptedProblems,
          uniqueProblems: preview.uniqueProblems,
          totalSubmissions: preview.totalSubmissions,
        },
        activity: {
          activeDays: activityDays.size,
          lastActivityAt: preview.lastSubmissionAt,
        },
        lastImportedAt: now.toISOString(),
      };
    } finally {
      importingUsers.delete(userId);
    }
  }
}

export const progressImportService = new ProgressImportService();
