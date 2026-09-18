import { Schema, model, Document, Types } from "mongoose";

/**
 * Important — interview/exam priority marker.
 * Independent of Favourite and Bookmark.
 */
export interface IProblemImportant extends Document {
  userId: Types.ObjectId;
  problemId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const problemImportantSchema = new Schema<IProblemImportant>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    problemId: { type: Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: true }
);

problemImportantSchema.index({ userId: 1, problemId: 1 }, { unique: true });

export const ProblemImportant = model<IProblemImportant>(
  "ProblemImportant",
  problemImportantSchema
);
