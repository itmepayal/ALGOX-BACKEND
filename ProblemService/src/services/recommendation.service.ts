import { Problem } from "../models/problem.model";
import { UserProblemProgress } from "../models/userProblemProgress.model";
import { getUserSkillProfile, ITopicSkillSummary } from "./skill.service";
import { getRedisClient } from "../config/redis.config";
import { PROBLEM_PROGRESS_STATUS } from "../constants/progressStatus";

export interface IRecommendationItem {
  problemId: string;
  title: string;
  slug: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
  tags: string[];
  isPremium?: boolean;
  score: number;
  reason: string;
  primaryTopic: string;
  hasFailedAttempts: boolean;
  failedAttemptsCount: number;
}

export interface IRecommendationResponse {
  summary: {
    focusTopic: string | null;
    targetDifficulty: string;
    totalCandidatesEvaluated: number;
    userAverageRating: number;
  };
  recommendations: IRecommendationItem[];
}

export interface RecommendationQueryOpts {
  limit?: number;
  topic?: string;
  difficulty?: string;
}

const CACHE_TTL_SECONDS = 300;

export async function getAdaptiveRecommendations(
  userId: string,
  opts?: RecommendationQueryOpts
): Promise<IRecommendationResponse> {
  const limit = Math.min(20, Math.max(1, opts?.limit || 5));
  const filterTopic = opts?.topic?.trim().toLowerCase();
  const filterDifficulty = opts?.difficulty?.trim().toLowerCase();

  const redis = getRedisClient();
  const cacheKey = `recommendations:${userId}:${limit}:${filterTopic || "all"}:${filterDifficulty || "all"}`;

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

  // 1. Fetch user's topic skill profile
  const skillProfile = await getUserSkillProfile(userId);
  const userAvgRating = skillProfile.overall.averageRating || 1200;
  const weakestTopic = skillProfile.overall.weakestTopic;

  const topicMap = new Map<string, ITopicSkillSummary>();
  for (const t of skillProfile.topics) {
    topicMap.set(t.topic.toLowerCase(), t);
  }

  // 2. Fetch user's problem progress records
  const progressRecords = await UserProblemProgress.find({ userId }).exec();
  const solvedProblemIdSet = new Set<string>();
  const attemptedProblemMap = new Map<
    string,
    { totalSubmissions: number; acceptedSubmissions: number; lastAttemptAt: Date | null }
  >();

  for (const prog of progressRecords) {
    const pId = prog.problemId.toString();
    const isSolved = prog.status === PROBLEM_PROGRESS_STATUS.SOLVED || prog.acceptedSubmissions > 0;
    if (isSolved) {
      solvedProblemIdSet.add(pId);
    } else if (prog.totalSubmissions > 0) {
      attemptedProblemMap.set(pId, {
        totalSubmissions: prog.totalSubmissions,
        acceptedSubmissions: prog.acceptedSubmissions || 0,
        lastAttemptAt: prog.lastAttemptAt || prog.updatedAt || null,
      });
    }
  }

  // 3. Query candidate problems from DB
  const query: Record<string, any> = {
    status: { $ne: "archived" },
  };

  if (filterDifficulty) {
    query.difficulty = filterDifficulty;
  }

  const allProblems = await Problem.find(query).exec();

  // 4. Candidate filtering: separate unsolved vs solved fallback
  let candidates = allProblems.filter((p) => !solvedProblemIdSet.has(p._id.toString()));

  // Filter by topic if specified
  if (filterTopic) {
    candidates = candidates.filter((p) => {
      const cat = (p.category || "").toLowerCase();
      const tags = (p.tags || []).map((t) => t.toLowerCase());
      return cat === filterTopic || tags.includes(filterTopic);
    });
  }

  // Fallback: If no unsolved candidate exists, use all problems as candidates
  if (candidates.length === 0 && allProblems.length > 0) {
    candidates = filterTopic
      ? allProblems.filter((p) => {
          const cat = (p.category || "").toLowerCase();
          const tags = (p.tags || []).map((t) => t.toLowerCase());
          return cat === filterTopic || tags.includes(filterTopic);
        })
      : allProblems;
  }

  const totalCandidatesEvaluated = candidates.length;
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 5. Score candidate problems
  const scoredItems: (IRecommendationItem & { rawScore: number })[] = [];

  for (const prob of candidates) {
    const probIdStr = prob._id.toString();
    const diff = (prob.difficulty || "easy").toLowerCase() as "easy" | "medium" | "hard";

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
    const topicsList = Array.from(topicSet);
    const primaryTopic = topicsList[0] || prob.category || "General";

    // Calculate candidate topic rating average & signals
    let sumTopicRating = 0;
    let topicCount = 0;
    let isWeakTopicMatch = false;
    let hasDecliningTrend = false;
    let isStaleTopic = false;

    for (const tName of topicsList) {
      const summary = topicMap.get(tName.toLowerCase());
      if (summary) {
        sumTopicRating += summary.rating;
        topicCount += 1;
        if (summary.trend === "DECLINING") hasDecliningTrend = true;
        if (!summary.lastActivityAt || new Date(summary.lastActivityAt) < sevenDaysAgo) {
          isStaleTopic = true;
        }
      } else {
        sumTopicRating += 1200; // default initial rating
        topicCount += 1;
        isStaleTopic = true;
      }

      if (weakestTopic && tName.toLowerCase() === weakestTopic.toLowerCase()) {
        isWeakTopicMatch = true;
      }
    }

    const candTopicRating = Math.round(sumTopicRating / Math.max(1, topicCount));

    // --- Scoring Signals ---

    // 1. Topic Weakness Score (0 - 40)
    // Lower rating -> higher weakness score
    let weaknessScore = Math.max(5, Math.round(40 - (candTopicRating - 800) * 0.035));
    if (isWeakTopicMatch) weaknessScore += 10;
    if (hasDecliningTrend) weaknessScore += 5;
    weaknessScore = Math.min(40, weaknessScore);

    // 2. Difficulty Suitability Score (0 - 35)
    let diffSuitability = 15;
    if (candTopicRating < 1200) {
      if (diff === "easy") diffSuitability = 35;
      else if (diff === "medium") diffSuitability = 20;
      else if (diff === "hard") diffSuitability = 5;
    } else if (candTopicRating < 1600) {
      if (diff === "medium") diffSuitability = 35;
      else if (diff === "easy") diffSuitability = 25;
      else if (diff === "hard") diffSuitability = 15;
    } else {
      if (diff === "hard") diffSuitability = 35;
      else if (diff === "medium") diffSuitability = 25;
      else if (diff === "easy") diffSuitability = 10;
    }

    // 3. Failed Attempt Signal (0 - 15)
    const attemptedRecord = attemptedProblemMap.get(probIdStr);
    const hasFailedAttempts = Boolean(attemptedRecord && attemptedRecord.totalSubmissions > 0);
    const failedAttemptsCount = attemptedRecord ? attemptedRecord.totalSubmissions : 0;
    let failedAttemptScore = 0;
    if (hasFailedAttempts) {
      failedAttemptScore = 15;
    }

    // 4. Recency / Spaced Repetition Signal (0 - 10)
    let recencyScore = isStaleTopic ? 8 : 3;

    // Total raw score
    const totalScore = Math.min(
      100,
      Math.max(10, weaknessScore + diffSuitability + failedAttemptScore + recencyScore)
    );

    // Machine-generated Reason
    let reason = "";
    if (hasFailedAttempts) {
      reason = `You have ${failedAttemptsCount} failed attempt(s) on this problem. Practicing it now will help master your approach.`;
    } else if (isWeakTopicMatch || candTopicRating < 1250) {
      reason = `Your ${primaryTopic} skill (${candTopicRating}) is currently weaker. This ${diff} problem is an optimal next step.`;
    } else if (candTopicRating >= 1550 && diff === "hard") {
      reason = `Your ${primaryTopic} skill is strong (${candTopicRating}). Challenge yourself with this Hard problem for peak mastery.`;
    } else if (isStaleTopic) {
      reason = `Revisiting ${primaryTopic} with a ${diff} problem will reinforce spaced learning retention.`;
    } else {
      reason = `Recommended for your skill level (${candTopicRating}) in ${primaryTopic} to maintain steady progress.`;
    }

    scoredItems.push({
      problemId: probIdStr,
      title: prob.title,
      slug: prob.slug,
      difficulty: diff,
      category: prob.category || primaryTopic,
      tags: prob.tags || [],
      isPremium: Boolean(prob.isPremium),
      score: totalScore,
      reason,
      primaryTopic,
      hasFailedAttempts,
      failedAttemptsCount,
      rawScore: totalScore,
    });
  }

  // 6. Sort by score descending and take top N
  scoredItems.sort((a, b) => b.rawScore - a.rawScore);
  const topRecommendations = scoredItems.slice(0, limit).map(({ rawScore, ...item }) => item);

  // Target difficulty summary
  let targetDifficulty = "Medium";
  if (userAvgRating < 1200) targetDifficulty = "Easy";
  else if (userAvgRating >= 1600) targetDifficulty = "Hard";

  const response: IRecommendationResponse = {
    summary: {
      focusTopic: weakestTopic || topRecommendations[0]?.primaryTopic || "General",
      targetDifficulty,
      totalCandidatesEvaluated,
      userAverageRating: userAvgRating,
    },
    recommendations: topRecommendations,
  };

  if (redis) {
    try {
      await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(response));
    } catch (err) {
      // Fail-open
    }
  }

  return response;
}
