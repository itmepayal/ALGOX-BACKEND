import mongoose, { Document, Schema, Types } from "mongoose";

export interface ISolveEvent extends Document {
  userId: Types.ObjectId;
  /** When set, enforces one unique solve credit per user+problem. */
  problemId?: string | null;
  difficulty: "easy" | "medium" | "hard";
  solvedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const solveEventSchema = new Schema<ISolveEvent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    problemId: {
      type: String,
      default: null,
      index: true,
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: true,
    },
    solvedAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { timestamps: true }
);

solveEventSchema.index({ solvedAt: -1 });
solveEventSchema.index({ userId: 1, solvedAt: -1 });
// ONE USER + ONE PROBLEM = ONE UNIQUE SOLVE (sparse so legacy rows without problemId remain valid)
solveEventSchema.index(
  { userId: 1, problemId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      problemId: { $type: "string", $gt: "" },
    },
  }
);

export const SolveEvent = mongoose.model<ISolveEvent>(
  "SolveEvent",
  solveEventSchema
);
