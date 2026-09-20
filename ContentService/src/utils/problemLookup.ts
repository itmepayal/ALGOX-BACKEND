/**
 * Resolve a problem from ProblemService for company-question attach validation.
 * Forwards the admin JWT — does not invent problem metadata.
 */
import { serverConfig } from "../config";

export type ResolvedProblem = {
  id: string;
  title: string;
  slug?: string;
  difficulty: "easy" | "medium" | "hard";
  topics: string[];
  isPremium: boolean;
  status?: string;
};

function normalizeDifficulty(d: unknown): "easy" | "medium" | "hard" {
  const s = String(d || "").toLowerCase();
  if (s === "easy" || s === "medium" || s === "hard") return s;
  return "medium";
}

export async function resolveProblemById(
  problemId: string,
  authorization?: string | null
): Promise<ResolvedProblem | null> {
  const base = String(serverConfig.PROBLEM_SERVICE_URL || "http://localhost:3003").replace(
    /\/$/,
    ""
  );

  try {
    const res = await fetch(
      `${base}/api/v1/problems/admin/${encodeURIComponent(problemId)}`,
      {
        method: "GET",
        headers: authorization ? { Authorization: authorization } : {},
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Record<string, unknown> };
    const p = json?.data || null;
    if (!p || typeof p !== "object") return null;
    const id = String(p.id || p._id || problemId);
    const tags = Array.isArray(p.tags)
      ? p.tags.map((t: unknown) => String(t))
      : [];
    const category = p.category ? String(p.category) : "";
    const topics = tags.length ? tags : category ? [category] : [];
    return {
      id,
      title: String(p.title || "").trim() || id,
      slug: p.slug ? String(p.slug) : undefined,
      difficulty: normalizeDifficulty(p.difficulty),
      topics,
      isPremium: Boolean(p.isPremium),
      status: p.status ? String(p.status) : undefined,
    };
  } catch {
    return null;
  }
}
