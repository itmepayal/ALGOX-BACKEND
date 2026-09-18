/**
 * Study plan projection + progress helpers (server-authoritative).
 */
import {
  countPlanProblems,
  orderedProblemIds,
  planSections,
} from "../models/studyPlan.model";

export type ProgressStatus = "not_started" | "in_progress" | "completed";

export function toPublicPlan(
  plan: any,
  opts?: { locked?: boolean; includeProgress?: any }
) {
  const o =
    typeof plan?.toObject === "function" ? plan.toObject() : { ...plan };
  const id = String(o._id || o.id);
  const sections = planSections(o);
  const total = countPlanProblems(o);
  const isPremium = Boolean(o.isPremium || o.access === "PREMIUM");
  const locked = Boolean(opts?.locked);

  const base: Record<string, unknown> = {
    id,
    title: o.title,
    slug: o.slug,
    description: o.description || "",
    coverImage: o.coverImage,
    category: o.category,
    topics: Array.isArray(o.topics) ? o.topics : [],
    difficulty: o.difficulty || "beginner",
    estimatedMinutes: Number(o.estimatedMinutes) || 0,
    estimatedDays: o.estimatedDays,
    totalProblemsCount: total,
    access: isPremium ? "PREMIUM" : "FREE",
    isPremium,
    isPublished: Boolean(o.isPublished),
    prerequisiteSlugs: Array.isArray(o.prerequisiteSlugs)
      ? o.prerequisiteSlugs
      : [],
    sectionCount: sections.length,
    accessLocked: locked,
  };

  if (locked) {
    // Teaser only — do not leak problem IDs / section lesson lists
    base.sections = sections.map((s) => ({
      title: s.title,
      description: s.description,
      problemCount: (s.problemIds || []).length,
      estimatedMinutes: s.estimatedMinutes,
      locked: true,
    }));
    base.cards = base.sections;
    base.problemSlugs = [];
  } else {
    base.sections = sections.map((s, i) => ({
      order: i + 1,
      title: s.title,
      description: s.description,
      problemIds: s.problemIds || [],
      estimatedMinutes: s.estimatedMinutes,
    }));
    base.cards = base.sections;
    base.problemIds = orderedProblemIds(o);
    // Back-compat for older clients expecting problemSlugs
    base.problemSlugs = base.problemIds;
  }

  if (opts?.includeProgress) {
    base.progress = sanitizeProgress(opts.includeProgress);
  }

  return base;
}

export function sanitizeProgress(p: any) {
  if (!p) {
    return {
      status: "not_started" as ProgressStatus,
      completedProblemIds: [] as string[],
      solvedCount: 0,
      totalProblemsCount: 0,
      completionPercentage: 0,
      resumeProblemId: null as string | null,
      resumeSectionIndex: 0,
      enrolled: false,
    };
  }
  const o = typeof p.toObject === "function" ? p.toObject() : { ...p };
  return {
    status: (o.status || "not_started") as ProgressStatus,
    completedProblemIds: Array.isArray(o.completedProblemIds)
      ? o.completedProblemIds.map(String)
      : [],
    solvedCount: Number(o.solvedCount) || 0,
    totalProblemsCount: Number(o.totalProblemsCount) || 0,
    completionPercentage: Number(o.completionPercentage) || 0,
    resumeProblemId: o.resumeProblemId || null,
    resumeSectionIndex: Number(o.resumeSectionIndex) || 0,
    enrolledAt: o.enrolledAt,
    completedAt: o.completedAt || null,
    lastStudiedAt: o.lastStudiedAt,
    enrolled: true,
  };
}

export function computeResume(
  plan: any,
  completedIds: string[]
): { resumeProblemId: string | null; resumeSectionIndex: number } {
  const done = new Set(completedIds.map(String));
  const sections = planSections(plan);
  for (let si = 0; si < sections.length; si++) {
    for (const pid of sections[si].problemIds || []) {
      if (!done.has(String(pid))) {
        return { resumeProblemId: String(pid), resumeSectionIndex: si };
      }
    }
  }
  return { resumeProblemId: null, resumeSectionIndex: Math.max(0, sections.length - 1) };
}

export function recomputeProgressFields(plan: any, completedIds: string[]) {
  const total = countPlanProblems(plan) || orderedProblemIds(plan).length || 1;
  const unique = Array.from(new Set(completedIds.map(String)));
  const solvedCount = unique.length;
  const pct = Number(((solvedCount / total) * 100).toFixed(2));
  const resume = computeResume(plan, unique);
  let status: ProgressStatus = "not_started";
  if (solvedCount <= 0) status = "not_started";
  else if (solvedCount >= total) status = "completed";
  else status = "in_progress";
  return {
    completedProblemIds: unique,
    solvedCount,
    totalProblemsCount: total,
    completionPercentage: Math.min(100, pct),
    status,
    ...resume,
  };
}
