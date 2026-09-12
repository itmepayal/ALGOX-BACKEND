import { Schema, model, Document, Types } from "mongoose";

export type ReportTargetType =
  | "USER"
  | "DISCUSSION"
  | "COMMENT"
  | "PROBLEM"
  | "SUBMISSION";

export type ReportReason =
  | "SPAM"
  | "ABUSE"
  | "HARASSMENT"
  | "INCORRECT_CONTENT"
  | "BUG"
  | "COPYRIGHT"
  | "CHEATING"
  | "OTHER";

export type ReportStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "DISMISSED";

export interface IReport extends Document {
  reporterId: Types.ObjectId;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: ReportStatus;
  assignedTo?: Types.ObjectId | null;
  resolution?: string;
  resolvedBy?: Types.ObjectId | null;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<IReport>(
  {
    reporterId: { type: Schema.Types.ObjectId, required: true, index: true },
    targetType: {
      type: String,
      enum: ["USER", "DISCUSSION", "COMMENT", "PROBLEM", "SUBMISSION"],
      required: true,
      index: true,
    },
    targetId: { type: String, required: true, index: true },
    reason: {
      type: String,
      enum: [
        "SPAM",
        "ABUSE",
        "HARASSMENT",
        "INCORRECT_CONTENT",
        "BUG",
        "COPYRIGHT",
        "CHEATING",
        "OTHER",
      ],
      required: true,
      index: true,
    },
    description: { type: String, default: "" },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM",
      index: true,
    },
    status: {
      type: String,
      enum: ["OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"],
      default: "OPEN",
      index: true,
    },
    assignedTo: { type: Schema.Types.ObjectId, default: null },
    resolution: { type: String, default: "" },
    resolvedBy: { type: Schema.Types.ObjectId, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

reportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1, reason: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["OPEN", "UNDER_REVIEW"] } } }
);
reportSchema.index({ status: 1, createdAt: -1 });

export const Report = model<IReport>("Report", reportSchema);
