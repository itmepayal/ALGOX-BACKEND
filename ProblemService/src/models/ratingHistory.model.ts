import mongoose, { Document, Schema, Types } from "mongoose";

export interface IRatingHistory extends Document {
  userId: Types.ObjectId;
  battleId: Types.ObjectId;
  opponentId: Types.ObjectId;
  opponentName: string;

  previousRating: number;
  newRating: number;
  ratingChange: number;

  opponentRatingBefore: number;
  opponentRatingAfter: number;

  result: "WIN" | "LOSS" | "DRAW";
  battleMode: string;

  createdAt: Date;
}

const ratingHistorySchema = new Schema<IRatingHistory>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    battleId: { type: Schema.Types.ObjectId, required: true, index: true },
    opponentId: { type: Schema.Types.ObjectId, required: true },
    opponentName: { type: String, default: "Opponent" },

    previousRating: { type: Number, required: true },
    newRating: { type: Number, required: true },
    ratingChange: { type: Number, required: true },

    opponentRatingBefore: { type: Number, required: true },
    opponentRatingAfter: { type: Number, required: true },

    result: { type: String, enum: ["WIN", "LOSS", "DRAW"], required: true },
    battleMode: { type: String, default: "ranked" },
  },
  { timestamps: true }
);

// Enforce single rating settlement per user per battle
ratingHistorySchema.index({ userId: 1, battleId: 1 }, { unique: true });
ratingHistorySchema.index({ userId: 1, createdAt: -1 });

export const RatingHistory = mongoose.model<IRatingHistory>(
  "RatingHistory",
  ratingHistorySchema
);
