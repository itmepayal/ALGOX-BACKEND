import mongoose, { Document, Schema } from "mongoose";
import {
  PROBLEM_PROGRESS_STATUS,
  type ProblemProgressStatus,
} from "../constants/progressStatus";

export interface IUserProblemProgress extends Document {
  userId: string;
  problemId: string;
  status: ProblemProgressStatus;
  firstAttemptAt?: Date | null;
  lastAttemptAt?: Date | null;
  solvedAt?: Date | null;
  totalSubmissions: number;
  acceptedSubmissions: number;
  bestRuntime?: number | null;
  bestMemory?: number | null;
  source: "import" | "live" | "manual";
  imported: boolean;
  lastImportedAt?: Date | null;
  suggestedForRevision: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userProblemProgressSchema = new Schema<IUserProblemProgress>(
  {
    userId: { type: String, required: true, index: true },
    problemId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: Object.values(PROBLEM_PROGRESS_STATUS),
      default: PROBLEM_PROGRESS_STATUS.NOT_STARTED,
      index: true,
    },
    firstAttemptAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
    solvedAt: { type: Date, default: null },
    totalSubmissions: { type: Number, default: 0 },
    acceptedSubmissions: { type: Number, default: 0 },
    bestRuntime: { type: Number, default: null },
    bestMemory: { type: Number, default: null },
    source: {
      type: String,
      enum: ["import", "live", "manual"],
      default: "import",
    },
    imported: { type: Boolean, default: false },
    lastImportedAt: { type: Date, default: null },
    suggestedForRevision: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

userProblemProgressSchema.index({ userId: 1, problemId: 1 }, { unique: true });
userProblemProgressSchema.index({ userId: 1, status: 1 });

export const UserProblemProgress = mongoose.model<IUserProblemProgress>(
  "UserProblemProgress",
  userProblemProgressSchema
);
