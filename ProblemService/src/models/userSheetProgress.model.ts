import mongoose, { Document, Schema } from "mongoose";

/**
 * Per-user, per-sheet learning progress boundary.
 *
 * Sheet completion is derived from official ACCEPTED submissions, but only those
 * occurring after `resetAt` (when set). Resetting a sheet sets `resetAt = now`
 * and never deletes submissions, bookmarks, revision, or other sheets' docs.
 *
 * `lastSyncedAt` / cached counts are updated by Import Progress and do not
 * clear `resetAt`.
 */
export interface IUserSheetProgress extends Document {
  userId: string;
  sheetId: string;
  /** When set, only ACCEPTED submissions at/after this time count toward sheet progress. */
  resetAt: Date | null;
  lastSyncedAt?: Date | null;
  completedCached?: number;
  attemptedCached?: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSheetProgressSchema = new Schema<IUserSheetProgress>(
  {
    userId: { type: String, required: true, index: true },
    sheetId: { type: String, required: true, index: true },
    resetAt: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: null },
    completedCached: { type: Number, default: 0 },
    attemptedCached: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSheetProgressSchema.index({ userId: 1, sheetId: 1 }, { unique: true });

export const UserSheetProgress = mongoose.model<IUserSheetProgress>(
  "UserSheetProgress",
  userSheetProgressSchema
);
