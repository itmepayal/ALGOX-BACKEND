import { z } from "zod";
import {
  MOCK_INTERVIEW_DIFFICULTIES,
  MOCK_INTERVIEW_DURATIONS_MINUTES,
  MOCK_INTERVIEW_LANGUAGES,
  MOCK_INTERVIEW_PROBLEM_COUNTS,
  MOCK_INTERVIEW_TYPES,
} from "../config/mockInterview.config";

export const startMockInterviewSchema = z
  .object({
    company: z.string().trim().max(120).optional(),
    role: z.string().trim().max(120).optional(),
    interviewType: z.enum(MOCK_INTERVIEW_TYPES).default("coding"),
    difficulty: z.enum(MOCK_INTERVIEW_DIFFICULTIES).default("medium"),
    durationMinutes: z
      .number()
      .int()
      .refine((n) => (MOCK_INTERVIEW_DURATIONS_MINUTES as readonly number[]).includes(n), {
        message: `durationMinutes must be one of ${MOCK_INTERVIEW_DURATIONS_MINUTES.join(", ")}`,
      })
      .default(45),
    language: z.enum(MOCK_INTERVIEW_LANGUAGES),
    topics: z.array(z.string().trim().min(1).max(64)).max(12).default([]),
    problemCount: z
      .number()
      .int()
      .refine((n) => (MOCK_INTERVIEW_PROBLEM_COUNTS as readonly number[]).includes(n), {
        message: `problemCount must be one of ${MOCK_INTERVIEW_PROBLEM_COUNTS.join(", ")}`,
      })
      .default(1),
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
