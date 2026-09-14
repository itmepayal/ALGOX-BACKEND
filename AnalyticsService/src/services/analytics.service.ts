import axios from "axios";
import { AnalyticsRepository } from "../repositories/analytics.repository";
import { serverConfig } from "../config";

function rangeToDays(range: string): number {
  switch (range) {
    case "today":
      return 1;
    case "7d":
      return 7;
    case "90d":
      return 90;
    case "1y":
    case "365d":
      return 365;
    case "30d":
    default:
      return 30;
  }
}

/** Prefer HTTP internal stats endpoints on sibling services (auth via forwarded JWT). */
async function fetchInternal(
  url: string,
  token?: string,
  timeoutMs = 4000
): Promise<any> {
  try {
    const res = await axios.get(url, {
      timeout: timeoutMs,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.data?.data ?? res.data;
  } catch (err: any) {
    console.warn(`[Analytics] failed to fetch ${url}:`, err?.message || err);
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
   * Fan-in via Auth/Problem/Submission thin `/internal-*` HTTP endpoints.
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
        totalProblems: problems?.total ?? 0,
        publishedProblems: problems?.published ?? 0,
        draftProblems: problems?.draft ?? 0,
        totalSubmissions: submissions?.total ?? 0,
        todaySubmissions: submissions?.today ?? 0,
        successRate: submissions?.successRate ?? 0,
        solvedProblems: submissions?.solvedProblems ?? 0,
        acceptedSubmissions: submissions?.accepted ?? 0,
        newUsersTrendPct: users?.newUsersTrendPct ?? null,
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
    };
  }
}
