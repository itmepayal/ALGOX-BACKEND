import { Schema, model, Document, Types } from "mongoose";

export interface IDailySubmissionActivity {
  date: string; // Format: YYYY-MM-DD
  count: number;
}

export interface ITopicStrength {
  topic: string; // e.g. "Arrays", "Dynamic Programming", "Graphs"
  solvedCount: number;
  totalSubmissions: number;
}

export interface IUserAnalytics extends Document {
  userId: Types.ObjectId;
  totalSubmissions: number;
  acceptedSubmissions: number;
  solvedEasy: number;
  solvedMedium: number;
  solvedHard: number;
  wrongAnswers: number;
  timeLimitExceeded: number;
  memoryLimitExceeded: number;
  runtimeError: number;
  acceptanceRate: number;
  currentStreak: number;
  maxStreak: number;
  lastSubmissionDate: Date;
  submissionHeatmap: IDailySubmissionActivity[];
  topicStrengths: ITopicStrength[];
}

const userAnalyticsSchema = new Schema<IUserAnalytics>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    totalSubmissions: { type: Number, default: 0 },
    acceptedSubmissions: { type: Number, default: 0 },
    solvedEasy: { type: Number, default: 0 },
    solvedMedium: { type: Number, default: 0 },
    solvedHard: { type: Number, default: 0 },
    wrongAnswers: { type: Number, default: 0 },
    timeLimitExceeded: { type: Number, default: 0 },
    memoryLimitExceeded: { type: Number, default: 0 },
    runtimeError: { type: Number, default: 0 },
    acceptanceRate: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    maxStreak: { type: Number, default: 0 },
    lastSubmissionDate: { type: Date },
    submissionHeatmap: [
      {
        date: { type: String, required: true },
        count: { type: Number, default: 0 },
      },
    ],
    topicStrengths: [
      {
        topic: { type: String, required: true },
        solvedCount: { type: Number, default: 0 },
        totalSubmissions: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

export const UserAnalytics = model<IUserAnalytics>("UserAnalytics", userAnalyticsSchema);
