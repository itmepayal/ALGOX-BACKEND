import { z } from "zod";

export const testcaseSchema = z.object({
  // Accept string ("[1,2]") or structured object ({ nums: [1,2] })
  input: z.union([z.string().min(1), z.record(z.any()), z.array(z.any())]),
  output: z.string().min(1).optional(),
  expectedOutput: z.string().min(1).optional(),
  isHidden: z.boolean().optional().default(false),
  order: z.number().optional(),
}).refine((tc) => Boolean(tc.output || tc.expectedOutput), {
  message: "Testcase output (or expectedOutput) is required",
});

export const codeStubSchema = z.object({
  language: z.enum(["python", "javascript", "cpp", "java"]),
  startSnippet: z.string().optional().default(""),
  userTemplate: z.string().min(1, "User code template is required"),
});

export const createProblemSchema = z.object({
  title: z.string().min(2, "Title must be at least 2 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  difficulty: z.enum(["easy", "medium", "hard"]),
  category: z.string().min(2, "Category is required"),
  tags: z.array(z.string()).optional().default([]),
  editorial: z.string().optional(),
  codeStubs: z.array(codeStubSchema).optional().default([]),
  testcases: z.array(testcaseSchema).min(1, "At least one testcase is required"),
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
});

export type CreateProblemDto = z.infer<typeof createProblemSchema>;
export type UpdateProblemDto = z.infer<typeof updateProblemSchema>;
export type ProblemQueryDto = z.infer<typeof problemQuerySchema>;
