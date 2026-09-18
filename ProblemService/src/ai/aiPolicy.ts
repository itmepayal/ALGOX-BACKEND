/**
 * Learning-first AI policy: coach, don't vend full solutions.
 */
import type { AiFeatureId } from "./aiFeatures";

export const LEARNING_SYSTEM_PROMPT = `You are AlgoPath AI, a coding interview LEARNING assistant.

Rules (mandatory):
1. Help the learner understand and progress. Do NOT dump a complete, copy-paste ready solution unless the feature is explicitly "interview_mode" coaching that still withholds full code.
2. Prefer Socratic hints, concepts, complexity tradeoffs, and debugging strategies.
3. Never invent problem constraints that are not in the provided statement.
4. If the user asks for "the full solution" / "give me the code", refuse the full dump and offer a hint ladder instead.
5. Keep answers concise and structured for learning.
6. Do not claim to have run their code unless judge signals are provided.
7. Never request or echo API keys or secrets.`;

const SOLUTION_DUMP_RE =
  /\b(give me (the )?(full )?solution|write (the )?complete code|paste (the )?answer|solution code only|just (give|write) (me )?code)\b/i;

export function looksLikeSolutionDumpRequest(text: string): boolean {
  return SOLUTION_DUMP_RE.test(text || "");
}

export function featureInstruction(feature: AiFeatureId): string {
  switch (feature) {
    case "explain_problem":
      return "Explain the problem statement, inputs/outputs, and constraints in plain language. Do not provide a full coded solution.";
    case "give_hint":
      return "Give ONE progressive hint (not the full algorithm). Ask what they have tried. Do not output complete code.";
    case "explain_error":
      return "Explain the error message and likely causes. Suggest debugging steps. Do not rewrite a full solution.";
    case "explain_test_case":
      return "Explain what the test case is checking and how to reason about it. Do not provide a full solution.";
    case "find_bug":
      return "Identify likely bug categories / suspicious patterns. Point to lines conceptually. Do not replace their code with a full correct solution.";
    case "explain_complexity":
      return "Discuss time and space complexity of plausible approaches. No full code dumps.";
    case "optimize_approach":
      return "Suggest optimization directions and tradeoffs. Prefer guidance over finished code.";
    case "compare_approaches":
      return "Compare two high-level approaches (pros/cons, complexity). Avoid full implementations.";
    case "generate_similar_problem":
      return "Describe a similar practice problem (statement + constraints sketch). Do not solve the original.";
    case "interview_mode":
      return "Act as a mock interviewer: ask clarifying questions, give small hints only when stuck, evaluate reasoning. Never paste a full final solution.";
    default:
      return "Coach the learner without dumping a full solution.";
  }
}

/**
 * Learning-policy refusal when the user asks for a full solution dump.
 * Not a fake LLM reply — explicit coach refusal (works without a provider key).
 */
export function refusalAssistResponse(args: {
  feature: AiFeatureId;
  problemTitle?: string;
}): { reply: string; learningMode: true } {
  const title = args.problemTitle || "this problem";
  return {
    learningMode: true,
    reply: [
      `I won't paste a full solution for ${title} — that short-circuits learning.`,
      `Try this instead:`,
      `1. Restate the goal in one sentence.`,
      `2. Identify brute force, then the bottleneck.`,
      `3. Ask for a single hint with feature "give_hint" when stuck.`,
    ].join("\n"),
  };
}

/** @deprecated Use refusalAssistResponse — stubs must not impersonate the LLM. */
export function stubAssistResponse(args: {
  feature: AiFeatureId;
  problemTitle?: string;
  refusedDump?: boolean;
}): { reply: string; learningMode: true } {
  if (args.refusedDump) {
    return refusalAssistResponse(args);
  }
  // Intentionally minimal — callers must not use this as a fake AI answer.
  throw new Error(
    "stubAssistResponse is disabled; configure GEMINI_API_KEY (or OPENAI_API_KEY) for real AI replies"
  );
}
