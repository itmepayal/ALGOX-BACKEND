import { z } from "zod";

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid ObjectId");

/** Reject accidental UI-chrome spam titles like "Create article"×N. */
function rejectChromeSpamTitle(title: string, ctx: z.RefinementCtx) {
  const t = title.trim();
  const labels = [
    "Create article",
    "Create study plan",
    "Save",
    "Submit",
    "Publish",
  ];
  for (const label of labels) {
    if (t.toLowerCase() === label.toLowerCase()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a real title (not a button label).",
      });
      return;
    }
    // Reject 2+ concatenations of the same chrome label
    if (t.length >= label.length * 2 && t.length % label.length === 0) {
      const reps = t.length / label.length;
      if (reps >= 2 && label.repeat(reps) === t) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Title looks duplicated. Enter the name once.",
        });
        return;
      }
    }
  }
}

export const articleCategoryEnum = z.enum([
  "guide",
  "tutorial",
  "system-design",
  "company-insights",
]);

export const studyPlanCategoryEnum = z.enum([
  "interview",
  "algorithm",
  "data-structure",
  "sql",
  "system-design",
]);

export const studyPlanDifficultyEnum = z.enum([
  "beginner",
  "intermediate",
  "advanced",
]);

export const studyPlanAccessEnum = z.enum(["FREE", "PREMIUM"]);

export const editorialLanguageEnum = z.enum([
  "cpp",
  "java",
  "python",
  "javascript",
  "typescript",
  "golang",
  "csharp",
]);

const studyCardSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  problemIds: z.array(z.string().min(1)).optional().default([]),
  estimatedMinutes: z.number().int().min(0).optional(),
});

const codeSnippetSchema = z.object({
  language: editorialLanguageEnum,
  code: z.string().min(1),
});

const editorialSolutionSchema = z.object({
  title: z.string().min(1).max(200),
  approachName: z.string().min(1).max(200),
  explanation: z.string().min(1),
  timeComplexity: z.string().min(1).max(100),
  spaceComplexity: z.string().min(1).max(100),
  codeSnippets: z.array(codeSnippetSchema).optional().default([]),
});

/** Article write fields (shared create/update). */
const articleFieldsSchema = z.object({
  title: z.string().min(2).max(300),
  slug: z.string().min(2).max(300).optional(),
  authorName: z.string().min(1).max(120),
  authorAvatar: z.string().url().optional().or(z.literal("")),
  summary: z.string().min(1).max(2000),
  content: z.string().min(1),
  category: articleCategoryEnum.optional().default("guide"),
  readTimeMinutes: z.number().int().positive().max(500).optional().default(5),
  isPublished: z.boolean().optional().default(true),
  tags: z.array(z.string().min(1).max(64)).optional().default([]),
});

/** Create article — single source schema for article writes. */
export const createArticleSchema = articleFieldsSchema.superRefine((data, ctx) =>
  rejectChromeSpamTitle(data.title, ctx)
);

/** Update article — partial of create (no duplicate field defs). */
export const updateArticleSchema = articleFieldsSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  })
  .superRefine((data, ctx) => {
    if (typeof data.title === "string") rejectChromeSpamTitle(data.title, ctx);
  });

/** Create study plan. */
export const createStudyPlanSchema = z.object({
  title: z.string().min(2).max(300),
  slug: z.string().min(2).max(300).optional(),
  description: z.string().min(1).max(5000),
  coverImage: z.string().url().optional().or(z.literal("")),
  category: studyPlanCategoryEnum.optional().default("interview"),
  topics: z.array(z.string().min(1).max(80)).optional().default([]),
  difficulty: studyPlanDifficultyEnum.optional().default("beginner"),
  estimatedMinutes: z.number().int().min(0).max(100000).optional().default(0),
  estimatedDays: z.number().int().min(0).max(365).optional(),
  /** Sections — same shape as historical `cards`. */
  cards: z.array(studyCardSchema).optional().default([]),
  sections: z.array(studyCardSchema).optional(),
  totalProblemsCount: z.number().int().min(0).optional().default(0),
  access: studyPlanAccessEnum.optional().default("FREE"),
  isPremium: z.boolean().optional(),
  isPublished: z.boolean().optional().default(false),
  prerequisiteSlugs: z.array(z.string().min(1).max(300)).optional().default([]),
}).superRefine((data, ctx) => rejectChromeSpamTitle(data.title, ctx)).transform((data) => {
  const cards = data.sections?.length ? data.sections : data.cards;
  const isPremium =
    data.isPremium !== undefined
      ? data.isPremium
      : data.access === "PREMIUM";
  const access = isPremium ? "PREMIUM" : data.access || "FREE";
  const totalFromCards = (cards || []).reduce(
    (n, c) => n + (c.problemIds?.length || 0),
    0
  );
  return {
    ...data,
    cards,
    sections: undefined,
    isPremium,
    access,
    totalProblemsCount: data.totalProblemsCount || totalFromCards,
  };
});

/** Update study plan — partial of create. */
export const updateStudyPlanSchema = z
  .object({
    title: z.string().min(2).max(300).optional(),
    slug: z.string().min(2).max(300).optional(),
    description: z.string().min(1).max(5000).optional(),
    coverImage: z.string().url().optional().or(z.literal("")),
    category: studyPlanCategoryEnum.optional(),
    topics: z.array(z.string().min(1).max(80)).optional(),
    difficulty: studyPlanDifficultyEnum.optional(),
    estimatedMinutes: z.number().int().min(0).max(100000).optional(),
    estimatedDays: z.number().int().min(0).max(365).optional(),
    cards: z.array(studyCardSchema).optional(),
    sections: z.array(studyCardSchema).optional(),
    totalProblemsCount: z.number().int().min(0).optional(),
    access: studyPlanAccessEnum.optional(),
    isPremium: z.boolean().optional(),
    isPublished: z.boolean().optional(),
    prerequisiteSlugs: z.array(z.string().min(1).max(300)).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  })
  .superRefine((data, ctx) => {
    if (typeof data.title === "string") rejectChromeSpamTitle(data.title, ctx);
  })
  .transform((data) => {
    const out: any = { ...data };
    if (data.sections) {
      out.cards = data.sections;
      delete out.sections;
    }
    if (data.isPremium !== undefined) {
      out.access = data.isPremium ? "PREMIUM" : "FREE";
    } else if (data.access) {
      out.isPremium = data.access === "PREMIUM";
    }
    return out;
  });

export const enrollStudyPlanSchema = z.object({
  studyPlanSlug: z.string().min(1).optional(),
});

export const markStudyPlanProblemSchema = z.object({
  studyPlanSlug: z.string().min(1),
  problemId: z.string().min(1),
});

/** Upsert editorial. */
export const upsertEditorialSchema = z.object({
  problemId: objectId,
  videoUrl: z.string().url().optional().or(z.literal("")),
  hints: z.array(z.string()).optional().default([]),
  solutions: z.array(editorialSolutionSchema).optional().default([]),
  isPremiumOnly: z.boolean().optional().default(false),
});

export type CreateArticleDto = z.infer<typeof createArticleSchema>;
export type UpdateArticleDto = z.infer<typeof updateArticleSchema>;
export type CreateStudyPlanDto = z.infer<typeof createStudyPlanSchema>;
export type UpdateStudyPlanDto = z.infer<typeof updateStudyPlanSchema>;
export type UpsertEditorialDto = z.infer<typeof upsertEditorialSchema>;
