import { z } from "zod";

export const contestStatusSchema = z.enum([
  "DRAFT",
  "SCHEDULED",
  "LIVE",
  "ENDED",
  "ARCHIVED",
]);

const slugSchema = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case");

export const createContestSchema = z
  .object({
    title: z.string().min(1).max(200),
    slug: slugSchema,
    description: z.string().max(10000).optional().default(""),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    durationMinutes: z.number().int().min(1).optional(),
    rules: z.string().max(20000).optional().default(""),
    status: contestStatusSchema.optional().default("DRAFT"),
  })
  .refine((d) => d.endTime > d.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

export const updateContestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(10000).optional(),
    startTime: z.coerce.date().optional(),
    endTime: z.coerce.date().optional(),
    durationMinutes: z.number().int().min(1).optional(),
    rules: z.string().max(20000).optional(),
  })
  .refine(
    (d) => {
      if (d.startTime && d.endTime) return d.endTime > d.startTime;
      return true;
    },
    { message: "endTime must be after startTime", path: ["endTime"] }
  );

export const addContestProblemSchema = z.object({
  problemId: z.string().min(1),
  points: z.number().int().min(0).optional().default(100),
  order: z.number().int().min(0).optional(),
});

export const bulkAddContestProblemsSchema = z.object({
  problems: z
    .array(
      z.object({
        problemId: z.string().min(1),
        points: z.number().int().min(0).optional().default(100),
        order: z.number().int().min(0).optional(),
      })
    )
    .min(1),
});
