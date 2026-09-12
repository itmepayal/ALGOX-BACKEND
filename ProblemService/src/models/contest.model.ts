import mongoose, { Document, Schema } from "mongoose";

export type ContestStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "LIVE"
  | "ENDED"
  | "ARCHIVED";

export interface IContest extends Document {
  title: string;
  slug: string;
  description: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  status: ContestStatus;
  rules: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const contestSchema = new Schema<IContest>(
  {
    title: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    description: { type: String, default: "" },
    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["DRAFT", "SCHEDULED", "LIVE", "ENDED", "ARCHIVED"],
      default: "DRAFT",
      index: true,
    },
    rules: { type: String, default: "" },
    createdBy: { type: String },
    updatedBy: { type: String },
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

contestSchema.index({ status: 1, startTime: 1 });

export const Contest = mongoose.model<IContest>("Contest", contestSchema);
