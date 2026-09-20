/**
 * AlgoPath AI — learning assistant feature ids.
 * Designed for guided learning, not solution dumping.
 * All features require active Premium (`premium.ai`).
 */
export const AI_FEATURES = [
  "explain_problem",
  "give_hint",
  "explain_error",
  "explain_test_case",
  "find_bug",
  "explain_complexity",
  "optimize_approach",
  "compare_approaches",
  "generate_similar_problem",
  "interview_mode",
] as const;

export type AiFeatureId = (typeof AI_FEATURES)[number];

/** Every AI feature requires active Premium (premium.ai). */
export const PREMIUM_ONLY_AI_FEATURES: readonly AiFeatureId[] = [
  ...AI_FEATURES,
] as const;

export const AI_FEATURE_META: Record<
  AiFeatureId,
  { label: string; description: string }
> = {
  explain_problem: {
    label: "Explain Problem",
    description: "Clarify the problem statement and constraints without revealing a full solution",
  },
  give_hint: {
    label: "Give Hint",
    description: "One progressive nudge toward the approach",
  },
  explain_error: {
    label: "Explain Error",
    description: "Interpret compiler/runtime/judge errors in learning terms",
  },
  explain_test_case: {
    label: "Explain Test Case",
    description: "Walk through what a failing or sample test is checking",
  },
  find_bug: {
    label: "Find Bug",
    description: "Point to likely bug categories without rewriting a full solution",
  },
  explain_complexity: {
    label: "Explain Complexity",
    description: "Discuss time/space complexity tradeoffs of approaches",
  },
  optimize_approach: {
    label: "Optimize Approach",
    description: "Suggest optimization directions",
  },
  compare_approaches: {
    label: "Compare Approaches",
    description: "Compare two high-level strategies",
  },
  generate_similar_problem: {
    label: "Generate Similar Problem",
    description: "Describe a similar practice prompt",
  },
  interview_mode: {
    label: "Interview Mode",
    description: "Socratic interview-style coaching",
  },
};

export function isAiFeature(id: string): id is AiFeatureId {
  return (AI_FEATURES as readonly string[]).includes(id);
}

export function isPremiumOnlyAiFeature(id: AiFeatureId): boolean {
  return (PREMIUM_ONLY_AI_FEATURES as readonly string[]).includes(id);
}
