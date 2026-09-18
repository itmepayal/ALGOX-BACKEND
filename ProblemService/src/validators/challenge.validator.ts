import { z } from "zod";

export const completeChallengeSchema = z
  .object({
    submissionId: z.string().min(1).max(128).optional(),
  })
  .strict();

export const timezoneSchema = z
  .object({
    timezone: z.string().min(1).max(64),
  })
  .strict();

export const streakGoalsSchema = z
  .object({
    weeklyGoalTarget: z.number().int().min(1).max(7).optional(),
    monthlyGoalTarget: z.number().int().min(1).max(31).optional(),
  })
  .strict();

export const adminChallengeSchema = z
  .object({
    problemId: z.string().min(1),
    tier: z.enum(["standard", "advanced"]).optional(),
    isPublished: z.boolean().optional(),
  })
  .strict();

export const internalQualifySchema = z
  .object({
    userId: z.string().min(1),
    problemId: z.string().min(1),
    submissionId: z.string().min(1).optional(),
  })
  .strict();
