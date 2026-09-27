import mongoose, { Document, Schema } from "mongoose";

export type SkillConfidence = "LOW" | "MEDIUM" | "HIGH";
export type SkillTrend = "IMPROVING" | "STABLE" | "DECLINING";

export interface ITopicSkillProfile extends Document {
  userId: string;
  topic: string;
  rating: number;
  confidence: SkillConfidence;
  problemsAttempted: number;
  problemsSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  totalAttempts: number;
  acceptedSubmissions: number;
  acceptanceRate: number;
  trend: SkillTrend;
  lastEvaluatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const topicSkillProfileSchema = new Schema<ITopicSkillProfile>(
  {
    userId: { type: String, required: true, index: true },
    topic: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, default: 1200 },
    confidence: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "LOW",
    },
    problemsAttempted: { type: Number, default: 0 },
    problemsSolved: { type: Number, default: 0 },
    easySolved: { type: Number, default: 0 },
    mediumSolved: { type: Number, default: 0 },
    hardSolved: { type: Number, default: 0 },
    totalAttempts: { type: Number, default: 0 },
    acceptedSubmissions: { type: Number, default: 0 },
    acceptanceRate: { type: Number, default: 0 },
    trend: {
      type: String,
      enum: ["IMPROVING", "STABLE", "DECLINING"],
      default: "STABLE",
    },
    lastEvaluatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

topicSkillProfileSchema.index({ userId: 1, topic: 1 }, { unique: true });
topicSkillProfileSchema.index({ userId: 1, rating: -1 });

export const TopicSkillProfile = mongoose.model<ITopicSkillProfile>(
  "TopicSkillProfile",
  topicSkillProfileSchema
);
