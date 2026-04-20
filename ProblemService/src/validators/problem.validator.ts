import { z } from "zod";

export const difficultyEnum = z.enum(["easy", "medium", "hard"]);

export const difficultyParamsSchema = z.object({
  difficulty: difficultyEnum,
});

export const testcaseSchema = z.object({
  input: z.string().min(1, "Input is required"),
  output: z.string().min(1, "Output is required"),
  isHidden: z.boolean().optional().default(false),
});

export const createProblemSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  difficulty: difficultyEnum,
  category: z.string().min(1, "Category is required"),
  editorial: z.string().optional(),
  testcases: z
    .array(testcaseSchema)
    .min(1, "At least one testcase is required"),
});

export const updateProblemSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  difficulty: difficultyEnum.optional(),
  category: z.string().min(1).optional(),
  editorial: z.string().optional(),
  testcases: z.array(testcaseSchema).optional(),
});

export type CreateProblemDto = z.infer<typeof createProblemSchema>;
export type UpdateProblemDto = z.infer<typeof updateProblemSchema>;
export type TestcaseDto = z.infer<typeof testcaseSchema>;
export type DifficultyDto = z.infer<typeof difficultyEnum>;
