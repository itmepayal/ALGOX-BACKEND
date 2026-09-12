import { UserSheetProgress } from "../models/userSheetProgress.model";
import { BadRequestError, NotFoundError } from "../utils/errors/app.error";
import { sheetService } from "./sheet.service";

export class SheetProgressService {
  async getProgress(userId: string, sheetId: string) {
    const sheet = await sheetService.resolveSheetMeta(sheetId);
    if (!sheet) {
      throw new NotFoundError("Sheet not found");
    }
    // Prefer published for end users; allow DRAFT only if it exists in DB fallback path already resolved.
    if (sheet.status && sheet.status === "ARCHIVED") {
      throw new NotFoundError("Sheet not found");
    }

    const doc = await UserSheetProgress.findOne({ userId, sheetId }).lean();

    return {
      sheetId: sheet.id,
      sheetName: sheet.name,
      resetAt: doc?.resetAt ? new Date(doc.resetAt).toISOString() : null,
      completed: doc?.completedCached ?? 0,
      total: sheet.totalProblems,
      progress:
        sheet.totalProblems > 0
          ? Math.round(((doc?.completedCached ?? 0) / sheet.totalProblems) * 100)
          : 0,
      hasResetBoundary: Boolean(doc?.resetAt),
      lastSyncedAt: doc?.lastSyncedAt
        ? new Date(doc.lastSyncedAt).toISOString()
        : null,
    };
  }

  /**
   * Reset ONLY this user's progress for this sheet.
   * Does not touch submissions, bookmarks, revision, profile, or other sheets.
   */
  async resetProgress(userId: string, sheetId: string) {
    if (!userId) throw new BadRequestError("Authenticated user required");
    const sheet = await sheetService.resolveSheetMeta(sheetId);
    if (!sheet || sheet.status === "ARCHIVED") {
      throw new NotFoundError("Sheet not found");
    }
    const resetAt = new Date();

    await UserSheetProgress.findOneAndUpdate(
      { userId, sheetId },
      {
        $set: {
          resetAt,
          userId,
          sheetId,
          completedCached: 0,
          attemptedCached: 0,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.info("[SheetProgress] RESET_SHEET_PROGRESS", {
      userId,
      sheetId,
      resetAt: resetAt.toISOString(),
    });

    return {
      sheetId: sheet.id,
      sheetName: sheet.name,
      resetAt: resetAt.toISOString(),
      completed: 0,
      total: sheet.totalProblems,
      progress: 0,
    };
  }
}

export const sheetProgressService = new SheetProgressService();
