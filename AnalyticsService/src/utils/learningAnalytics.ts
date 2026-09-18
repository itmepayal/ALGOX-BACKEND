/**
 * Phase 16 — derive learning analytics slices from real recorded signals only.
 * Never invent composite scores; acceptance rates are count ratios or null.
 */

export type TopicMasteryRow = {
  topic: string;
  solvedCount: number;
  totalSubmissions: number;
  /** null when no submissions for the topic */
  acceptanceRate: number | null;
};

export type Recommendation = {
  type: "weak_topic" | "study_plan" | "consistency" | "difficulty";
  title: string;
  evidence: string;
  action: string;
  topic?: string;
  studyPlanSlug?: string;
  suggestedProblemCount?: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function buildTopicMastery(
  topicStrengths: Array<{
    topic?: string;
    solvedCount?: number;
    totalSubmissions?: number;
  }>
): TopicMasteryRow[] {
  return (topicStrengths || [])
    .map((t) => {
      const total = Number(t.totalSubmissions) || 0;
      const solved = Number(t.solvedCount) || 0;
      return {
        topic: String(t.topic || "unknown"),
        solvedCount: solved,
        totalSubmissions: total,
        acceptanceRate:
          total > 0 ? round2((solved / total) * 100) : null,
      };
    })
    .sort((a, b) => {
      // Weakest first among topics with enough attempts; then by volume
      const arA = a.acceptanceRate ?? 100;
      const arB = b.acceptanceRate ?? 100;
      if (a.totalSubmissions >= 2 && b.totalSubmissions >= 2) {
        if (arA !== arB) return arA - arB;
      }
      return b.totalSubmissions - a.totalSubmissions;
    });
}

export function buildWeakTopics(
  mastery: TopicMasteryRow[],
  minAttempts = 2,
  maxRate = 50
): TopicMasteryRow[] {
  return mastery.filter(
    (t) =>
      t.totalSubmissions >= minAttempts &&
      t.acceptanceRate != null &&
      t.acceptanceRate < maxRate
  );
}

export function buildDifficultyDistribution(overview: {
  solvedEasy?: number;
  solvedMedium?: number;
  solvedHard?: number;
}) {
  const easy = Number(overview.solvedEasy) || 0;
  const medium = Number(overview.solvedMedium) || 0;
  const hard = Number(overview.solvedHard) || 0;
  const total = easy + medium + hard;
  return {
    easy,
    medium,
    hard,
    total,
    easyPct: total > 0 ? round2((easy / total) * 100) : null,
    mediumPct: total > 0 ? round2((medium / total) * 100) : null,
    hardPct: total > 0 ? round2((hard / total) * 100) : null,
    signal: "counts from ACCEPTED record-submission events only",
  };
}

/**
 * Learning velocity from daily submission aggregates in the selected range.
 * acceptedPerActiveDay / submissionsPerDay — null when no activity.
 */
export function buildLearningVelocity(
  daily: Array<{ date?: string; count?: number; accepted?: number }>,
  rangeDays: number
) {
  const days = Math.max(1, rangeDays);
  let submissions = 0;
  let accepted = 0;
  let activeDays = 0;
  for (const d of daily || []) {
    const c = Number(d.count) || 0;
    const a = Number(d.accepted) || 0;
    if (c > 0) activeDays += 1;
    submissions += c;
    accepted += a;
  }
  return {
    rangeDays: days,
    activeDays,
    submissions,
    accepted,
    submissionsPerDay: submissions > 0 ? round2(submissions / days) : null,
    acceptedPerDay: accepted > 0 ? round2(accepted / days) : null,
    acceptedPerActiveDay:
      activeDays > 0 ? round2(accepted / activeDays) : null,
    signal: "derived from SubmissionService daily aggregates in range",
  };
}

/**
 * Consistency from UserAnalytics heatmap (all-time recorded days) clipped to range when possible.
 */
export function buildConsistency(
  heatmap: Array<{ date?: string; count?: number }>,
  rangeDays: number,
  fromIso?: string,
  toIso?: string
) {
  const days = Math.max(1, rangeDays);
  const from = fromIso ? new Date(fromIso).getTime() : Date.now() - days * 86400000;
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  let activeDays = 0;
  let totalCount = 0;
  for (const h of heatmap || []) {
    if (!h.date) continue;
    const t = new Date(h.date + "T12:00:00.000Z").getTime();
    if (Number.isNaN(t) || t < from || t > to) continue;
    const c = Number(h.count) || 0;
    if (c > 0) {
      activeDays += 1;
      totalCount += c;
    }
  }
  return {
    rangeDays: days,
    activeDays,
    submissionsInRange: totalCount,
    consistencyRate:
      days > 0 ? round2((activeDays / days) * 100) : null,
    signal: "active days from UserAnalytics.submissionHeatmap in range",
  };
}

export function buildRecommendations(input: {
  weakTopics: TopicMasteryRow[];
  studyPlans: Array<{
    studyPlanSlug?: string;
    title?: string;
    topics?: string[];
    status?: string;
    solvedCount?: number;
    totalProblemsCount?: number;
    completionPercentage?: number;
    enrolled?: boolean;
  }>;
  consistencyRate: number | null;
  difficulty: ReturnType<typeof buildDifficultyDistribution>;
  hasAnySubmissions: boolean;
}): Recommendation[] {
  const out: Recommendation[] = [];

  if (!input.hasAnySubmissions) {
    out.push({
      type: "consistency",
      title: "Start recording judged submissions",
      evidence: "No submission events in analytics yet",
      action: "Solve and submit a problem to unlock topic and velocity insights",
    });
    return out;
  }

  for (const weak of input.weakTopics.slice(0, 3)) {
    const topicLower = weak.topic.toLowerCase();
    const matchingPlan = (input.studyPlans || []).find((p) => {
      if (!p.enrolled && p.status === "not_started") return false;
      const topics = (p.topics || []).map((t) => String(t).toLowerCase());
      return (
        topics.some(
          (t) => t === topicLower || t.includes(topicLower) || topicLower.includes(t)
        ) ||
        String(p.studyPlanSlug || "")
          .toLowerCase()
          .includes(topicLower.replace(/\s+/g, "-"))
      );
    });

    const remaining = matchingPlan
      ? Math.max(
          0,
          (Number(matchingPlan.totalProblemsCount) || 0) -
            (Number(matchingPlan.solvedCount) || 0)
        )
      : 0;
    const suggested = matchingPlan
      ? Math.min(5, remaining || 5)
      : 5;

    out.push({
      type: matchingPlan ? "study_plan" : "weak_topic",
      title: `Weak topic: ${weak.topic}`,
      evidence: `${weak.solvedCount}/${weak.totalSubmissions} accepted (${weak.acceptanceRate}% acceptance across recorded topic submissions)`,
      action: matchingPlan
        ? `Practice ${suggested} remaining problem(s) from enrolled plan "${matchingPlan.studyPlanSlug}"`
        : `Practice ${suggested} problems tagged "${weak.topic}" (enroll a matching study plan for structured picks)`,
      topic: weak.topic,
      studyPlanSlug: matchingPlan?.studyPlanSlug,
      suggestedProblemCount: suggested,
    });
  }

  if (
    input.consistencyRate != null &&
    input.consistencyRate < 30 &&
    input.hasAnySubmissions
  ) {
    out.push({
      type: "consistency",
      title: "Improve practice consistency",
      evidence: `Active on ${input.consistencyRate}% of days in the selected range (heatmap)`,
      action: "Aim for at least one judged submit on more calendar days this week",
    });
  }

  const d = input.difficulty;
  if (d.total >= 5 && d.hard === 0 && (d.easyPct ?? 0) >= 70) {
    out.push({
      type: "difficulty",
      title: "Progress difficulty ladder",
      evidence: `Solved mix E/M/H = ${d.easy}/${d.medium}/${d.hard} (easy ${d.easyPct}%)`,
      action: "Attempt medium problems next — hard count is still zero from ACCEPTED events",
    });
  }

  return out;
}
