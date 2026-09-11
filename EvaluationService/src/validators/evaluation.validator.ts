import { z } from "zod";

export const runCodeSchema = z.object({
  code: z.string().min(1, "Code is required"),
  language: z.enum(["python", "javascript", "cpp", "java"]),
  // Accept string stdin OR structured judge input ({ nums: [...] }) from ProblemService
  input: z
    .union([
      z.string(),
      z.record(z.any()),
      z.array(z.any()),
      z.number(),
      z.boolean(),
    ])
    .optional()
    .default(""),
  timeLimitMs: z.number().optional(),
  memoryLimitMb: z.number().optional(),
});

export const evaluateSubmissionSchema = z.object({
  submissionId: z.string().min(1, "Submission ID is required"),
  problemId: z.string().min(1, "Problem ID is required"),
  code: z.string().min(1, "Code is required"),
  language: z.enum(["python", "javascript", "cpp", "java"]),
  // Optional and IGNORED — official suite is always loaded from ProblemService.
  testcases: z
    .array(
      z.object({
        input: z.union([z.string(), z.record(z.any()), z.array(z.any())]),
        output: z.string().optional(),
        expectedOutput: z.string().optional(),
        isHidden: z.boolean().optional(),
      })
    )
    .optional(),
  timeLimitMs: z.number().optional(),
  memoryLimitMb: z.number().optional(),
});

export type RunCodeDto = z.infer<typeof runCodeSchema>;
export type EvaluateSubmissionDto = z.infer<typeof evaluateSubmissionSchema>;
