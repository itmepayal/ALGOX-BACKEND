import { z } from "zod";

export const createSubmissionSchema = z.object({
  userId: z.string().optional(),
  problemId: z.string().min(1, "Problem ID is required"),
  language: z.enum(["python", "javascript", "cpp", "java"]),
  code: z.string().min(1, "Code content is required"),
});

export const updateSubmissionSchema = z.object({
  status: z.enum([
    "PENDING",
    "RUNNING",
    "ACCEPTED",
    "WRONG_ANSWER",
    "TIME_LIMIT_EXCEEDED",
    "MEMORY_LIMIT_EXCEEDED",
    "RUNTIME_ERROR",
    "COMPILATION_ERROR",
  ]).optional(),
  output: z.string().optional(),
  error: z.string().optional(),
  executionTime: z.number().optional(),
  memory: z.number().optional(),
  testCasesPassed: z.number().optional(),
  totalTestCases: z.number().optional(),
});

export const submissionQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 10)),
  userId: z.string().optional(),
  problemId: z.string().optional(),
  status: z.enum([
    "PENDING",
    "RUNNING",
    "ACCEPTED",
    "WRONG_ANSWER",
    "TIME_LIMIT_EXCEEDED",
    "MEMORY_LIMIT_EXCEEDED",
    "RUNTIME_ERROR",
    "COMPILATION_ERROR",
  ]).optional(),
  language: z.enum(["python", "javascript", "cpp", "java"]).optional(),
});

export type CreateSubmissionDto = z.infer<typeof createSubmissionSchema>;
export type UpdateSubmissionDto = z.infer<typeof updateSubmissionSchema>;
export type SubmissionQueryDto = z.infer<typeof submissionQuerySchema>;
