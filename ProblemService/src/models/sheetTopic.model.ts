import mongoose, { Document, Schema, Types } from "mongoose";

export interface ISheetTopic extends Document {
  section: Types.ObjectId;
  sheetId: string;
  title: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const sheetTopicSchema = new Schema<ISheetTopic>(
  {
    section: {
      type: Schema.Types.ObjectId,
      ref: "SheetSection",
      required: true,
      index: true,
    },
    sheetId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
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

sheetTopicSchema.index({ section: 1, order: 1 });
sheetTopicSchema.index({ sheetId: 1, order: 1 });

export const SheetTopic = mongoose.model<ISheetTopic>(
  "SheetTopic",
  sheetTopicSchema
);
