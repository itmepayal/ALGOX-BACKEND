import { z } from "zod";

export const startMockInterviewSchema = z
  .object({
    company: z.string().trim().max(120).optional(),
    role: z.string().trim().max(120).optional(),
    difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("medium"),
    durationMinutes: z.number().int().min(10).max(180).default(45),
    language: z.enum(["python", "javascript", "cpp", "java"]),
    topics: z.array(z.string().trim().min(1).max(64)).max(12).default([]),
    problemCount: z.number().int().min(1).max(5).default(1),
  })
  .strict();

export const attachSubmissionSchema = z
  .object({
    problemId: z.string().min(1),
    submissionId: z.string().min(1),
  })
  .strict();

export const recordInterviewSubmissionSchema = z
  .object({
    submissionId: z.string().min(1),
    userId: z.string().min(1),
    problemId: z.string().min(1),
    status: z.string().min(1),
    testCasesPassed: z.number().optional(),
    totalTestCases: z.number().optional(),
    executionTimeMs: z.number().optional(),
    memoryMb: z.number().optional(),
    language: z.string().optional(),
    source: z.string().optional(),
  })
  .strict();

export type StartMockInterviewDto = z.infer<typeof startMockInterviewSchema>;
