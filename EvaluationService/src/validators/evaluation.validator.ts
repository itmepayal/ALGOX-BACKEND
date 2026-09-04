import { z } from "zod";

export const runCodeSchema = z.object({
  code: z.string().min(1, "Code is required"),
  language: z.enum(["python", "javascript", "cpp", "java"]),
  input: z.string().default(""),
  timeLimitMs: z.number().optional(),
  memoryLimitMb: z.number().optional(),
});

export const evaluateSubmissionSchema = z.object({
  submissionId: z.string().min(1, "Submission ID is required"),
  problemId: z.string().min(1, "Problem ID is required"),
  code: z.string().min(1, "Code is required"),
  language: z.enum(["python", "javascript", "cpp", "java"]),
  testcases: z.array(
    z.object({
      input: z.string(),
      output: z.string(),
      isHidden: z.boolean().optional(),
    })
  ).min(1, "At least one testcase is required"),
  timeLimitMs: z.number().optional(),
  memoryLimitMb: z.number().optional(),
});

export type RunCodeDto = z.infer<typeof runCodeSchema>;
export type EvaluateSubmissionDto = z.infer<typeof evaluateSubmissionSchema>;
