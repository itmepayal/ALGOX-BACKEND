import { z } from "zod";

/** Cancel / resume accept no client-controlled plan/status fields. */
export const subscriptionActionBodySchema = z.object({}).strict();

export const subscriptionHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  })
  .strict();
