import mongoose, { Document, Schema } from "mongoose";

export interface IDailyGoalConfig {
  problemsPerDay: number;
  studyMinutes: number;
  revisionTopics: number;
  sessionsPerDay: number;
}

export interface IUserLearningGoals extends Document {
  userId: string;
  goals: IDailyGoalConfig;
  createdAt: Date;
  updatedAt: Date;
}

const goalsSchema = new Schema<IDailyGoalConfig>(
  {
    problemsPerDay: { type: Number, default: 8, min: 1, max: 50 },
    studyMinutes: { type: Number, default: 120, min: 15, max: 600 },
    revisionTopics: { type: Number, default: 1, min: 0, max: 10 },
    sessionsPerDay: { type: Number, default: 1, min: 0, max: 10 },
  },
  { _id: false }
);

const userLearningGoalsSchema = new Schema<IUserLearningGoals>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    goals: { type: goalsSchema, required: true },
  },
  { timestamps: true }
);

export const UserLearningGoals = mongoose.model<IUserLearningGoals>(
  "UserLearningGoals",
  userLearningGoalsSchema
);
