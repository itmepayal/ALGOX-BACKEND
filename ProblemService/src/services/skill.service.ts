import { TopicSkillProfile, ITopicSkillProfile, SkillConfidence, SkillTrend } from "../models/topicSkillProfile.model";
import { UserProblemProgress } from "../models/userProblemProgress.model";
import { Problem } from "../models/problem.model";
import { getRedisClient } from "../config/redis.config";
import { PROBLEM_PROGRESS_STATUS } from "../constants/progressStatus";

export interface ITopicSkillSummary {
  topic: string;
  rating: number;
  confidence: SkillConfidence;
  problemsAttempted: number;
  problemsSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  totalAttempts: number;
  acceptedSubmissions: number;
  acceptanceRate: number;
  trend: SkillTrend;
  lastActivityAt: Date | null;
}

export interface IUserSkillProfileResponse {
  overall: {
    averageRating: number;
    strongestTopic: string | null;
    weakestTopic: string | null;
    totalSolved: number;
    evaluatedTopicsCount: number;
  };
  topics: ITopicSkillSummary[];
}

const CACHE_TTL_SECONDS = 300;

export async function getUserSkillProfile(userId: string): Promise<IUserSkillProfileResponse> {
  const redis = getRedisClient();
  const cacheKey = `skill_profile:${userId}`;
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      // Redis fail-open
    }
  }

  // Fetch or calculate profiles
  let profiles: ITopicSkillProfile[] = await TopicSkillProfile.find({ userId }).sort({ rating: -1 }).exec();

  if (!profiles || profiles.length === 0) {
    profiles = await recalculateUserSkills(userId);
  }

  const topicSummaries: ITopicSkillSummary[] = profiles.map((p) => ({
    topic: p.topic,
    rating: Math.round(p.rating),
    confidence: p.confidence,
    problemsAttempted: p.problemsAttempted,
    problemsSolved: p.problemsSolved,
    easySolved: p.easySolved,
    mediumSolved: p.mediumSolved,
    hardSolved: p.hardSolved,
    totalAttempts: p.totalAttempts,
    acceptedSubmissions: p.acceptedSubmissions,
    acceptanceRate: Math.round(p.acceptanceRate * 10) / 10,
    trend: p.trend,
    lastActivityAt: p.lastEvaluatedAt || null,
  }));

  const evaluatedTopics = topicSummaries.filter((t) => t.problemsAttempted > 0);

  let averageRating = 1200;
  let strongestTopic: string | null = null;
  let weakestTopic: string | null = null;
  let totalSolved = 0;

  if (evaluatedTopics.length > 0) {
    const sumRating = evaluatedTopics.reduce((acc, curr) => acc + curr.rating, 0);
    averageRating = Math.round(sumRating / evaluatedTopics.length);
    strongestTopic = evaluatedTopics[0]?.topic || null;
    weakestTopic = evaluatedTopics[evaluatedTopics.length - 1]?.topic || null;
    totalSolved = evaluatedTopics.reduce((acc, curr) => acc + curr.problemsSolved, 0);
  }

  const response: IUserSkillProfileResponse = {
    overall: {
      averageRating,
      strongestTopic,
      weakestTopic,
      totalSolved,
      evaluatedTopicsCount: evaluatedTopics.length,
    },
    topics: topicSummaries,
  };

  if (redis) {
    try {
      await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(response));
    } catch (err) {
      // Redis fail-open
    }
  }

  return response;
}

export async function recalculateUserSkills(userId: string): Promise<ITopicSkillProfile[]> {
  // 1. Fetch user's problem progress records
  const progressRecords = await UserProblemProgress.find({ userId }).exec();

  if (progressRecords.length === 0) {
    // Delete existing profiles if any
    await TopicSkillProfile.deleteMany({ userId }).exec();
    return [];
  }

  // 2. Fetch associated problems
  const problemIds = progressRecords.map((p) => p.problemId);
  const problems = await Problem.find({ _id: { $in: problemIds } }).exec();
  const problemMap = new Map(problems.map((prob) => [prob._id.toString(), prob]));

  // Data structure for per-topic stats
  interface TopicAccumulator {
    topic: string;
    rating: number;
    problemsAttempted: number;
    problemsSolved: number;
    easySolved: number;
    mediumSolved: number;
    hardSolved: number;
    totalAttempts: number;
    acceptedSubmissions: number;
    lastActivityAt: Date | null;
    recentSolves: number;
  }

  const topicMap = new Map<string, TopicAccumulator>();

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  for (const prog of progressRecords) {
    const prob = problemMap.get(prog.problemId.toString());
    if (!prob) continue;

    // Collect topics: category + tags
    const topicSet = new Set<string>();
    if (prob.category && prob.category.trim()) {
      topicSet.add(prob.category.trim());
    }
    if (Array.isArray(prob.tags)) {
      for (const t of prob.tags) {
        if (t && t.trim()) {
          topicSet.add(t.trim());
        }
      }
    }

    const topics = Array.from(topicSet);
    if (topics.length === 0) continue;

    const topicWeight = 1 / topics.length;

    const isSolved = prog.status === PROBLEM_PROGRESS_STATUS.SOLVED || prog.acceptedSubmissions > 0;
    const diff = (prob.difficulty || "easy").toLowerCase();

    // Rating gain delta
    let solvedPoints = 0;
    if (isSolved) {
      if (diff === "easy") solvedPoints = 15;
      else if (diff === "medium") solvedPoints = 25;
      else if (diff === "hard") solvedPoints = 40;
    }

    // Attempt count & penalties
    const totalSub = Math.max(prog.totalSubmissions || 0, isSolved ? 1 : 0);
    const accSub = prog.acceptedSubmissions || (isSolved ? 1 : 0);
    const failedSub = Math.max(0, totalSub - accSub);
    const failurePenalty = Math.min(15, failedSub * 2); // capped penalty per problem

    const activityDate = prog.solvedAt || prog.lastAttemptAt || prog.updatedAt || null;
    const isRecent = activityDate && new Date(activityDate) >= sevenDaysAgo;

    for (const top of topics) {
      let acc = topicMap.get(top);
      if (!acc) {
        acc = {
          topic: top,
          rating: 1200,
          problemsAttempted: 0,
          problemsSolved: 0,
          easySolved: 0,
          mediumSolved: 0,
          hardSolved: 0,
          totalAttempts: 0,
          acceptedSubmissions: 0,
          lastActivityAt: null,
          recentSolves: 0,
        };
        topicMap.set(top, acc);
      }

      acc.problemsAttempted += 1;
      acc.totalAttempts += totalSub;
      acc.acceptedSubmissions += accSub;

      if (isSolved) {
        acc.problemsSolved += 1;
        if (diff === "easy") acc.easySolved += 1;
        else if (diff === "medium") acc.mediumSolved += 1;
        else if (diff === "hard") acc.hardSolved += 1;

        acc.rating += solvedPoints * topicWeight;
        if (isRecent) {
          acc.recentSolves += 1;
        }
      }

      // Small failure penalty applied to topic rating
      acc.rating = Math.max(800, acc.rating - failurePenalty * topicWeight);

      if (activityDate) {
        if (!acc.lastActivityAt || new Date(activityDate) > new Date(acc.lastActivityAt)) {
          acc.lastActivityAt = new Date(activityDate);
        }
      }
    }
  }

  // Bulk upside update Mongo records for user
  const updatedProfiles: ITopicSkillProfile[] = [];

  for (const [topicName, acc] of topicMap.entries()) {
    // Confidence model
    let confidence: SkillConfidence = "LOW";
    if (acc.problemsSolved >= 10) {
      confidence = "HIGH";
    } else if (acc.problemsSolved >= 3) {
      confidence = "MEDIUM";
    }

    // Trend model
    let trend: SkillTrend = "STABLE";
    if (acc.recentSolves >= 2) {
      trend = "IMPROVING";
    } else if (acc.problemsAttempted > acc.problemsSolved && acc.recentSolves === 0) {
      trend = "DECLINING";
    }

    const acceptanceRate = acc.totalAttempts > 0
      ? (acc.acceptedSubmissions / acc.totalAttempts) * 100
      : 0;

    const profile = await TopicSkillProfile.findOneAndUpdate(
      { userId, topic: topicName },
      {
        $set: {
          rating: Math.round(acc.rating),
          confidence,
          problemsAttempted: acc.problemsAttempted,
          problemsSolved: acc.problemsSolved,
          easySolved: acc.easySolved,
          mediumSolved: acc.mediumSolved,
          hardSolved: acc.hardSolved,
          totalAttempts: acc.totalAttempts,
          acceptedSubmissions: acc.acceptedSubmissions,
          acceptanceRate,
          trend,
          lastEvaluatedAt: acc.lastActivityAt || new Date(),
        },
      },
      { upsert: true, new: true }
    ).exec();

    if (profile) {
      updatedProfiles.push(profile);
    }
  }

  // Remove topics that are no longer part of user's evaluation if any
  const currentTopics = Array.from(topicMap.keys());
  await TopicSkillProfile.deleteMany({ userId, topic: { $nin: currentTopics } }).exec();

  // Invalidate Redis cache
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(`skill_profile:${userId}`);
    } catch (err) {
      // Fail-open
    }
  }

  return updatedProfiles.sort((a, b) => b.rating - a.rating);
}
