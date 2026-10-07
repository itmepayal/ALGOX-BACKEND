import { Types } from "mongoose";
import { AiCodeReview, IAiCodeReviewPayload } from "../models/aiCodeReview.model";
import { SubmissionDoc } from "../models/submissionDoc.model";
import { Problem } from "../models/problem.model";
import { aiAssistantService } from "./aiAssistant.service";
import { resolveEntitlements } from "../utils/entitlementClient";
import { aiCodeReviewPayloadSchema } from "../validators/ai.validator";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
} from "../utils/errors/app.error";

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

function sanitizeReviewPayload(raw: unknown): IAiCodeReviewPayload {
  const parsed = aiCodeReviewPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ServiceUnavailableError(
      "AlgoPath AI returned an incomplete code review. Please retry.",
      { code: "AI_PROVIDER_INVALID_REVIEW" }
    );
  }

  // Normalize whitespace without inventing complexity, correctness, or feedback.
  const value = parsed.data;
  return {
    ...value,
    overallAssessment: value.overallAssessment.trim(),
    correctness: { ...value.correctness, summary: value.correctness.summary.trim() },
    timeComplexity: {
      ...value.timeComplexity,
      current: value.timeComplexity.current.trim(),
      expected: value.timeComplexity.expected.trim(),
      explanation: value.timeComplexity.explanation.trim(),
    },
    spaceComplexity: {
      ...value.spaceComplexity,
      current: value.spaceComplexity.current.trim(),
      explanation: value.spaceComplexity.explanation.trim(),
    },
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

    // Resolve Entitlements & Premium policy
    const snap = await resolveEntitlements(authorization);
    if (snap.accessTier === "GUEST") {
      throw new ForbiddenError("Sign in to use AI Code Review");
    }

    const q = aiAssistantService.resolveQuota(snap);
    aiAssistantService.assertPremiumAi(snap, q);

    // Enforce entitlements even when returning a cached result.
    if (!refresh) {
      const existing = await this.getExistingReview(userId, submissionId);
      if (existing) return existing;
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
      const sanitizedPayload = sanitizeReviewPayload(rawJson);

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
      throw err;
    }
  }
}

export const aiReviewService = new AiReviewService();
