import { Schema, model, Document, Types } from "mongoose";

export type ReactionType = "like" | "dislike";

export interface IProblemReaction extends Document {
  userId: Types.ObjectId;
  problemId: Types.ObjectId;
  reaction: ReactionType;
  createdAt: Date;
  updatedAt: Date;
}

const problemReactionSchema = new Schema<IProblemReaction>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    problemId: { type: Schema.Types.ObjectId, required: true, index: true },
    reaction: {
      type: String,
      enum: ["like", "dislike"],
      required: true,
    },
  },
  { timestamps: true }
);

// One reaction per user per problem
problemReactionSchema.index({ userId: 1, problemId: 1 }, { unique: true });
problemReactionSchema.index({ problemId: 1, reaction: 1 });

export const ProblemReaction = model<IProblemReaction>(
  "ProblemReaction",
  problemReactionSchema
);
