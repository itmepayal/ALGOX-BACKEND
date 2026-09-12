import mongoose, { Document, Schema } from "mongoose";

export type SheetStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface ISheet extends Document {
  sheetId: string;
  title: string;
  description: string;
  status: SheetStatus;
  order: number;
  /** Denormalized unique problem count for progress APIs. */
  totalProblems: number;
  createdBy?: string;
  updatedBy?: string;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const sheetSchema = new Schema<ISheet>(
  {
    sheetId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      default: "DRAFT",
      index: true,
    },
    order: { type: Number, default: 0, index: true },
    totalProblems: { type: Number, default: 0, min: 0 },
    createdBy: { type: String },
    updatedBy: { type: String },
    publishedAt: { type: Date, default: null },
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

sheetSchema.index({ status: 1, order: 1 });

export const Sheet = mongoose.model<ISheet>("Sheet", sheetSchema);
