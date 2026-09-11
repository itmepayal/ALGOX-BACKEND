import { Schema, model, Document, Types } from "mongoose";

export interface IProblemRevision extends Document {
  userId: Types.ObjectId;
  problemId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const problemRevisionSchema = new Schema<IProblemRevision>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    problemId: { type: Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: true }
);

problemRevisionSchema.index({ userId: 1, problemId: 1 }, { unique: true });

export const ProblemRevision = model<IProblemRevision>(
  "ProblemRevision",
  problemRevisionSchema
);
