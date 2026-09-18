import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createCompanySchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(slugRegex, "slug must be lowercase kebab-case")
    .optional(),
  description: z.string().max(4000).optional().default(""),
  logoUrl: z.string().url().optional().or(z.literal("")),
  isPremium: z.boolean().optional().default(true),
  freePreviewLimit: z.number().int().min(0).max(100).optional().default(0),
  isPublished: z.boolean().optional().default(false),
  roles: z.array(z.string().min(1).max(80)).optional().default([]),
});

export const updateCompanySchema = createCompanySchema.partial();

export const createCompanyQuestionSchema = z.object({
  problemId: z.string().min(1),
  title: z.string().min(1).max(300),
  slug: z.string().max(120).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  topics: z.array(z.string().min(1).max(80)).optional().default([]),
  role: z.string().max(80).optional().or(z.literal("")),
  /** Only store when explicitly provided — never invent. */
  frequency: z.number().min(0).max(100).nullable().optional(),
  lastSeenAt: z
    .union([
      z.string().datetime(),
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      z.null(),
      z.literal(""),
    ])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  isPremium: z.boolean().optional().default(false),
  order: z.number().int().min(0).optional().default(0),
});

export const updateCompanyQuestionSchema = createCompanyQuestionSchema.partial();

export const companyDirectoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  premium: z.enum(["all", "free", "premium"]).optional().default("all"),
});

export const companyQuestionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  topic: z.string().optional(),
  role: z.string().optional(),
  /** all | free | premium — question-level isPremium */
  access: z.enum(["all", "free", "premium"]).optional().default("all"),
});

export type CreateCompanyDto = z.infer<typeof createCompanySchema>;
export type UpdateCompanyDto = z.infer<typeof updateCompanySchema>;
export type CreateCompanyQuestionDto = z.infer<typeof createCompanyQuestionSchema>;
export type UpdateCompanyQuestionDto = z.infer<typeof updateCompanyQuestionSchema>;
export type CompanyDirectoryQuery = z.infer<typeof companyDirectoryQuerySchema>;
export type CompanyQuestionsQuery = z.infer<typeof companyQuestionsQuerySchema>;
