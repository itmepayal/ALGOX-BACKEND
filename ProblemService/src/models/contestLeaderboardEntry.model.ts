import mongoose, { Document, Schema, Types } from "mongoose";

export interface IContestLeaderboardEntry extends Document {
  contestId: Types.ObjectId;
  userId: string;
  rank: number;
  score: number;
  solvedCount: number;
  penalty: number;
  updatedAt: Date;
  createdAt: Date;
}

const contestLeaderboardEntrySchema = new Schema<IContestLeaderboardEntry>(
  {
    contestId: {
      type: Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },
    rank: { type: Number, required: true, min: 1 },
    score: { type: Number, default: 0, min: 0 },
    solvedCount: { type: Number, default: 0, min: 0 },
    penalty: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

contestLeaderboardEntrySchema.index(
  { contestId: 1, userId: 1 },
  { unique: true }
);
contestLeaderboardEntrySchema.index({ contestId: 1, rank: 1 });

export const ContestLeaderboardEntry = mongoose.model<IContestLeaderboardEntry>(
  "ContestLeaderboardEntry",
  contestLeaderboardEntrySchema
);
