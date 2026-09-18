import axios from "axios";
import { AnalyticsRepository } from "../repositories/analytics.repository";
import { serverConfig } from "../config";
import {
  resolveEntitlements,
  hasFeature,
} from "../utils/entitlementClient";
import {
  buildConsistency,
  buildDifficultyDistribution,
  buildLearningVelocity,
  buildRecommendations,
  buildTopicMastery,
  buildWeakTopics,
} from "../utils/learningAnalytics";

function rangeToDays(range: string): number {
  switch (range) {
    case "today":
    case "yesterday":
      return 1;
    case "7d":
      return 7;
    case "90d":
      return 90;
    case "this_month": {
      const now = new Date();
      return Math.max(1, now.getUTCDate());
    }
    case "prev_month": {
      const now = new Date();
      const firstThis = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
      );
      const firstPrev = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
      );
      return Math.max(
        1,
        Math.round((firstThis.getTime() - firstPrev.getTime()) / 86400000)
      );
    }
    case "1y":
    case "365d":
    case "this_year":
      return 365;
    case "30d":
    default:
      return 30;
  }
}

function trendPct(current: number, previous: number): number | null {
  if (previous > 0) {
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }
  if (current > 0) return null;
  return null;
}

function rangeToFromTo(range: string): { from: string; to: string } {
  const days = rangeToDays(range);
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/**
 * Sibling-service KPI fan-in.
 * - Auth `/internal/user-stats` → INTERNAL_SERVICE_SECRET (S2S)
 * - Problem/Submission `/admin/internal-stats` still accept forwarded staff JWT
 * Never log the secret.
 */
async function fetchInternal(
  url: string,
  token?: string,
  timeoutMs = 4000
): Promise<any> {
  try {
    const secret = (serverConfig.INTERNAL_SERVICE_SECRET || "").trim();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (secret) headers["x-internal-secret"] = secret;

    const res = await axios.get(url, {
      timeout: timeoutMs,
      headers,
    });
    return res.data?.data ?? res.data;
  } catch (err: any) {
    console.warn(
      `[Analytics] failed to fetch ${url}:`,
      err?.response?.status || err?.message || err
    );
    return null;
  }
}

export class AnalyticsService {
  constructor(private analyticsRepository: AnalyticsRepository) {}

  async getUserAnalytics(userId: string) {
    const analytics = await this.analyticsRepository.getUserAnalytics(userId);
    if (!analytics) {
      return {
        userId,
        totalSubmissions: 0,
        acceptedSubmissions: 0,
        acceptanceRate: 0,
        currentStreak: 0,
        maxStreak: 0,
        submissionHeatmap: [],
        topicStrengths: [],
      };
    }
    return analytics;
  }

  async recordSubmissionEvent(eventPayload: {
    userId: string;
    status:
      | "ACCEPTED"
      | "WRONG_ANSWER"
      | "TIME_LIMIT_EXCEEDED"
      | "MEMORY_LIMIT_EXCEEDED"
      | "RUNTIME_ERROR";
    difficulty?: "easy" | "medium" | "hard";
    topics?: string[];
  }) {
    return await this.analyticsRepository.recordSubmissionEvent(eventPayload);
  }

  /**
   * Platform overview KPIs.
   * Entry RBAC: Analytics `/admin/overview` (JWT + analytics:view).
   * Downstream Auth user-stats: S2S secret; Problem/Submission: forwarded JWT for now.
   */
  async getPlatformOverview(range: string, authHeader?: string) {
    const days = rangeToDays(range);
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    const [users, problems, submissions] = await Promise.all([
      fetchInternal(
        `${serverConfig.AUTH_SERVICE_URL}/api/v1/auth/admin/internal/user-stats?days=${days}`,
        token
      ),
      fetchInternal(
        `${serverConfig.PROBLEM_SERVICE_URL}/api/v1/problems/admin/internal-stats`,
        token
      ),
      fetchInternal(
        `${serverConfig.SUBMISSION_SERVICE_URL}/api/v1/submissions/admin/internal-stats?days=${days}`,
        token
      ),
    ]);

    const sources = {
      users: Boolean(users),
      problems: Boolean(problems),
      submissions: Boolean(submissions),
    };

    return {
      range,
      sources,
      degraded: !sources.users || !sources.problems || !sources.submissions,
      users: users || {
        totalUsers: 0,
        activeUsers: 0,
        todayUsers: 0,
        dau: 0,
        wau: 0,
        mau: 0,
        growth: [],
      },
      problems: problems || {
        total: 0,
        draft: 0,
        published: 0,
        archived: 0,
        today: 0,
        byDifficulty: { easy: 0, medium: 0, hard: 0 },
        byTopic: {},
      },
      submissions: submissions || {
        total: 0,
        today: 0,
        accepted: 0,
        successRate: 0,
        byStatus: {},
        byLanguage: {},
        series: [],
        topProblems: [],
        mostActiveUsers: [],
        avgExecutionTime: null,
        avgMemory: null,
        solvedProblems: 0,
      },
      kpis: {
        totalUsers: users?.totalUsers ?? 0,
        dau: users?.dau ?? 0,
        wau: users?.wau ?? 0,
        mau: users?.mau ?? 0,
        activeUsers: users?.activeUsers ?? users?.dau ?? 0,
        newUsersInRange: users?.newUsersInRange ?? null,
        newUsersPrevRange: users?.newUsersPrevRange ?? null,
        totalProblems: problems?.total ?? 0,
        publishedProblems: problems?.published ?? 0,
        draftProblems: problems?.draft ?? 0,
        totalSubmissions: submissions?.total ?? 0,
        todaySubmissions: submissions?.today ?? 0,
        rangeSubmissions: submissions?.rangeTotal ?? null,
        rangeAccepted: submissions?.rangeAccepted ?? null,
        rangeSuccessRate: submissions?.rangeSuccessRate ?? null,
        successRate: submissions?.successRate ?? 0,
        solvedProblems: submissions?.solvedProblems ?? 0,
        acceptedSubmissions: submissions?.accepted ?? 0,
        newUsersTrendPct: users?.newUsersTrendPct ?? null,
        submissionsTrendPct:
          submissions?.rangeSubmissionsTrendPct ??
          trendPct(
            Number(submissions?.rangeTotal || 0),
            Number(submissions?.prevRangeTotal || 0)
          ),
        acceptedTrendPct:
          submissions?.rangeAcceptedTrendPct ??
          trendPct(
            Number(submissions?.rangeAccepted || 0),
            Number(submissions?.prevRangeAccepted || 0)
          ),
        acceptanceTrendPct: submissions?.rangeSuccessRateTrendPct ?? null,
      },
      compare: {
        enabled: true,
        periodLabel: `previous ${days}d`,
        newUsers: {
          current: users?.newUsersInRange ?? null,
          previous: users?.newUsersPrevRange ?? null,
          trendPct: users?.newUsersTrendPct ?? null,
        },
        submissions: {
          current: submissions?.rangeTotal ?? null,
          previous: submissions?.prevRangeTotal ?? null,
          trendPct: submissions?.rangeSubmissionsTrendPct ?? null,
        },
        accepted: {
          current: submissions?.rangeAccepted ?? null,
          previous: submissions?.prevRangeAccepted ?? null,
          trendPct: submissions?.rangeAcceptedTrendPct ?? null,
        },
        acceptanceRate: {
          current: submissions?.rangeSuccessRate ?? null,
          previous: submissions?.prevRangeSuccessRate ?? null,
          trendPct: submissions?.rangeSuccessRateTrendPct ?? null,
        },
      },
    };
  }

  async getChartSeries(range: string, authHeader?: string) {
    // Reuse overview so we do not double fan-in (was causing 8s+8s timeouts).
    const overview = await this.getPlatformOverview(range, authHeader);
    return {
      userGrowth: overview.users.growth || [],
      submissionsByStatus: overview.submissions.byStatus || {},
      submissionSeries: overview.submissions.series || [],
      difficultyDistribution: overview.problems.byDifficulty || {},
      topicDistribution: (overview.problems as any).byTopic || {},
      languageUsage: overview.submissions.byLanguage || {},
      topProblems: overview.submissions.topProblems || [],
      mostActiveUsers: overview.submissions.mostActiveUsers || [],
      avgExecutionTime: (overview.submissions as any).avgExecutionTime ?? null,
      avgMemory: (overview.submissions as any).avgMemory ?? null,
      sources: overview.sources,
      degraded: overview.degraded,
      compare: overview.compare,
      kpis: overview.kpis,
    };
  }

  /**
   * Single fan-in for admin analytics command center (overview + charts).
   */
  async getAdminDashboard(range: string, authHeader?: string) {
    const overview = await this.getPlatformOverview(range, authHeader);
    return {
      overview,
      charts: {
        userGrowth: overview.users.growth || [],
        submissionsByStatus: overview.submissions.byStatus || {},
        submissionSeries: overview.submissions.series || [],
        difficultyDistribution: overview.problems.byDifficulty || {},
        topicDistribution: (overview.problems as any).byTopic || {},
        languageUsage: overview.submissions.byLanguage || {},
        topProblems: overview.submissions.topProblems || [],
        mostActiveUsers: overview.submissions.mostActiveUsers || [],
        avgExecutionTime: (overview.submissions as any).avgExecutionTime ?? null,
        avgMemory: (overview.submissions as any).avgMemory ?? null,
        sources: overview.sources,
        degraded: overview.degraded,
      },
    };
  }

  async exportAdminDashboard(
    range: string,
    authHeader?: string,
    format: "json" | "csv" = "json"
  ) {
    const bundle = await this.getAdminDashboard(range, authHeader);
    if (format === "json") {
      return { contentType: "application/json", body: bundle };
    }

    const rows: string[] = ["section,metric,value"];
    const k = bundle.overview.kpis || {};
    for (const [key, value] of Object.entries(k)) {
      if (value === null || value === undefined) continue;
      rows.push(`kpis,${key},${JSON.stringify(value)}`);
    }
    const compare = bundle.overview.compare || {};
    for (const [section, payload] of Object.entries(compare)) {
      if (!payload || typeof payload !== "object") continue;
      for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
        if (value === null || value === undefined) continue;
        rows.push(`compare.${section},${key},${JSON.stringify(value)}`);
      }
    }
    const byStatus = bundle.charts.submissionsByStatus || {};
    for (const [key, value] of Object.entries(byStatus)) {
      rows.push(`verdicts,${key},${value}`);
    }
    const byLang = bundle.charts.languageUsage || {};
    for (const [key, value] of Object.entries(byLang)) {
      rows.push(`languages,${key},${value}`);
    }
    return {
      contentType: "text/csv; charset=utf-8",
      body: rows.join("\n"),
      filename: `algopath-analytics-${range}.csv`,
    };
  }

  /**
   * Free + authenticated: rollup snapshot (UserAnalytics) — no fabricated runtime.
   */
  async getMyOverview(userId: string) {
    const snap = await this.getUserAnalytics(userId);
    return {
      tier: "basic" as const,
      userId,
      totalSubmissions: snap.totalSubmissions ?? 0,
      acceptedSubmissions: snap.acceptedSubmissions ?? 0,
      acceptanceRate: snap.acceptanceRate ?? 0,
      solvedEasy: snap.solvedEasy ?? 0,
      solvedMedium: snap.solvedMedium ?? 0,
      solvedHard: snap.solvedHard ?? 0,
      currentStreak: snap.currentStreak ?? 0,
      maxStreak: snap.maxStreak ?? 0,
      submissionHeatmap: snap.submissionHeatmap ?? [],
      topicStrengths: snap.topicStrengths ?? [],
      note: "Counters from recorded submission events; runtime/memory come from Submission docs via /me/history",
    };
  }

  /**
   * Paginated real submissions + aggregates from SubmissionService.
   */
  async getMyHistory(
    userId: string,
    authorization: string | undefined,
    query: Record<string, string | undefined>
  ) {
    const base = String(serverConfig.SUBMISSION_SERVICE_URL || "").replace(
      /\/$/,
      ""
    );
    const params = new URLSearchParams();
    for (const key of [
      "from",
      "to",
      "status",
      "language",
      "source",
      "page",
      "limit",
      "range",
    ]) {
      if (query[key]) params.set(key, String(query[key]));
    }
    // Map range shorthand to from/to when from missing
    if (query.range && !query.from) {
      const { from, to } = rangeToFromTo(query.range);
      params.set("from", from);
      params.set("to", to);
    }

    const url = `${base}/api/v1/submissions/me/analytics?${params.toString()}`;
    try {
      const res = await axios.get(url, {
        headers: authorization ? { Authorization: authorization } : {},
        timeout: 12000,
        validateStatus: () => true,
      });
      if (res.status !== 200) {
        return {
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 1,
          items: [],
          aggregates: emptyAggregates(),
          error: res.data?.message || `SubmissionService ${res.status}`,
        };
      }
      return res.data?.data ?? res.data;
    } catch (err: any) {
      return {
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
        items: [],
        aggregates: emptyAggregates(),
        error: err?.message || "SubmissionService unreachable",
      };
    }
  }

  /**
   * Premium analytics: trends + language comparison + attempt analysis.
   * Requires premium.analytics. Uses real submission aggregates only.
   */
  async getMyPremium(
    userId: string,
    authorization: string | undefined,
    query: Record<string, string | undefined>
  ) {
    const snap = await resolveEntitlements(authorization);
    if (!hasFeature(snap, "premium.analytics")) {
      const err: any = new Error(
        "Premium analytics requires premium.analytics entitlement"
      );
      err.statusCode = 403;
      err.code = "PREMIUM_REQUIRED";
      throw err;
    }

    const range = query.range || "30d";
    const history = await this.getMyHistory(userId, authorization, {
      ...query,
      range,
      limit: query.limit || "20",
    });
    const overview = await this.getMyOverview(userId);
    const agg = history.aggregates || emptyAggregates();

    return {
      tier: "premium" as const,
      range,
      overview,
      history: {
        total: history.total ?? 0,
        page: history.page ?? 1,
        limit: history.limit ?? 20,
        totalPages: history.totalPages ?? 1,
        items: history.items ?? [],
      },
      // Premium slices — all derived from real fields / null when no samples
      runtimeTrend: (agg.daily || []).map((d: any) => ({
        date: d.date,
        avgExecutionTimeMs: d.avgExecutionTimeMs,
        count: d.count,
      })),
      memoryTrend: (agg.daily || []).map((d: any) => ({
        date: d.date,
        avgMemoryMb: d.avgMemoryMb,
        count: d.count,
      })),
      acceptanceTrend: agg.acceptanceDaily || [],
      difficultyPerformance: {
        easy: overview.solvedEasy,
        medium: overview.solvedMedium,
        hard: overview.solvedHard,
        signal: "solved counts from Analytics record-submission events",
      },
      languageComparison: Object.entries(agg.byLanguage || {}).map(
        ([language, count]) => ({ language, count })
      ),
      attemptAnalysis: agg.attempts || null,
      performanceComparison: {
        avgExecutionTimeMs: agg.avgExecutionTimeMs,
        avgMemoryMb: agg.avgMemoryMb,
        runtimeSampleCount: agg.runtimeSampleCount || 0,
        acceptanceRate: agg.acceptanceRate,
        note:
          "Averages only over submissions with measured executionTime/memory; null means no samples",
      },
      byStatus: agg.byStatus || {},
    };
  }

  /**
   * Phase 16 — Premium personalized learning analytics.
   * Aggregates real UserAnalytics + Submission aggregates + study-plan progress +
   * challenge streak + contest participation. Recommendations cite evidence only.
   */
  async getMyLearning(
    userId: string,
    authorization: string | undefined,
    query: Record<string, string | undefined>
  ) {
    const snap = await resolveEntitlements(authorization);
    if (!hasFeature(snap, "premium.analytics")) {
      const err: any = new Error(
        "Advanced learning analytics requires premium.analytics entitlement"
      );
      err.statusCode = 403;
      err.code = "PREMIUM_REQUIRED";
      throw err;
    }

    const range = query.range || "30d";
    const { from, to } = rangeToFromTo(range);
    const rangeDays = rangeToDays(range);

    const [overview, history, studyPlans, challengeStreak, contests] =
      await Promise.all([
        this.getMyOverview(userId),
        this.getMyHistory(userId, authorization, {
          ...query,
          range,
          from: query.from || from,
          to: query.to || to,
          limit: "1",
          page: "1",
        }),
        this.fetchWithAuth(
          `${strip(serverConfig.CONTENT_SERVICE_URL)}/api/v1/content/study-plans/progress/me`,
          authorization
        ),
        this.fetchWithAuth(
          `${strip(serverConfig.PROBLEM_SERVICE_URL)}/api/v1/challenges/streak`,
          authorization
        ),
        this.fetchWithAuth(
          `${strip(serverConfig.PROBLEM_SERVICE_URL)}/api/v1/contests/me/summary`,
          authorization
        ),
      ]);

    const plansWithTopics = await this.enrichStudyPlansWithTopics(
      authorization,
      Array.isArray(studyPlans) ? studyPlans : studyPlans?.data || []
    );

    const topicMastery = buildTopicMastery(overview.topicStrengths || []);
    const weakTopics = buildWeakTopics(topicMastery);
    const difficultyDistribution = buildDifficultyDistribution(overview);
    const agg = history.aggregates || emptyAggregates();
    const learningVelocity = buildLearningVelocity(agg.daily || [], rangeDays);
    const consistency = buildConsistency(
      overview.submissionHeatmap || [],
      rangeDays,
      query.from || from,
      query.to || to
    );

    const hasAny =
      (overview.totalSubmissions || 0) > 0 ||
      (history.total || 0) > 0 ||
      topicMastery.some((t) => t.totalSubmissions > 0);

    const recommendations = buildRecommendations({
      weakTopics,
      studyPlans: plansWithTopics,
      consistencyRate: consistency.consistencyRate,
      difficulty: difficultyDistribution,
      hasAnySubmissions: hasAny,
    });

    return {
      tier: "premium" as const,
      range,
      from: query.from || from,
      to: query.to || to,
      performanceOverview: {
        totalSubmissions: overview.totalSubmissions ?? 0,
        acceptedSubmissions: overview.acceptedSubmissions ?? 0,
        acceptanceRate: overview.acceptanceRate ?? 0,
        avgExecutionTimeMs: agg.avgExecutionTimeMs,
        avgMemoryMb: agg.avgMemoryMb,
        runtimeSampleCount: agg.runtimeSampleCount || 0,
        attempts: agg.attempts,
        byLanguage: agg.byLanguage || {},
        byStatus: agg.byStatus || {},
        note: "Runtime/memory null when no measured samples — never invented",
      },
      topicMastery,
      topicWeakness: weakTopics,
      difficultyDistribution,
      learningVelocity,
      consistency,
      submissionTrends: {
        daily: agg.daily || [],
        acceptanceDaily: agg.acceptanceDaily || [],
      },
      streaks: {
        submission: {
          current: overview.currentStreak ?? 0,
          max: overview.maxStreak ?? 0,
          source: "UserAnalytics.record-submission",
        },
        challenge: challengeStreak
          ? {
              current: challengeStreak.currentStreak ?? challengeStreak.current ?? 0,
              longest:
                challengeStreak.longestStreak ??
                challengeStreak.longest ??
                0,
              source: "ProblemService.challenges/streak",
            }
          : {
              current: 0,
              longest: 0,
              source: "ProblemService.challenges/streak",
              unavailable: true,
            },
      },
      studyPlanProgress: plansWithTopics.map((p) => ({
        studyPlanSlug: p.studyPlanSlug,
        title: p.title || null,
        topics: p.topics || [],
        status: p.status,
        solvedCount: p.solvedCount ?? 0,
        totalProblemsCount: p.totalProblemsCount ?? 0,
        completionPercentage: p.completionPercentage ?? 0,
        enrolled: p.enrolled !== false,
      })),
      contestPerformance: contests
        ? {
            contestsEntered: contests.contestsEntered ?? 0,
            totalScore: contests.totalScore ?? 0,
            totalSolved: contests.totalSolved ?? 0,
            items: contests.items || [],
          }
        : {
            contestsEntered: 0,
            totalScore: 0,
            totalSolved: 0,
            items: [],
            unavailable: true,
          },
      recommendations,
    };
  }

  private async fetchWithAuth(
    url: string,
    authorization: string | undefined,
    timeoutMs = 8000
  ): Promise<any> {
    try {
      const res = await axios.get(url, {
        headers: authorization ? { Authorization: authorization } : {},
        timeout: timeoutMs,
        validateStatus: () => true,
      });
      if (res.status !== 200) return null;
      return res.data?.data ?? res.data;
    } catch {
      return null;
    }
  }

  /** Join enrolled progress with published plan topics (for explainable recs). */
  private async enrichStudyPlansWithTopics(
    authorization: string | undefined,
    progressRows: any[]
  ): Promise<
    Array<{
      studyPlanSlug?: string;
      title?: string;
      topics?: string[];
      status?: string;
      solvedCount?: number;
      totalProblemsCount?: number;
      completionPercentage?: number;
      enrolled?: boolean;
    }>
  > {
    const rows = Array.isArray(progressRows) ? progressRows : [];
    if (!rows.length) return [];

    const catalog = await this.fetchWithAuth(
      `${strip(serverConfig.CONTENT_SERVICE_URL)}/api/v1/content/study-plans?limit=100`,
      authorization
    );
    const list = Array.isArray(catalog)
      ? catalog
      : catalog?.items || catalog?.studyPlans || catalog?.data || [];
    const bySlug = new Map<string, any>();
    for (const plan of list) {
      if (plan?.slug) bySlug.set(String(plan.slug), plan);
    }

    return rows.map((p) => {
      const slug = String(p.studyPlanSlug || p.slug || "");
      const plan = bySlug.get(slug);
      return {
        studyPlanSlug: slug,
        title: plan?.title || p.title,
        topics: Array.isArray(plan?.topics)
          ? plan.topics.map(String)
          : Array.isArray(p.topics)
            ? p.topics.map(String)
            : [],
        status: p.status,
        solvedCount: p.solvedCount,
        totalProblemsCount: p.totalProblemsCount,
        completionPercentage: p.completionPercentage,
        enrolled: p.enrolled !== false,
      };
    });
  }
}

function strip(url: string) {
  return String(url || "").replace(/\/$/, "");
}

function emptyAggregates() {
  return {
    byStatus: {},
    byLanguage: {},
    acceptanceRate: 0,
    acceptedCount: 0,
    avgExecutionTimeMs: null,
    avgMemoryMb: null,
    runtimeSampleCount: 0,
    daily: [],
    acceptanceDaily: [],
    attempts: {
      problemsAttempted: 0,
      problemsSolved: 0,
      totalAttempts: 0,
      avgAttemptsPerProblem: null,
    },
  };
}
