import { Schema, model, Document } from "mongoose";

export interface IContestRatingEvent extends Document {
  contestId: string;
  userId: string;
  rank: number;
  delta: number;
  ratingBefore: number;
  ratingAfter: number;
  createdAt: Date;
}

const contestRatingEventSchema = new Schema<IContestRatingEvent>(
  {
    contestId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    rank: { type: Number, required: true },
    delta: { type: Number, required: true },
    ratingBefore: { type: Number, required: true },
    ratingAfter: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

contestRatingEventSchema.index({ contestId: 1, userId: 1 }, { unique: true });

export const ContestRatingEvent = model<IContestRatingEvent>(
  "ContestRatingEvent",
  contestRatingEventSchema
);
