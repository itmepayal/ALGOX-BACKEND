import mongoose, { Document, Schema, Types } from "mongoose";

export interface IContestProblem extends Document {
  contestId: Types.ObjectId;
  problemId: Types.ObjectId;
  points: number;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const contestProblemSchema = new Schema<IContestProblem>(
  {
    contestId: {
      type: Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
      index: true,
    },
    problemId: {
      type: Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
      index: true,
    },
    points: { type: Number, default: 100, min: 0 },
    order: { type: Number, default: 0, index: true },
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

contestProblemSchema.index({ contestId: 1, problemId: 1 }, { unique: true });
contestProblemSchema.index({ contestId: 1, order: 1 });

export const ContestProblem = mongoose.model<IContestProblem>(
  "ContestProblem",
  contestProblemSchema
);
