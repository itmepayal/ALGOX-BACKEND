import mongoose, { Document, Schema, Types } from "mongoose";

export type VirtualContestMode = "practice" | "virtual";
export type VirtualContestStatus =
  | "in_progress"
  | "timed_out"
  | "completed"
  | "abandoned";

export interface IVirtualContestAttempt {
  problemId: string;
  submissionId?: string;
  status: string;
  solved: boolean;
  testCasesPassed?: number;
  totalTestCases?: number;
  at: Date;
}

export interface IVirtualContestReport {
  status: VirtualContestStatus;
  mode: VirtualContestMode;
  sourceContestTitle?: string;
  durationMinutes: number;
  solvedCount: number;
  attemptedCount: number;
  problemIds: string[];
  attempts: IVirtualContestAttempt[];
  recommendations: Array<{ title: string; evidence: string; action: string }>;
  note: string;
}

export interface IVirtualContestSession extends Document {
  userId: string;
  sourceContestId: Types.ObjectId;
  sourceContestSlug: string;
  mode: VirtualContestMode;
  status: VirtualContestStatus;
  problemIds: string[];
  attempts: IVirtualContestAttempt[];
  startedAt: Date;
  endsAt: Date;
  completedAt?: Date;
  report?: IVirtualContestReport;
  createdAt: Date;
  updatedAt: Date;
}

const attemptSchema = new Schema<IVirtualContestAttempt>(
  {
    problemId: { type: String, required: true },
    submissionId: String,
    status: { type: String, required: true },
    solved: { type: Boolean, default: false },
    testCasesPassed: Number,
    totalTestCases: Number,
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const virtualContestSessionSchema = new Schema<IVirtualContestSession>(
  {
    userId: { type: String, required: true, index: true },
    sourceContestId: {
      type: Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
      index: true,
    },
    sourceContestSlug: { type: String, required: true },
    mode: {
      type: String,
      enum: ["practice", "virtual"],
      default: "virtual",
    },
    status: {
      type: String,
      enum: ["in_progress", "timed_out", "completed", "abandoned"],
      default: "in_progress",
      index: true,
    },
    problemIds: [{ type: String }],
    attempts: [attemptSchema],
    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    completedAt: Date,
    report: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

virtualContestSessionSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "in_progress" },
  }
);

export const VirtualContestSession = mongoose.model<IVirtualContestSession>(
  "VirtualContestSession",
  virtualContestSessionSchema
);
