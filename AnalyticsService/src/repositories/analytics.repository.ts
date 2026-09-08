import { UserAnalytics, IUserAnalytics } from "../models/userAnalytics.model";
import redis from "../config/redis.config";

export class AnalyticsRepository {
  async getUserAnalytics(userId: string): Promise<any> {
    const cacheKey = `analytics:user:${userId}`;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return typeof cached === "string" ? JSON.parse(cached) : cached;
      }
    } catch {
    }

    const analytics = await UserAnalytics.findOne({ userId });
    if (analytics) {
      try {
        await redis.set(cacheKey, JSON.stringify(analytics.toObject()), { ex: 300 });
      } catch {
      }
      return analytics.toObject();
    }

    return null;
  }

  async recordSubmissionEvent(eventPayload: {
    userId: string;
    status: "ACCEPTED" | "WRONG_ANSWER" | "TIME_LIMIT_EXCEEDED" | "MEMORY_LIMIT_EXCEEDED" | "RUNTIME_ERROR";
    difficulty?: "easy" | "medium" | "hard";
    topics?: string[];
  }): Promise<IUserAnalytics> {
    const { userId, status, difficulty, topics = [] } = eventPayload;
    const todayStr = new Date().toISOString().split("T")[0];

    let analytics = await UserAnalytics.findOne({ userId });

    if (!analytics) {
      analytics = new UserAnalytics({
        userId,
        totalSubmissions: 0,
        acceptedSubmissions: 0,
        solvedEasy: 0,
        solvedMedium: 0,
        solvedHard: 0,
        wrongAnswers: 0,
        timeLimitExceeded: 0,
        memoryLimitExceeded: 0,
        runtimeError: 0,
        acceptanceRate: 0,
        currentStreak: 0,
        maxStreak: 0,
        submissionHeatmap: [],
        topicStrengths: [],
      });
    }

    // 1. Update status & difficulty counters
    analytics.totalSubmissions += 1;
    if (status === "ACCEPTED") {
      analytics.acceptedSubmissions += 1;
      if (difficulty === "easy") analytics.solvedEasy += 1;
      else if (difficulty === "medium") analytics.solvedMedium += 1;
      else if (difficulty === "hard") analytics.solvedHard += 1;
    } else if (status === "WRONG_ANSWER") analytics.wrongAnswers += 1;
    else if (status === "TIME_LIMIT_EXCEEDED") analytics.timeLimitExceeded += 1;
    else if (status === "MEMORY_LIMIT_EXCEEDED") analytics.memoryLimitExceeded += 1;
    else if (status === "RUNTIME_ERROR") analytics.runtimeError += 1;

    // 2. Acceptance rate
    analytics.acceptanceRate = Number(
      ((analytics.acceptedSubmissions / analytics.totalSubmissions) * 100).toFixed(2)
    );

    // 3. Streak Calculation (Strict Calendar Day Check)
    const lastDate = analytics.lastSubmissionDate;
    const now = new Date();

    if (!lastDate) {
      analytics.currentStreak = 1;
    } else {
      const lastDateStr = lastDate.toISOString().split("T")[0];
      if (lastDateStr !== todayStr) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        if (lastDateStr === yesterdayStr) {
          analytics.currentStreak += 1;
        } else {
          analytics.currentStreak = 1; // Reset streak if a day was skipped
        }
      }
    }

    if (analytics.currentStreak > analytics.maxStreak) {
      analytics.maxStreak = analytics.currentStreak;
    }
    analytics.lastSubmissionDate = now;

    // 4. Heatmap Update (Contribution Graph)
    const dayIndex = analytics.submissionHeatmap.findIndex((h) => h.date === todayStr);
    if (dayIndex !== -1) {
      analytics.submissionHeatmap[dayIndex].count += 1;
    } else {
      analytics.submissionHeatmap.push({ date: todayStr, count: 1 });
    }

    // 5. Topic Tag Analysis (Arrays, DP, Graphs, etc.)
    topics.forEach((topic) => {
      let tIndex = analytics!.topicStrengths.findIndex((t) => t.topic === topic);
      if (tIndex !== -1) {
        analytics!.topicStrengths[tIndex].totalSubmissions += 1;
        if (status === "ACCEPTED") analytics!.topicStrengths[tIndex].solvedCount += 1;
      } else {
        analytics!.topicStrengths.push({
          topic,
          totalSubmissions: 1,
          solvedCount: status === "ACCEPTED" ? 1 : 0,
        });
      }
    });

    await analytics.save();

    try {
      await redis.del(`analytics:user:${userId}`);
    } catch {
    }

    return analytics;
  }
}
