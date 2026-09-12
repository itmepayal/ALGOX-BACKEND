import mongoose, { Document, Schema, Types } from "mongoose";

/**
 * Links a curated sheet topic to an existing Problem document.
 * Never duplicates Problem content — only stores ObjectId refs + order.
 */
export interface ISheetProblem extends Document {
  topic: Types.ObjectId;
  sheetId: string;
  problem: Types.ObjectId;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const sheetProblemSchema = new Schema<ISheetProblem>(
  {
    topic: {
      type: Schema.Types.ObjectId,
      ref: "SheetTopic",
      required: true,
      index: true,
    },
    sheetId: { type: String, required: true, index: true },
    problem: {
      type: Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
      index: true,
    },
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

sheetProblemSchema.index({ topic: 1, problem: 1 }, { unique: true });
sheetProblemSchema.index({ topic: 1, order: 1 });
sheetProblemSchema.index({ sheetId: 1, problem: 1 });

export const SheetProblem = mongoose.model<ISheetProblem>(
  "SheetProblem",
  sheetProblemSchema
);
