import { Schema, model, Document, Types } from "mongoose";

/**
 * Interview question mapping for a company.
 * frequency / lastSeenAt are OPTIONAL and must be set by admin — never derived.
 */
export interface ICompanyQuestion extends Document {
  companyId: Types.ObjectId | string;
  problemId: string;
  title: string;
  slug?: string;
  difficulty: "easy" | "medium" | "hard";
  topics: string[];
  /** Role this question is associated with (e.g. SDE, Frontend). */
  role?: string;
  /**
   * Interview frequency if configured by admin.
   * Absent/null = not available (do not invent).
   */
  frequency?: number | null;
  /**
   * Last reported interview sighting if configured.
   * Absent/null = not available.
   */
  lastSeenAt?: Date | null;
  /** Question-level premium lock within a company set. */
  isPremium: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const companyQuestionSchema = new Schema<ICompanyQuestion>(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    problemId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, lowercase: true },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: true,
      index: true,
    },
    topics: { type: [String], default: [], index: true },
    role: { type: String, trim: true, index: true },
    frequency: { type: Number, default: null, min: 0 },
    lastSeenAt: { type: Date, default: null },
    isPremium: { type: Boolean, default: false, index: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

companyQuestionSchema.index(
  { companyId: 1, problemId: 1 },
  { unique: true }
);
companyQuestionSchema.index({ companyId: 1, difficulty: 1, role: 1 });
companyQuestionSchema.index({ companyId: 1, order: 1 });

export const CompanyQuestion = model<ICompanyQuestion>(
  "CompanyQuestion",
  companyQuestionSchema
);
