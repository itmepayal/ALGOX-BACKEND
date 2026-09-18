import { z } from "zod";

const submissionStatusEnum = z.enum([
  "PENDING",
  "RUNNING",
  "ACCEPTED",
  "WRONG_ANSWER",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "RUNTIME_ERROR",
  "COMPILATION_ERROR",
]);

export const createSubmissionSchema = z.object({
  userId: z.string().optional(),
  problemId: z.string().min(1, "Problem ID is required"),
  language: z.enum(["python", "javascript", "cpp", "java"]),
  code: z.string().min(1, "Code content is required"),
  /** submit = official judge (default). run = attempt only, never marks solved. */
  source: z.enum(["run", "submit"]).optional().default("submit"),
  /** When set, ProblemService must confirm contest is LIVE and in window. */
  contestId: z.string().optional(),
  /** When set, ProblemService must confirm mock interview is in window. */
  mockInterviewSessionId: z.string().optional(),
  /** When set, ProblemService must confirm virtual contest session is in window. */
  virtualContestSessionId: z.string().optional(),
  /** Final verdict for source=run (ignored for submit — set by worker). */
  status: submissionStatusEnum.optional(),
  output: z.string().optional(),
  error: z.string().optional(),
  executionTime: z.number().optional(),
  memory: z.number().optional(),
  testCasesPassed: z.number().optional(),
  totalTestCases: z.number().optional(),
});

export const updateSubmissionSchema = z.object({
  status: submissionStatusEnum.optional(),
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
  status: submissionStatusEnum.optional(),
  language: z.enum(["python", "javascript", "cpp", "java"]).optional(),
});

export type CreateSubmissionDto = z.infer<typeof createSubmissionSchema>;
export type UpdateSubmissionDto = z.infer<typeof updateSubmissionSchema>;
export type SubmissionQueryDto = z.infer<typeof submissionQuerySchema>;
