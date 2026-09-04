import { z } from "zod";

export const testcaseSchema = z.object({
  input: z.string().min(1, "Testcase input is required"),
  output: z.string().min(1, "Testcase output is required"),
  isHidden: z.boolean().optional().default(false),
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
