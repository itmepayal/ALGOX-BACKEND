import { z } from "zod";

export const suspiciousListQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20)),
  status: z
    .enum(["FLAGGED", "REVIEWING", "CONFIRMED", "DISMISSED", "all"])
    .optional(),
  severity: z
    .enum(["REVIEW", "HIGH_RISK", "CRITICAL", "all"])
    .optional(),
  userId: z.string().optional(),
});

export const suspiciousReviewBodySchema = z.object({
  resolution: z.string().max(4000).optional(),
});

export type SuspiciousListQuery = z.infer<typeof suspiciousListQuerySchema>;
export type SuspiciousReviewBody = z.infer<typeof suspiciousReviewBodySchema>;
