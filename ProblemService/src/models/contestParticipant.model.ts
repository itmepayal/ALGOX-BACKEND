import mongoose, { Document, Schema, Types } from "mongoose";

export interface IContestParticipant extends Document {
  contestId: Types.ObjectId;
  userId: string;
  registeredAt: Date;
  score: number;
  solvedCount: number;
  penalty: number;
  createdAt: Date;
  updatedAt: Date;
}

const contestParticipantSchema = new Schema<IContestParticipant>(
  {
    contestId: {
      type: Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },
    registeredAt: { type: Date, default: Date.now },
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

contestParticipantSchema.index({ contestId: 1, userId: 1 }, { unique: true });
contestParticipantSchema.index({ contestId: 1, score: -1, penalty: 1 });

export const ContestParticipant = mongoose.model<IContestParticipant>(
  "ContestParticipant",
  contestParticipantSchema
);
