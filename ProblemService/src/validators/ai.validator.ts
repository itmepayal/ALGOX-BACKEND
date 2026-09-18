import { z } from "zod";
import { AI_FEATURES, type AiFeatureId } from "../ai/aiFeatures";

const MAX_CODE = 4000;
const MAX_TEXT = 2000;

export const aiAssistSchema = z
  .object({
    feature: z.enum(AI_FEATURES as unknown as [AiFeatureId, ...AiFeatureId[]]),
    problemId: z.string().min(1).max(64).optional(),
    userMessage: z.string().max(MAX_TEXT).optional(),
    errorMessage: z.string().max(MAX_TEXT).optional(),
    testCase: z.string().max(MAX_TEXT).optional(),
    /** Ephemeral — never persisted. */
    codeSnippet: z.string().max(MAX_CODE).optional(),
    language: z.enum(["python", "javascript", "cpp", "java"]).optional(),
  })
  .strict();

export type AiAssistDto = z.infer<typeof aiAssistSchema>;
