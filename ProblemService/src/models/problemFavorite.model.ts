import { Schema, model, Document, Types } from "mongoose";

/**
 * Favourite — distinct from Bookmark.
 * Bookmark = save for later; Favourite = preferred / standout problems.
 */
export interface IProblemFavorite extends Document {
  userId: Types.ObjectId;
  problemId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const problemFavoriteSchema = new Schema<IProblemFavorite>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    problemId: { type: Schema.Types.ObjectId, required: true, index: true },
  },
  { timestamps: true }
);

problemFavoriteSchema.index({ userId: 1, problemId: 1 }, { unique: true });

export const ProblemFavorite = model<IProblemFavorite>(
  "ProblemFavorite",
  problemFavoriteSchema
);
