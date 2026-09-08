import { Schema, model, Document, Types } from "mongoose";

export interface IPost extends Document {
  title: string;
  content: string;
  authorId: Types.ObjectId;
  authorName: string;
  authorAvatar?: string;
  category: "interview_experience" | "compensation" | "solution" | "general" | "career";
  problemId?: Types.ObjectId;
  language?: "cpp" | "java" | "python" | "javascript" | "typescript" | "golang" | "csharp";
  timeComplexity?: string; // e.g. O(N log N)
  spaceComplexity?: string; // e.g. O(1)
  companyTags?: string[]; // e.g. ['Google', 'Amazon', 'Meta']
  tags: string[];
  upvotes: number;
  downvotes: number;
  upvotedBy: Types.ObjectId[];
  downvotedBy: Types.ObjectId[];
  bookmarksCount: number;
  bookmarkedBy: Types.ObjectId[];
  viewsCount: number;
  commentCount: number;
  isPinned: boolean;
  isAcceptedSolution?: boolean; // Featured / LeetCode Official Solution badge
}

const postSchema = new Schema<IPost>(
  {
    title: { type: String, required: true, index: true },
    content: { type: String, required: true },
    authorId: { type: Schema.Types.ObjectId, required: true, index: true },
    authorName: { type: String, required: true },
    authorAvatar: { type: String },
    category: {
      type: String,
      enum: ["interview_experience", "compensation", "solution", "general", "career"],
      default: "general",
      index: true,
    },
    problemId: { type: Schema.Types.ObjectId, index: true },
    language: { type: String, index: true },
    timeComplexity: { type: String },
    spaceComplexity: { type: String },
    companyTags: [{ type: String, index: true }],
    tags: [{ type: String, index: true }],
    upvotes: { type: Number, default: 0, index: true },
    downvotes: { type: Number, default: 0 },
    upvotedBy: [{ type: Schema.Types.ObjectId }],
    downvotedBy: [{ type: Schema.Types.ObjectId }],
    bookmarksCount: { type: Number, default: 0, index: true },
    bookmarkedBy: [{ type: Schema.Types.ObjectId }],
    viewsCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    isPinned: { type: Boolean, default: false },
    isAcceptedSolution: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

postSchema.index({ title: "text", content: "text", tags: "text" }); // Full-text search index
postSchema.index({ createdAt: -1 });
postSchema.index({ upvotes: -1, createdAt: -1 });

export const Post = model<IPost>("Post", postSchema);
