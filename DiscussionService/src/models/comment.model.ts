import { Schema, model, Document, Types } from "mongoose";

export interface IComment extends Document {
  postId: Types.ObjectId;
  parentId?: Types.ObjectId;
  authorId: Types.ObjectId;
  authorName: string;
  content: string;
  upvotes: number;
  upvotedBy: Types.ObjectId[];
  status: "ACTIVE" | "HIDDEN" | "DELETED";
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<IComment>(
  {
    postId: { type: Schema.Types.ObjectId, required: true, index: true },
    parentId: { type: Schema.Types.ObjectId, index: true },
    authorId: { type: Schema.Types.ObjectId, required: true, index: true },
    authorName: { type: String, required: true },
    content: { type: String, required: true },
    upvotes: { type: Number, default: 0 },
    upvotedBy: [{ type: Schema.Types.ObjectId }],
    status: {
      type: String,
      enum: ["ACTIVE", "HIDDEN", "DELETED"],
      default: "ACTIVE",
      index: true,
    },
  },
  { timestamps: true }
);

commentSchema.index({ postId: 1, status: 1, createdAt: 1 });

export const Comment = model<IComment>("Comment", commentSchema);
