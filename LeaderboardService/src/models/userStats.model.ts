import { Schema, model, Document, Types } from "mongoose";

export interface IUserStats extends Document {
  userId: Types.ObjectId;
  userName: string;
  userEmail: string;
  solvedEasy: number;
  solvedMedium: number;
  solvedHard: number;
  totalSolved: number;
  rating: number;
  globalRank?: number;
}

const userStatsSchema = new Schema<IUserStats>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
    },
    userName: { type: String, required: true },
    userEmail: { type: String, required: true },
    solvedEasy: { type: Number, default: 0 },
    solvedMedium: { type: Number, default: 0 },
    solvedHard: { type: Number, default: 0 },
    totalSolved: { type: Number, default: 0, index: true },
    rating: { type: Number, default: 1500, index: true },
    globalRank: Number,
  },
  { timestamps: true }
);

userStatsSchema.index({ totalSolved: -1, rating: -1 });

export const UserStats = model<IUserStats>("UserStats", userStatsSchema);
