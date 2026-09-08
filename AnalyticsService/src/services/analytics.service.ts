import { AnalyticsRepository } from "../repositories/analytics.repository";

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
    status: "ACCEPTED" | "WRONG_ANSWER" | "TIME_LIMIT_EXCEEDED" | "MEMORY_LIMIT_EXCEEDED" | "RUNTIME_ERROR";
    difficulty?: "easy" | "medium" | "hard";
    topics?: string[];
  }) {
    return await this.analyticsRepository.recordSubmissionEvent(eventPayload);
  }
}
