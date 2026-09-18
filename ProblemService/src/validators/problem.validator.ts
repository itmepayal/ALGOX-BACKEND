import { z } from "zod";

export const testcaseSchema = z.object({
  _id: z.string().optional(),
  // Accept string ("[1,2]") or structured object ({ nums: [1,2] })
  input: z.union([z.string().min(1), z.record(z.any()), z.array(z.any())]),
  output: z.string().min(1).optional(),
  expectedOutput: z.string().min(1).optional(),
  isHidden: z.boolean().optional().default(false),
  order: z.number().optional(),
  explanation: z.string().optional(),
  weight: z.number().positive().optional().default(1),
}).refine((tc) => Boolean(tc.output || tc.expectedOutput), {
  message: "Testcase output (or expectedOutput) is required",
});

export const codeStubSchema = z.object({
  language: z.enum(["python", "javascript", "cpp", "java"]),
  startSnippet: z.string().optional().default(""),
  userTemplate: z.string().min(1, "User code template is required"),
});

export const exampleSchema = z.object({
  input: z.union([z.string(), z.record(z.any()), z.array(z.any())]),
  output: z.string().min(1),
  explanation: z.string().optional(),
});

export const createProblemSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  slug: z.string().min(2).optional(),
  description: z.string().min(10, "Description must be at least 10 characters"),
  difficulty: z.enum(["easy", "medium", "hard"]),
  status: z.enum(["draft", "published", "archived"]).optional().default("draft"),
  category: z.string().min(2, "Category is required"),
  tags: z.array(z.string()).optional().default([]),
  /**
   * Denormalized catalog flag. Runtime access still uses FREE Learning Sheet
   * membership as the authoritative free catalog.
   * Default true so non-sheet problems are premium unless attached to a FREE sheet.
   */
  isPremium: z.boolean().optional().default(true),
  editorial: z.string().optional(),
  hints: z.array(z.string()).optional().default([]),
  constraints: z.string().optional(),
  examples: z.array(exampleSchema).optional().default([]),
  codeStubs: z.array(codeStubSchema).optional().default([]),
  starterCode: z.record(z.string()).optional(),
  testcases: z.array(testcaseSchema).min(1, "At least one testcase is required"),
  functionName: z.string().optional(),
  className: z.string().optional(),
  timeLimitMs: z.number().positive().optional().default(2000),
  memoryLimitMb: z.number().positive().optional().default(256),
  resources: z
    .array(
      z.object({
        type: z.enum(["youtube", "article", "editorial", "docs", "practice"]),
        url: z.string().url(),
        label: z.string().optional(),
        isPremium: z.boolean().optional().default(false),
      })
    )
    .optional()
    .default([]),
  videoUrl: z.string().url().optional().or(z.literal("")),
  articleUrl: z.string().url().optional().or(z.literal("")),
  practiceUrl: z.string().url().optional().or(z.literal("")),
});

export const updateProblemSchema = createProblemSchema.partial();

export const difficultyParamsSchema = z.object({
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export const problemQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 10)),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  status: z.enum(["draft", "published", "archived", "all"]).optional(),
  /** Catalog access filter: All | Free | Premium */
  access: z.enum(["all", "free", "premium"]).optional().default("all"),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const problemStatusSchema = z.object({
  status: z.enum(["draft", "published", "archived"]),
});

export const bulkProblemSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  action: z.enum(["status", "difficulty", "tags", "premium"]),
  status: z.enum(["draft", "published", "archived"]).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  tags: z.array(z.string()).optional(),
  tagMode: z.enum(["replace", "add"]).optional().default("add"),
  /** Bulk set problem-level premium classification */
  isPremium: z.boolean().optional(),
});

export type CreateProblemDto = z.infer<typeof createProblemSchema>;
export type UpdateProblemDto = z.infer<typeof updateProblemSchema>;
export type ProblemQueryDto = z.infer<typeof problemQuerySchema>;
export type BulkProblemDto = z.infer<typeof bulkProblemSchema>;
