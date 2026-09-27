import mongoose, { Document, Schema, Types } from "mongoose";

export interface IBattleProblem extends Document {
  battleId: Types.ObjectId;
  problemId: Types.ObjectId;
  order: number;
  points: number;
  title: string;
  slug: string;
  difficulty: string;
  createdAt: Date;
  updatedAt: Date;
}

const battleProblemSchema = new Schema<IBattleProblem>(
  {
    battleId: { type: Schema.Types.ObjectId, required: true, index: true },
    problemId: { type: Schema.Types.ObjectId, required: true, index: true },
    order: { type: Number, required: true },
    points: { type: Number, required: true },
    title: { type: String, required: true },
    slug: { type: String, required: true },
    difficulty: { type: String, required: true },
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

battleProblemSchema.index({ battleId: 1, order: 1 });
battleProblemSchema.index({ battleId: 1, problemId: 1 }, { unique: true });

export const BattleProblem = mongoose.model<IBattleProblem>(
  "BattleProblem",
  battleProblemSchema
);
