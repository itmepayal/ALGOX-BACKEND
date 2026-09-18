import { Document, Schema, model, Types } from "mongoose";
import type { SrsFeedback } from "../utils/srsSchedule";

export type SrsCardStatus = "active" | "graduated" | "paused";

export interface IUserSpacedRepetition extends Document {
  userId: string;
  problemId: Types.ObjectId;
  difficulty: string;
  lastSolvedAt: Date | null;
  lastReviewedAt: Date | null;
  confidence: SrsFeedback | null;
  confidenceScore: number;
  /** Official solves / re-solves counted toward this card */
  attempts: number;
  reviewCount: number;
  intervalDays: number;
  nextReviewAt: Date;
  status: SrsCardStatus;
  createdAt: Date;
  updatedAt: Date;
}

const userSpacedRepetitionSchema = new Schema<IUserSpacedRepetition>(
  {
    userId: { type: String, required: true, index: true },
    problemId: {
      type: Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
      index: true,
    },
    difficulty: {
      type: String,
      default: "medium",
      lowercase: true,
      trim: true,
    },
    lastSolvedAt: { type: Date, default: null },
    lastReviewedAt: { type: Date, default: null },
    confidence: {
      type: String,
      enum: ["hard", "okay", "easy"],
      default: undefined,
    },
    confidenceScore: { type: Number, default: 0, min: 0, max: 5 },
    attempts: { type: Number, default: 0, min: 0 },
    reviewCount: { type: Number, default: 0, min: 0 },
    intervalDays: { type: Number, default: 1, min: 1 },
    nextReviewAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["active", "graduated", "paused"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

userSpacedRepetitionSchema.index(
  { userId: 1, problemId: 1 },
  { unique: true }
);
userSpacedRepetitionSchema.index({ userId: 1, status: 1, nextReviewAt: 1 });

export const UserSpacedRepetition = model<IUserSpacedRepetition>(
  "UserSpacedRepetition",
  userSpacedRepetitionSchema
);

export interface IUserSrsPrefs extends Document {
  userId: string;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSrsPrefsSchema = new Schema<IUserSrsPrefs>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    timezone: { type: String, default: "UTC", trim: true },
  },
  { timestamps: true }
);

export const UserSrsPrefs = model<IUserSrsPrefs>(
  "UserSrsPrefs",
  userSrsPrefsSchema
);
