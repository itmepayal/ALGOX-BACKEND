import { z } from "zod";

const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, "Invalid ObjectId");

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
]);

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

/** Create article — single source schema for article writes. */
export const createArticleSchema = z.object({
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

/** Update article — partial of create (no duplicate field defs). */
export const updateArticleSchema = createArticleSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

/** Create study plan. */
export const createStudyPlanSchema = z.object({
  title: z.string().min(2).max(300),
  slug: z.string().min(2).max(300).optional(),
  description: z.string().min(1).max(5000),
  coverImage: z.string().url().optional().or(z.literal("")),
  category: studyPlanCategoryEnum.optional().default("interview"),
  cards: z.array(studyCardSchema).optional().default([]),
  totalProblemsCount: z.number().int().min(0).optional().default(0),
});

/** Update study plan — partial of create. */
export const updateStudyPlanSchema = createStudyPlanSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
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
