import { Types } from "mongoose";
import { AiCodeReview, IAiCodeReviewPayload } from "../models/aiCodeReview.model";
import { SubmissionDoc } from "../models/submissionDoc.model";
import { Problem } from "../models/problem.model";
import { AiUsageDaily, AiUsageEvent } from "../models/aiUsage.model";
import { aiAssistantService } from "./aiAssistant.service";
import { resolveEntitlements } from "../utils/entitlementClient";
import { checkAiRateLimit } from "../ai/aiRateLimit";
import { getAiProviderConfig } from "../ai/aiProvider";
import { aiCodeReviewPayloadSchema } from "../validators/ai.validator";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  TooManyRequestsError,
  ServiceUnavailableError,
} from "../utils/errors/app.error";

function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function parseJsonSafely(raw: string): any {
  let cleaned = raw.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function sanitizeReviewPayload(raw: any, submissionStatus: string): IAiCodeReviewPayload {
  const isAccepted = submissionStatus === "ACCEPTED";
  const statusDefault = isAccepted ? "correct" : "incorrect";

  const obj = typeof raw === "object" && raw !== null ? raw : {};

  const parsed = aiCodeReviewPayloadSchema.safeParse({
    overallAssessment:
      typeof obj.overallAssessment === "string" && obj.overallAssessment.trim()
        ? obj.overallAssessment.trim()
        : isAccepted
        ? "Solution successfully passed all test cases. Readability and algorithmic efficiency can be further refined."
        : "Solution failed execution or test cases. Review the error details and logic bottlenecks.",
    correctness: {
      status:
        obj.correctness?.status === "correct" ||
        obj.correctness?.status === "incorrect" ||
        obj.correctness?.status === "partial"
          ? obj.correctness.status
          : statusDefault,
      summary:
        typeof obj.correctness?.summary === "string" && obj.correctness.summary.trim()
          ? obj.correctness.summary.trim()
          : `Submission status is ${submissionStatus}.`,
    },
    timeComplexity: {
      current:
        typeof obj.timeComplexity?.current === "string" && obj.timeComplexity.current.trim()
          ? obj.timeComplexity.current.trim()
          : "O(N)",
      expected:
        typeof obj.timeComplexity?.expected === "string" && obj.timeComplexity.expected.trim()
          ? obj.timeComplexity.expected.trim()
          : "O(N)",
      explanation:
        typeof obj.timeComplexity?.explanation === "string" && obj.timeComplexity.explanation.trim()
          ? obj.timeComplexity.explanation.trim()
          : "Time complexity analyzed based on main loop iterations.",
    },
    spaceComplexity: {
      current:
        typeof obj.spaceComplexity?.current === "string" && obj.spaceComplexity.current.trim()
          ? obj.spaceComplexity.current.trim()
          : "O(1)",
      explanation:
        typeof obj.spaceComplexity?.explanation === "string" && obj.spaceComplexity.explanation.trim()
          ? obj.spaceComplexity.explanation.trim()
          : "Space complexity analyzed based on auxiliary variables and memory allocation.",
    },
    codeQuality: {
      score:
        typeof obj.codeQuality?.score === "number" &&
        obj.codeQuality.score >= 1 &&
        obj.codeQuality.score <= 10
          ? obj.codeQuality.score
          : isAccepted
          ? 8
          : 5,
      issues: Array.isArray(obj.codeQuality?.issues)
        ? obj.codeQuality.issues.map((i: any) => String(i)).filter(Boolean)
        : ["Variable naming and formatting can be improved."],
    },
    edgeCases: Array.isArray(obj.edgeCases)
      ? obj.edgeCases.map((e: any) => String(e)).filter(Boolean)
      : ["Empty input arrays", "Single element inputs", "Large input constraints"],
    optimizationSuggestions: Array.isArray(obj.optimizationSuggestions)
      ? obj.optimizationSuggestions.map((o: any) => String(o)).filter(Boolean)
      : ["Consider using hash map lookup to reduce nested iteration."],
    learningFeedback:
      typeof obj.learningFeedback === "string" && obj.learningFeedback.trim()
        ? obj.learningFeedback.trim()
        : "Focus on understanding time-space trade-offs and edge case bounds.",
    recommendedNextStep:
      typeof obj.recommendedNextStep === "string" && obj.recommendedNextStep.trim()
        ? obj.recommendedNextStep.trim()
        : "Practice similar Medium difficulty problems in this topic.",
  });

  if (parsed.success) {
    return parsed.data;
  }

  // Fallback guaranteed structure
  return {
    overallAssessment: "Submission analyzed.",
    correctness: {
      status: statusDefault,
      summary: `Judge returned ${submissionStatus}.`,
    },
    timeComplexity: {
      current: "O(N)",
      expected: "O(N)",
      explanation: "Analyzed runtime complexity.",
    },
    spaceComplexity: {
      current: "O(1)",
      explanation: "Analyzed auxiliary space usage.",
    },
    codeQuality: {
      score: isAccepted ? 8 : 5,
      issues: ["Review naming clarity and control structure."],
    },
    edgeCases: ["Empty input", "Boundary constraints"],
    optimizationSuggestions: ["Optimize primary lookup loops."],
    learningFeedback: "Review core algorithmic patterns.",
    recommendedNextStep: "Solve 1 Easy and 1 Medium practice problem in this topic.",
  };
}

export class AiReviewService {
  /**
   * Fetch existing review for submission if available and owned by user.
   */
  async getExistingReview(userId: string, submissionId: string) {
    if (!Types.ObjectId.isValid(submissionId)) {
      throw new BadRequestError("Invalid submissionId format");
    }

    const review = await AiCodeReview.findOne({ submissionId }).lean();
    if (!review) {
      return null;
    }

    if (review.userId.toString() !== userId) {
      throw new ForbiddenError("Cannot view AI review belonging to another user");
    }

    return {
      submissionId: review.submissionId.toString(),
      problemId: review.problemId.toString(),
      reviewPayload: review.reviewPayload,
      provider: review.provider,
      cached: true,
      createdAt: review.createdAt,
    };
  }

  /**
   * Generate or retrieve AI Code Review.
   */
  async generateCodeReview(
    userId: string,
    submissionId: string,
    refresh = false,
    authorization?: string | null
  ) {
    if (!Types.ObjectId.isValid(submissionId)) {
      throw new BadRequestError("Invalid submissionId format");
    }

    // Check submission existence and ownership
    const submission = await SubmissionDoc.findById(submissionId).lean();
    if (!submission) {
      throw new NotFoundError("Submission not found");
    }

    if (submission.userId && submission.userId.toString() !== userId) {
      throw new ForbiddenError("You can only request AI review for your own submissions");
    }

    if (!submission.code || !submission.code.trim()) {
      throw new BadRequestError("Submission does not contain valid source code");
    }

    // Idempotency: Return cached review if available and refresh is false
    if (!refresh) {
      const existing = await this.getExistingReview(userId, submissionId);
      if (existing) {
        return existing;
      }
    }

    // Resolve Entitlements & Premium policy
    const snap = await resolveEntitlements(authorization);
    if (snap.accessTier === "GUEST") {
      throw new ForbiddenError("Sign in to use AI Code Review");
    }

    const q = aiAssistantService.resolveQuota(snap);
    aiAssistantService.assertPremiumAi(snap, q);

    // Rate Limiting
    const rl = await checkAiRateLimit(`ai:${userId}`, 20, 60_000);
    if (!rl.allowed) {
      throw new TooManyRequestsError(
        `AI rate limit exceeded. Retry after ${rl.retryAfterSec}s`,
        { retryAfterSec: rl.retryAfterSec }
      );
    }

    // Check & consume Daily Quota
    const dateKey = utcDateKey();
    await aiAssistantService.getOrCreateDaily(userId, snap);

    const existingDaily = await AiUsageDaily.findOne({ userId, dateKey }).lean();
    if (existingDaily && existingDaily.used >= existingDaily.quota) {
      throw new ForbiddenError(
        `Daily AI quota exhausted (${existingDaily.used}/${existingDaily.quota}). Resets at UTC midnight.`
      );
    }

    const providerCfg = getAiProviderConfig();
    if (!providerCfg.configured) {
      throw new ServiceUnavailableError(
        "AlgoPath AI provider is not configured. Please check GEMINI_API_KEY environment variable.",
        { code: "AI_NOT_CONFIGURED" }
      );
    }

    // Claim daily quota unit atomically
    const claimed = await AiUsageDaily.findOneAndUpdate(
      { userId, dateKey, $expr: { $lt: ["$used", "$quota"] } },
      {
        $inc: { used: 1, "byFeature.code_review": 1 },
        $set: { accessTier: q.accessTier, quota: q.quota },
      },
      { returnDocument: "after" }
    );


    if (!claimed) {
      throw new ForbiddenError("Daily AI quota exhausted. Resets at UTC midnight.");
    }

    // Fetch Problem details
    const problem = await Problem.findById(submission.problemId)
      .select("title description difficulty category tags constraints")
      .lean();

    const problemTitle = problem?.title || "DSA Problem";
    const problemDescription = problem?.description
      ? String(problem.description).slice(0, 2000)
      : "N/A";
    const problemDifficulty = problem?.difficulty || "Medium";
    const problemTopics = [
      problem?.category,
      ...(Array.isArray(problem?.tags) ? problem.tags : []),
    ]
      .filter(Boolean)
      .join(", ") || "General";


    // Build Prompt
    const promptMessage = `Analyze this code submission and provide educational feedback as RAW VALID JSON ONLY (no markdown code fences).

PROBLEM DETAILS:
Title: ${problemTitle}
Difficulty: ${problemDifficulty}
Topics: ${problemTopics}
Description: ${problemDescription}

SUBMISSION DETAILS:
Language: ${submission.language}
Official Execution Status: ${submission.status}
Test Cases Passed: ${submission.testCasesPassed ?? 0} / ${submission.totalTestCases ?? 0}
Runtime: ${submission.executionTime ?? 0} ms
Memory: ${submission.memory ?? 0} MB
Error Log: ${submission.error || submission.output || "None"}

SUBMITTED SOURCE CODE:
${submission.code.slice(0, 3000)}

EXPECTED JSON SCHEMA:
{
  "overallAssessment": "string",
  "correctness": {
    "status": "correct | incorrect | partial",
    "summary": "string"
  },
  "timeComplexity": {
    "current": "string (e.g. O(N))",
    "expected": "string (e.g. O(N))",
    "explanation": "string"
  },
  "spaceComplexity": {
    "current": "string (e.g. O(1))",
    "explanation": "string"
  },
  "codeQuality": {
    "score": number (1 to 10),
    "issues": ["string"]
  },
  "edgeCases": ["string"],
  "optimizationSuggestions": ["string"],
  "learningFeedback": "string",
  "recommendedNextStep": "string"
}`;

    const started = Date.now();
    try {
      const aiResult = await aiAssistantService.assist(
        userId,
        {
          feature: "code_review",
          problemId: submission.problemId.toString(),
          userMessage: promptMessage,
          codeSnippet: submission.code.slice(0, 2500),
          language: submission.language as any,
        },
        authorization
      );

      const rawReply = aiResult.reply || "";
      const rawJson = parseJsonSafely(rawReply);
      const sanitizedPayload = sanitizeReviewPayload(rawJson, submission.status);

      // Save persistent AI Code Review
      const savedReview = await AiCodeReview.findOneAndUpdate(
        { submissionId: submission._id },
        {
          userId: new Types.ObjectId(userId),
          submissionId: submission._id,
          problemId: submission.problemId,
          language: submission.language,
          reviewVersion: "v1",
          reviewPayload: sanitizedPayload,
          provider: aiResult.provider,
        },
        { upsert: true, returnDocument: "after" }
      );

      return {
        submissionId: savedReview.submissionId.toString(),
        problemId: savedReview.problemId.toString(),
        reviewPayload: savedReview.reviewPayload,
        provider: savedReview.provider,
        cached: false,
        createdAt: savedReview.createdAt,
      };
    } catch (err: any) {
      // Record failure event
      await AiUsageEvent.create({
        userId,
        feature: "code_review",
        dateKey,
        success: false,
        failureReason: String(err?.message || "review_generation_failed").slice(0, 160),
        problemId: submission.problemId.toString(),
        hadCodeSnippet: true,
        codeLength: submission.code.length,
        latencyMs: Date.now() - started,
        provider: providerCfg.provider,
      });

      throw err;
    }
  }
}

export const aiReviewService = new AiReviewService();
