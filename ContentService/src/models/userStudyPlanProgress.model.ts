import { Schema, model, Document, Types } from "mongoose";

export interface IUserStudyPlanProgress extends Document {
  userId: Types.ObjectId;
  studyPlanSlug: string;
  completedProblemIds: string[]; // Problem IDs user has solved in this study plan
  solvedCount: number;
  totalProblemsCount: number;
  completionPercentage: number;
  lastStudiedAt: Date;
}

const userStudyPlanProgressSchema = new Schema<IUserStudyPlanProgress>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    studyPlanSlug: { type: String, required: true, index: true },
    completedProblemIds: [{ type: String }],
    solvedCount: { type: Number, default: 0 },
    totalProblemsCount: { type: Number, default: 0 },
    completionPercentage: { type: Number, default: 0 },
    lastStudiedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userStudyPlanProgressSchema.index({ userId: 1, studyPlanSlug: 1 }, { unique: true });

export const UserStudyPlanProgress = model<IUserStudyPlanProgress>(
  "UserStudyPlanProgress",
  userStudyPlanProgressSchema
);
