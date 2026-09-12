import axios from "axios";
import { AnalyticsRepository } from "../repositories/analytics.repository";
import { serverConfig } from "../config";

/** Prefer HTTP internal stats endpoints on sibling services (auth via forwarded JWT). */
async function fetchInternal(
  url: string,
  token?: string,
  timeoutMs = 8000
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
    const days =
      range === "7d" ? 7 : range === "90d" ? 90 : range === "today" ? 1 : 30;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : authHeader;

    const [users, problems, submissions] = await Promise.all([
      fetchInternal(
        `${serverConfig.AUTH_SERVICE_URL}/api/v1/auth/admin/internal/user-stats`,
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

    return {
      range,
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
      },
      kpis: {
        totalUsers: users?.totalUsers ?? 0,
        dau: users?.dau ?? 0,
        wau: users?.wau ?? 0,
        mau: users?.mau ?? 0,
        publishedProblems: problems?.published ?? 0,
        draftProblems: problems?.draft ?? 0,
        totalSubmissions: submissions?.total ?? 0,
        todaySubmissions: submissions?.today ?? 0,
        successRate: submissions?.successRate ?? 0,
      },
    };
  }

  async getChartSeries(range: string, authHeader?: string) {
    const overview = await this.getPlatformOverview(range, authHeader);
    return {
      userGrowth: overview.users.growth || [],
      submissionsByStatus: overview.submissions.byStatus || {},
      submissionSeries: overview.submissions.series || [],
      difficultyDistribution: overview.problems.byDifficulty || {},
      languageUsage: overview.submissions.byLanguage || {},
      topProblems: overview.submissions.topProblems || [],
      mostActiveUsers: overview.submissions.mostActiveUsers || [],
    };
  }
}
