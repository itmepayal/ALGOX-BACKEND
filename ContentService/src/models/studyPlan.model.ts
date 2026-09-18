import { Schema, model, Document } from "mongoose";

/**
 * A section (module) within a study plan — ordered lessons/problems.
 * Array order is authoritative lesson order.
 */
export interface IStudySection {
  title: string;
  description: string;
  /** Ordered problem IDs (lessons). */
  problemIds: string[];
  /** Optional estimated effort for this section (minutes). */
  estimatedMinutes?: number;
}

export type StudyPlanDifficulty = "beginner" | "intermediate" | "advanced";
export type StudyPlanAccess = "FREE" | "PREMIUM";

export interface IStudyPlan extends Document {
  title: string;
  slug: string;
  description: string;
  coverImage?: string;
  category: "interview" | "algorithm" | "data-structure" | "sql" | "system-design";
  /** Topics for filtering (e.g. Arrays, Graphs). */
  topics: string[];
  difficulty: StudyPlanDifficulty;
  /** Estimated total effort in minutes (configured). */
  estimatedMinutes: number;
  /** Convenience days estimate (configured, optional). */
  estimatedDays?: number;
  /**
   * Sections = ordered modules. Stored as `cards` historically;
   * schema field remains `cards` for backward compatibility.
   */
  cards: IStudySection[];
  totalProblemsCount: number;
  /** FREE | PREMIUM access level. */
  access: StudyPlanAccess;
  isPremium: boolean;
  isPublished: boolean;
  /** Other plan slugs that must be completed before enroll. */
  prerequisiteSlugs: string[];
  createdAt: Date;
  updatedAt: Date;
}

const sectionSchema = new Schema<IStudySection>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    problemIds: [{ type: String }],
    estimatedMinutes: { type: Number, min: 0 },
  },
  { _id: false }
);

const studyPlanSchema = new Schema<IStudyPlan>(
  {
    title: { type: String, required: true, index: true },
    slug: { type: String, required: true, unique: true, index: true },
    description: { type: String, required: true },
    coverImage: { type: String },
    category: {
      type: String,
      enum: ["interview", "algorithm", "data-structure", "sql", "system-design"],
      default: "interview",
      index: true,
    },
    topics: { type: [String], default: [], index: true },
    difficulty: {
      type: String,
      enum: ["beginner", "intermediate", "advanced"],
      default: "beginner",
      index: true,
    },
    estimatedMinutes: { type: Number, default: 0, min: 0 },
    estimatedDays: { type: Number, min: 0 },
    cards: { type: [sectionSchema], default: [] },
    totalProblemsCount: { type: Number, default: 0 },
    access: {
      type: String,
      enum: ["FREE", "PREMIUM"],
      default: "FREE",
      index: true,
    },
    isPremium: { type: Boolean, default: false, index: true },
    isPublished: { type: Boolean, default: false, index: true },
    prerequisiteSlugs: { type: [String], default: [] },
  },
  { timestamps: true }
);

studyPlanSchema.index({ isPublished: 1, access: 1, category: 1 });

export const StudyPlan = model<IStudyPlan>("StudyPlan", studyPlanSchema);

/** Normalize cards → sections for API responses. */
export function planSections(plan: any): IStudySection[] {
  return Array.isArray(plan?.cards) ? plan.cards : [];
}

export function countPlanProblems(plan: any): number {
  const sections = planSections(plan);
  const fromCards = sections.reduce(
    (n, s) => n + (Array.isArray(s.problemIds) ? s.problemIds.length : 0),
    0
  );
  return Math.max(Number(plan?.totalProblemsCount) || 0, fromCards);
}

export function orderedProblemIds(plan: any): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of planSections(plan)) {
    for (const id of s.problemIds || []) {
      const pid = String(id);
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      out.push(pid);
    }
  }
  return out;
}
