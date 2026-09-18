import mongoose, { Document, Schema } from "mongoose";

/**
 * Canonical daily challenge — one problem per calendar dateKey (YYYY-MM-DD).
 * Same date → same problem for every user. Not selected per-user at request time.
 */
export type ChallengeTier = "standard" | "advanced";

export interface IDailyChallenge extends Document {
  /** Calendar date YYYY-MM-DD (product calendar; users map "today" via their TZ). */
  dateKey: string;
  problemId: string;
  problemSlug?: string;
  title?: string;
  difficulty?: string;
  category?: string;
  /** Advanced challenges require premium.daily_challenge_advanced. */
  tier: ChallengeTier;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const dailyChallengeSchema = new Schema<IDailyChallenge>(
  {
    dateKey: {
      type: String,
      required: true,
      unique: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
      index: true,
    },
    problemId: { type: String, required: true, index: true },
    problemSlug: { type: String },
    title: { type: String },
    difficulty: { type: String },
    category: { type: String },
    tier: {
      type: String,
      enum: ["standard", "advanced"],
      default: "standard",
    },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const DailyChallenge = mongoose.model<IDailyChallenge>(
  "DailyChallenge",
  dailyChallengeSchema
);
