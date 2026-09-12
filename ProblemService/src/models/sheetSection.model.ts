import mongoose, { Document, Schema, Types } from "mongoose";

export interface ISheetSection extends Document {
  sheet: Types.ObjectId;
  sheetId: string;
  title: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const sheetSectionSchema = new Schema<ISheetSection>(
  {
    sheet: {
      type: Schema.Types.ObjectId,
      ref: "Sheet",
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

sheetSectionSchema.index({ sheetId: 1, order: 1 });

export const SheetSection = mongoose.model<ISheetSection>(
  "SheetSection",
  sheetSectionSchema
);
