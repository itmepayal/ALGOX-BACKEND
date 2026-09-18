import mongoose, { Document, Schema } from "mongoose";

export type StudySessionStatus = "running" | "paused" | "completed";

export interface IUserStudySession extends Document {
  userId: string;
  clientId: string;
  topic: string;
  status: StudySessionStatus;
  startedAt: number;
  segmentStartedAt: number | null;
  accumulatedMs: number;
  endedAt?: number;
  attemptedProblemIds: string[];
  solvedProblemIds: string[];
  updatedAtMs: number;
  createdAt: Date;
  updatedAt: Date;
}

const userStudySessionSchema = new Schema<IUserStudySession>(
  {
    userId: { type: String, required: true, index: true },
    clientId: { type: String, required: true },
    topic: { type: String, required: true, maxlength: 200, default: "General" },
    status: {
      type: String,
      enum: ["running", "paused", "completed"],
      required: true,
      index: true,
    },
    startedAt: { type: Number, required: true },
    segmentStartedAt: { type: Number, default: null },
    accumulatedMs: { type: Number, default: 0, min: 0 },
    endedAt: { type: Number },
    attemptedProblemIds: { type: [String], default: [] },
    solvedProblemIds: { type: [String], default: [] },
    updatedAtMs: { type: Number, default: () => Date.now() },
  },
  { timestamps: true }
);

userStudySessionSchema.index({ userId: 1, status: 1, updatedAtMs: -1 });
userStudySessionSchema.index({ userId: 1, clientId: 1 }, { unique: true });
/** At most one non-completed active session per user (enforced in service). */
userStudySessionSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["running", "paused"] } },
  }
);

export const UserStudySession = mongoose.model<IUserStudySession>(
  "UserStudySession",
  userStudySessionSchema
);
