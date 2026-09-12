import mongoose, { Document, Schema, Types } from "mongoose";

export interface ISolveEvent extends Document {
  userId: Types.ObjectId;
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

export const SolveEvent = mongoose.model<ISolveEvent>(
  "SolveEvent",
  solveEventSchema
);
