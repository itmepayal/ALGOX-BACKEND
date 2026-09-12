import mongoose, { Document, Schema, Types } from "mongoose";

export interface IContestSubmission extends Document {
  contestId: Types.ObjectId;
  submissionId: string;
  userId: string;
  problemId: Types.ObjectId;
  status: string;
  score: number;
  createdAt: Date;
  updatedAt: Date;
}

const contestSubmissionSchema = new Schema<IContestSubmission>(
  {
    contestId: {
      type: Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
      index: true,
    },
    submissionId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    problemId: {
      type: Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
      index: true,
    },
    status: { type: String, required: true, default: "PENDING" },
    score: { type: Number, default: 0, min: 0 },
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

contestSubmissionSchema.index({ contestId: 1, userId: 1, problemId: 1 });
contestSubmissionSchema.index(
  { contestId: 1, submissionId: 1 },
  { unique: true }
);

export const ContestSubmission = mongoose.model<IContestSubmission>(
  "ContestSubmission",
  contestSubmissionSchema
);
