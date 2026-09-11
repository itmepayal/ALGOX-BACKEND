import { Schema, model, Document, Types } from "mongoose";

export interface IProblemBookmark extends Document {
  userId: Types.ObjectId;
  problemId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const problemBookmarkSchema = new Schema<IProblemBookmark>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    problemId: { type: Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: true }
);

// One bookmark per user per problem
problemBookmarkSchema.index({ userId: 1, problemId: 1 }, { unique: true });

export const ProblemBookmark = model<IProblemBookmark>(
  "ProblemBookmark",
  problemBookmarkSchema
);
