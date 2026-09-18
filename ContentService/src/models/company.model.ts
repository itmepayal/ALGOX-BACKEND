import { Schema, model, Document } from "mongoose";

/**
 * Configured company for interview prep.
 * Counts and metadata come only from admin-configured question rows — never invented.
 */
export interface ICompany extends Document {
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  /** When true, full question dataset requires premium.company_questions. */
  isPremium: boolean;
  /**
   * Free users may see up to this many non-premium questions (intentionally configured).
   * 0 = directory only / no question preview.
   */
  freePreviewLimit: number;
  /** Published companies appear in the public directory. */
  isPublished: boolean;
  /** Optional roles offered for filtering (configured). */
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

const companySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true, trim: true, index: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: { type: String, default: "" },
    logoUrl: { type: String },
    isPremium: { type: Boolean, default: true, index: true },
    freePreviewLimit: { type: Number, default: 0, min: 0 },
    isPublished: { type: Boolean, default: false, index: true },
    roles: { type: [String], default: [] },
  },
  { timestamps: true }
);

companySchema.index({ isPublished: 1, name: 1 });

export const Company = model<ICompany>("Company", companySchema);
