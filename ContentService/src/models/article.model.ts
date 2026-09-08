import { Schema, model, Document, Types } from "mongoose";

export interface IArticle extends Document {
  title: string;
  slug: string;
  authorName: string;
  authorAvatar?: string;
  summary: string;
  content: string; // Markdown article content (e.g., Dynamic Programming Masterclass)
  category: "guide" | "tutorial" | "system-design" | "company-insights";
  readTimeMinutes: number;
  likesCount: number;
  likedBy: Types.ObjectId[];
  viewsCount: number;
  isPublished: boolean;
  tags: string[];
}

const articleSchema = new Schema<IArticle>(
  {
    title: { type: String, required: true, index: true },
    slug: { type: String, required: true, unique: true, index: true },
    authorName: { type: String, required: true },
    authorAvatar: { type: String },
    summary: { type: String, required: true },
    content: { type: String, required: true },
    category: {
      type: String,
      enum: ["guide", "tutorial", "system-design", "company-insights"],
      default: "guide",
      index: true,
    },
    readTimeMinutes: { type: Number, default: 5 },
    likesCount: { type: Number, default: 0, index: true },
    likedBy: [{ type: Schema.Types.ObjectId }],
    viewsCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
    tags: [{ type: String, index: true }],
  },
  { timestamps: true }
);

articleSchema.index({ title: "text", summary: "text", content: "text", tags: "text" });

export const Article = model<IArticle>("Article", articleSchema);
