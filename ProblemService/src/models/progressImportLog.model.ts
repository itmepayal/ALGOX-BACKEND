import mongoose, { Document, Schema } from "mongoose";

export interface IProgressImportLog extends Document {
  userId: string;
  mode: "preview" | "import";
  totalSubmissions: number;
  uniqueProblems: number;
  solvedProblems: number;
  attemptedProblems: number;
  newProblems: number;
  updatedProblems: number;
  affectedSheets: number;
  revisionItemsAffected: number;
  summary?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const progressImportLogSchema = new Schema<IProgressImportLog>(
  {
    userId: { type: String, required: true, index: true },
    mode: { type: String, enum: ["preview", "import"], required: true },
    totalSubmissions: { type: Number, default: 0 },
    uniqueProblems: { type: Number, default: 0 },
    solvedProblems: { type: Number, default: 0 },
    attemptedProblems: { type: Number, default: 0 },
    newProblems: { type: Number, default: 0 },
    updatedProblems: { type: Number, default: 0 },
    affectedSheets: { type: Number, default: 0 },
    revisionItemsAffected: { type: Number, default: 0 },
    summary: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

progressImportLogSchema.index({ userId: 1, createdAt: -1 });

export const ProgressImportLog = mongoose.model<IProgressImportLog>(
  "ProgressImportLog",
  progressImportLogSchema
);
