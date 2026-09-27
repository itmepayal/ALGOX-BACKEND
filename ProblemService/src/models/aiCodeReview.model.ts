import { Document, Schema, Types, model } from "mongoose";

export interface IAiCodeReviewPayload {
  overallAssessment: string;
  correctness: {
    status: "correct" | "incorrect" | "partial";
    summary: string;
  };
  timeComplexity: {
    current: string;
    expected?: string;
    explanation: string;
  };
  spaceComplexity: {
    current: string;
    explanation: string;
  };
  codeQuality: {
    score: number;
    issues: string[];
  };
  edgeCases: string[];
  optimizationSuggestions: string[];
  learningFeedback: string;
  recommendedNextStep: string;
}

export interface IAiCodeReview extends Document {
  userId: Types.ObjectId;
  submissionId: Types.ObjectId;
  problemId: Types.ObjectId;
  language: string;
  reviewVersion: string;
  reviewPayload: IAiCodeReviewPayload;
  provider: string;
  createdAt: Date;
  updatedAt: Date;
}

const aiCodeReviewSchema = new Schema<IAiCodeReview>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    submissionId: { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    problemId: { type: Schema.Types.ObjectId, required: true, index: true },
    language: { type: String, required: true },
    reviewVersion: { type: String, default: "v1" },
    reviewPayload: {
      overallAssessment: { type: String, required: true },
      correctness: {
        status: { type: String, enum: ["correct", "incorrect", "partial"], required: true },
        summary: { type: String, required: true },
      },
      timeComplexity: {
        current: { type: String, required: true },
        expected: { type: String },
        explanation: { type: String, required: true },
      },
      spaceComplexity: {
        current: { type: String, required: true },
        explanation: { type: String, required: true },
      },
      codeQuality: {
        score: { type: Number, required: true, min: 1, max: 10 },
        issues: [{ type: String }],
      },
      edgeCases: [{ type: String }],
      optimizationSuggestions: [{ type: String }],
      learningFeedback: { type: String, required: true },
      recommendedNextStep: { type: String, required: true },
    },
    provider: { type: String, default: "gemini" },
  },
  { timestamps: true }
);

aiCodeReviewSchema.index({ userId: 1, createdAt: -1 });

export const AiCodeReview = model<IAiCodeReview>("AiCodeReview", aiCodeReviewSchema);
