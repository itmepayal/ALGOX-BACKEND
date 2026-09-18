import { Schema, model, Document, Types } from "mongoose";

export type StudyPlanProgressStatus =
  | "not_started"
  | "in_progress"
  | "completed";

/**
 * Server-authoritative enrollment + progress for a study plan.
 * Never use client localStorage as source of truth.
 */
export interface IUserStudyPlanProgress extends Document {
  userId: Types.ObjectId | string;
  studyPlanSlug: string;
  status: StudyPlanProgressStatus;
  completedProblemIds: string[];
  solvedCount: number;
  totalProblemsCount: number;
  completionPercentage: number;
  /** Next problem to resume (ordered). */
  resumeProblemId?: string | null;
  resumeSectionIndex?: number;
  enrolledAt: Date;
  completedAt?: Date | null;
  lastStudiedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userStudyPlanProgressSchema = new Schema<IUserStudyPlanProgress>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    studyPlanSlug: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["not_started", "in_progress", "completed"],
      default: "not_started",
      index: true,
    },
    completedProblemIds: [{ type: String }],
    solvedCount: { type: Number, default: 0 },
    totalProblemsCount: { type: Number, default: 0 },
    completionPercentage: { type: Number, default: 0 },
    resumeProblemId: { type: String, default: null },
    resumeSectionIndex: { type: Number, default: 0 },
    enrolledAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    lastStudiedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userStudyPlanProgressSchema.index(
  { userId: 1, studyPlanSlug: 1 },
  { unique: true }
);
userStudyPlanProgressSchema.index({ userId: 1, status: 1, updatedAt: -1 });

export const UserStudyPlanProgress = model<IUserStudyPlanProgress>(
  "UserStudyPlanProgress",
  userStudyPlanProgressSchema
);
