/**
 * Admin product-usage metrics derived from authoritative Mongo collections.
 * Not a client event stream — unique users / activity windows from real docs.
 */
import { UserDailyPlan } from "../models/userDailyPlan.model";
import { UserStudySession } from "../models/userStudySession.model";
import { UserSpacedRepetition } from "../models/userSpacedRepetition.model";
import { AiUsageDaily, AiUsageEvent } from "../models/aiUsage.model";
import { MockInterviewSession } from "../models/mockInterviewSession.model";

function utcDayStart(d = new Date()): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
}

function daysAgoUtc(n: number): Date {
  return new Date(utcDayStart().getTime() - n * 86400000);
}

function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

async function uniqueUsersSince(
  model: { distinct: (f: string, q: object) => Promise<unknown[]> },
  dateField: string,
  since: Date
): Promise<number> {
  const ids = await model.distinct("userId", {
    [dateField]: { $gte: since },
  });
  return ids.length;
}

async function featureWindow(opts: {
  model: any;
  dateField: string;
  eventCountField?: string;
}): Promise<{
  uniqueUsers: number;
  today: number;
  week: number;
  month: number;
  totalEvents: number | null;
  source: string;
}> {
  const { model, dateField } = opts;
  const todayStart = utcDayStart();
  const weekStart = daysAgoUtc(7);
  const monthStart = daysAgoUtc(30);

  const [uniqueUsers, today, week, month, totalEvents] = await Promise.all([
    model.distinct("userId").then((ids: unknown[]) => ids.length),
    uniqueUsersSince(model, dateField, todayStart),
    uniqueUsersSince(model, dateField, weekStart),
    uniqueUsersSince(model, dateField, monthStart),
    model.countDocuments({}),
  ]);

  return {
    uniqueUsers,
    today,
    week,
    month,
    totalEvents,
    source: model.modelName || "mongo",
  };
}

export async function getProductUsageOverview() {
  const todayStart = utcDayStart();
  const weekStart = daysAgoUtc(7);
  const monthStart = daysAgoUtc(30);
  const todayKey = utcDateKey();
  const weekKeys: string[] = [];
  const monthKeys: string[] = [];
  for (let i = 0; i < 7; i++) {
    weekKeys.push(utcDateKey(new Date(Date.now() - i * 86400000)));
  }
  for (let i = 0; i < 30; i++) {
    monthKeys.push(utcDateKey(new Date(Date.now() - i * 86400000)));
  }

  const endOfToday = new Date(todayStart.getTime() + 86400000);

  const [
    planner,
    sessions,
    sessionsExtra,
    revisionCards,
    revisionFeedback,
    aiDaily,
    aiEvents,
    mockInterview,
    mockInterviewExtra,
  ] = await Promise.all([
    featureWindow({ model: UserDailyPlan, dateField: "updatedAt" }),
    featureWindow({ model: UserStudySession, dateField: "updatedAt" }),
    Promise.all([
      UserStudySession.countDocuments({ status: "running" }),
      UserStudySession.countDocuments({ status: "completed" }),
      UserStudySession.countDocuments({
        status: "completed",
        updatedAt: { $gte: todayStart },
      }),
      UserStudySession.aggregate([
        { $match: { status: "completed", accumulatedMs: { $gt: 0 } } },
        { $group: { _id: null, avgMs: { $avg: "$accumulatedMs" } } },
      ]),
    ]),
    Promise.all([
      UserSpacedRepetition.distinct("userId").then((ids) => ids.length),
      UserSpacedRepetition.countDocuments({
        status: "active",
        nextReviewAt: { $gte: todayStart, $lt: endOfToday },
      }),
      UserSpacedRepetition.countDocuments({
        status: "active",
        nextReviewAt: { $lt: todayStart },
      }),
      UserSpacedRepetition.countDocuments({
        status: "active",
        nextReviewAt: { $gte: endOfToday },
      }),
      UserSpacedRepetition.countDocuments({
        lastReviewedAt: { $gte: todayStart },
      }),
      UserSpacedRepetition.distinct("userId", {
        updatedAt: { $gte: todayStart },
      }).then((ids) => ids.length),
      UserSpacedRepetition.distinct("userId", {
        updatedAt: { $gte: weekStart },
      }).then((ids) => ids.length),
      UserSpacedRepetition.distinct("userId", {
        updatedAt: { $gte: monthStart },
      }).then((ids) => ids.length),
    ]),
    UserSpacedRepetition.aggregate([
      { $match: { confidence: { $in: ["hard", "okay", "easy"] } } },
      { $group: { _id: "$confidence", count: { $sum: 1 } } },
    ]),
    Promise.all([
      AiUsageDaily.distinct("userId").then((ids) => ids.length),
      AiUsageDaily.distinct("userId", { dateKey: todayKey }).then(
        (ids) => ids.length
      ),
      AiUsageDaily.distinct("userId", { dateKey: { $in: weekKeys } }).then(
        (ids) => ids.length
      ),
      AiUsageDaily.distinct("userId", { dateKey: { $in: monthKeys } }).then(
        (ids) => ids.length
      ),
      AiUsageDaily.aggregate([
        { $match: { dateKey: todayKey } },
        { $group: { _id: null, used: { $sum: "$used" }, failed: { $sum: "$failed" } } },
      ]),
      AiUsageDaily.aggregate([
        { $match: { dateKey: { $in: weekKeys } } },
        { $group: { _id: null, used: { $sum: "$used" } } },
      ]),
      AiUsageDaily.aggregate([
        { $match: { dateKey: { $in: monthKeys } } },
        { $group: { _id: null, used: { $sum: "$used" } } },
      ]),
    ]),
    Promise.all([
      AiUsageEvent.countDocuments({ createdAt: { $gte: todayStart } }),
      AiUsageEvent.countDocuments({
        createdAt: { $gte: todayStart },
        success: false,
      }),
      AiUsageEvent.aggregate([
        { $match: { createdAt: { $gte: weekStart }, latencyMs: { $gt: 0 } } },
        { $group: { _id: null, avg: { $avg: "$latencyMs" } } },
      ]),
    ]),
    featureWindow({ model: MockInterviewSession, dateField: "createdAt" }),
    Promise.all([
      MockInterviewSession.countDocuments({ status: "in_progress" }),
      MockInterviewSession.countDocuments({ status: "completed" }),
      MockInterviewSession.countDocuments({ status: "timed_out" }),
      MockInterviewSession.countDocuments({ status: "abandoned" }),
      MockInterviewSession.aggregate([
        {
          $match: {
            "report.overallScore": { $ne: null },
            status: { $in: ["completed", "timed_out"] },
          },
        },
        { $group: { _id: null, avg: { $avg: "$report.overallScore" } } },
      ]),
    ]),
  ]);

  const feedbackMap: Record<string, number> = { hard: 0, okay: 0, easy: 0 };
  for (const row of revisionFeedback) {
    feedbackMap[String(row._id)] = Number(row.count || 0);
  }

  const [
    activeSessions,
    completedSessions,
    completedToday,
    avgDurationAgg,
  ] = sessionsExtra;
  const avgDurationMs =
    avgDurationAgg?.[0]?.avgMs != null
      ? Math.round(Number(avgDurationAgg[0].avgMs))
      : null;

  const [
    srsUsers,
    dueToday,
    overdue,
    upcoming,
    completedTodaySrs,
    srsTodayUsers,
    srsWeekUsers,
    srsMonthUsers,
  ] = revisionCards;

  const [
    aiUsers,
    aiTodayUsers,
    aiWeekUsers,
    aiMonthUsers,
    aiTodayAgg,
    aiWeekAgg,
    aiMonthAgg,
  ] = aiDaily;

  const [aiEventsToday, aiFailedToday, aiLatencyAgg] = aiEvents;

  const [
    miInProgress,
    miCompleted,
    miTimedOut,
    miAbandoned,
    miAvgScoreAgg,
  ] = mockInterviewExtra;

  return {
    generatedAt: new Date().toISOString(),
    timezoneNote: "Activity windows use UTC day boundaries unless noted",
    features: {
      planner: {
        ...planner,
        note: "Unique users with UserDailyPlan docs; windows by updatedAt",
      },
      sessions: {
        ...sessions,
        activeSessions,
        completedSessions,
        completedToday,
        avgDurationMs,
        note: "UserStudySession docs; windows by updatedAt",
      },
      calendar: {
        uniqueUsers: null,
        today: null,
        week: null,
        month: null,
        totalEvents: null,
        available: false,
        note: "No dedicated calendar event collection — calendar reads planner + sessions",
      },
      companies: {
        uniqueUsers: null,
        today: null,
        week: null,
        month: null,
        totalEvents: null,
        available: false,
        note: "Company views are not logged as analytics events",
      },
      analyticsPage: {
        uniqueUsers: null,
        today: null,
        week: null,
        month: null,
        available: false,
        note: "No analytics-page view events recorded",
      },
      ai: {
        uniqueUsers: aiUsers,
        today: aiTodayUsers,
        week: aiWeekUsers,
        month: aiMonthUsers,
        requestsToday: Number(aiTodayAgg?.[0]?.used || 0),
        requestsWeek: Number(aiWeekAgg?.[0]?.used || 0),
        requestsMonth: Number(aiMonthAgg?.[0]?.used || 0),
        failedToday: Number(aiTodayAgg?.[0]?.failed || 0),
        eventsToday: aiEventsToday,
        failedEventsToday: aiFailedToday,
        avgLatencyMsWeek:
          aiLatencyAgg?.[0]?.avg != null
            ? Math.round(Number(aiLatencyAgg[0].avg))
            : null,
        note: "AiUsageDaily + AiUsageEvent (no prompt bodies)",
      },
      revisionQueue: {
        uniqueUsers: srsUsers,
        today: srsTodayUsers,
        week: srsWeekUsers,
        month: srsMonthUsers,
        dueToday,
        overdue,
        upcoming,
        completedToday: completedTodaySrs,
        feedback: feedbackMap,
        note: "UserSpacedRepetition (SRS) — not ProblemRevision bookmarks",
      },
      mockInterview: {
        ...mockInterview,
        inProgress: miInProgress,
        completed: miCompleted,
        timedOut: miTimedOut,
        abandoned: miAbandoned,
        averageOverallScore:
          miAvgScoreAgg?.[0]?.avg != null
            ? Math.round(Number(miAvgScoreAgg[0].avg))
            : null,
        note: "MockInterviewSession docs; windows by createdAt",
      },
    },
  };
}
