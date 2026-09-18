import mongoose, { Document, Schema } from "mongoose";
import type { AiFeatureId } from "../ai/aiFeatures";

/**
 * Daily AI quota ledger — server SoT.
 * Client-provided quota/usage is never trusted.
 */
export interface IAiUsageDaily extends Document {
  userId: string;
  /** YYYY-MM-DD UTC */
  dateKey: string;
  accessTier: "FREE" | "PREMIUM";
  quota: number;
  used: number;
  failed: number;
  byFeature: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

const aiUsageDailySchema = new Schema<IAiUsageDaily>(
  {
    userId: { type: String, required: true, index: true },
    dateKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    accessTier: { type: String, enum: ["FREE", "PREMIUM"], required: true },
    quota: { type: Number, required: true, min: 0 },
    used: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
    byFeature: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

aiUsageDailySchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export const AiUsageDaily = mongoose.model<IAiUsageDaily>(
  "AiUsageDaily",
  aiUsageDailySchema
);

/**
 * Sparse usage event log — no full prompts or source code stored.
 */
export interface IAiUsageEvent extends Document {
  userId: string;
  feature: AiFeatureId | string;
  dateKey: string;
  success: boolean;
  failureReason?: string;
  problemId?: string;
  /** Whether a code snippet was present (content not stored). */
  hadCodeSnippet: boolean;
  codeLength?: number;
  latencyMs?: number;
  provider: "gemini" | "openai" | "policy" | "none";
  createdAt: Date;
  updatedAt: Date;
}

const aiUsageEventSchema = new Schema<IAiUsageEvent>(
  {
    userId: { type: String, required: true, index: true },
    feature: { type: String, required: true, index: true },
    dateKey: { type: String, required: true, index: true },
    success: { type: Boolean, required: true },
    failureReason: { type: String },
    problemId: { type: String },
    hadCodeSnippet: { type: Boolean, default: false },
    codeLength: { type: Number },
    latencyMs: { type: Number },
    provider: {
      type: String,
      enum: ["gemini", "openai", "policy", "none"],
      default: "none",
    },
  },
  { timestamps: true }
);

aiUsageEventSchema.index({ userId: 1, createdAt: -1 });

export const AiUsageEvent = mongoose.model<IAiUsageEvent>(
  "AiUsageEvent",
  aiUsageEventSchema
);
