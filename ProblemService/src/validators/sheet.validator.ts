import { z } from "zod";

export const sheetStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export const sheetAccessSchema = z.enum(["FREE", "PREMIUM"]);

export const createSheetSchema = z.object({
  sheetId: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "sheetId must be kebab-case"),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().default(""),
  order: z.number().int().min(0).optional().default(0),
  status: sheetStatusSchema.optional().default("DRAFT"),
  access: sheetAccessSchema.optional().default("FREE"),
});

export const updateSheetSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  order: z.number().int().min(0).optional(),
  access: sheetAccessSchema.optional(),
});

export const createSectionSchema = z.object({
  title: z.string().min(1).max(200),
  order: z.number().int().min(0).optional(),
});

export const updateSectionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  order: z.number().int().min(0).optional(),
});

export const createTopicSchema = z.object({
  title: z.string().min(1).max(200),
  order: z.number().int().min(0).optional(),
});

export const updateTopicSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  order: z.number().int().min(0).optional(),
});

export const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export const attachProblemSchema = z.object({
  problemId: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  order: z.number().int().min(0).optional(),
}).refine((d) => Boolean(d.problemId || d.slug), {
  message: "problemId or slug is required",
});

export const bulkAttachSchema = z.object({
  problems: z
    .array(
      z.object({
        problemId: z.string().min(1).optional(),
        slug: z.string().min(1).optional(),
        order: z.number().int().min(0).optional(),
      }).refine((d) => Boolean(d.problemId || d.slug), {
        message: "problemId or slug is required",
      })
    )
    .min(1)
    .max(500),
});

export const syncFromCatalogSchema = z.object({
  sheetId: z.string().min(1).optional().default("striver-a2z"),
  publish: z.boolean().optional().default(true),
});
