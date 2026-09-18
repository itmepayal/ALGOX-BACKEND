import { z } from "zod";

export const dailyGoalsSchema = z.object({
  problemsPerDay: z.number().int().min(1).max(50),
  studyMinutes: z.number().int().min(15).max(600),
  revisionTopics: z.number().int().min(0).max(10),
  sessionsPerDay: z.number().int().min(0).max(10),
});

export const plannerTaskSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(["problem", "revision", "session", "custom"]),
  title: z.string().min(1).max(300),
  problemId: z.string().max(64).optional(),
  problemSlug: z.string().max(200).optional(),
  completed: z.boolean(),
  completedSource: z.enum(["manual", "submission"]).optional(),
  createdAt: z.number().int().positive(),
});

export const dailyPlanSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tasks: z.array(plannerTaskSchema).max(100),
  notes: z.string().max(2000).optional(),
});

export const startSessionSchema = z.object({
  topic: z.string().trim().min(1).max(200).optional().default("General"),
});

export const sessionActivitySchema = z.object({
  problemId: z.string().min(1).max(64),
  solved: z.boolean().optional().default(false),
});

export type DailyGoalsDto = z.infer<typeof dailyGoalsSchema>;
export type DailyPlanDto = z.infer<typeof dailyPlanSchema>;
