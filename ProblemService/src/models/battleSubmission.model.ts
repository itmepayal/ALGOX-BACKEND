import mongoose, { Document, Schema, Types } from "mongoose";

export interface IBattleSubmission extends Document {
  battleId: Types.ObjectId;
  userId: Types.ObjectId;
  problemId: Types.ObjectId;
  submissionId: Types.ObjectId;
  status: string;
  pointsAwarded: number;
  isFirstSolve: boolean;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const battleSubmissionSchema = new Schema<IBattleSubmission>(
  {
    battleId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    problemId: { type: Schema.Types.ObjectId, required: true, index: true },
    submissionId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, required: true },
    pointsAwarded: { type: Number, default: 0 },
    isFirstSolve: { type: Boolean, default: false },
    submittedAt: { type: Date, default: Date.now },
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

battleSubmissionSchema.index({ battleId: 1, userId: 1, problemId: 1 });
battleSubmissionSchema.index({ battleId: 1, submittedAt: -1 });

export const BattleSubmission = mongoose.model<IBattleSubmission>(
  "BattleSubmission",
  battleSubmissionSchema
);
