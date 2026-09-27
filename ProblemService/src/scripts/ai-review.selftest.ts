import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { AiCodeReview } from "../models/aiCodeReview.model";
import { SubmissionDoc } from "../models/submissionDoc.model";
import { aiReviewService } from "../services/aiReview.service";
import { aiCodeReviewPayloadSchema } from "../validators/ai.validator";


async function runSelfTest() {
  console.log("=== AI CODE REVIEW V1 — SELFTEST ===");

  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/algopath";
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB.");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string) {
    if (condition) {
      console.log(`✅ PASS: ${title}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${title}`);
      failed++;
    }
  }

  try {
    // Test 1: Schema Validation for structured AI response
    const validSample = {
      overallAssessment: "Great solution using two pointers.",
      correctness: {
        status: "correct",
        summary: "Passed all test cases.",
      },
      timeComplexity: {
        current: "O(N)",
        expected: "O(N)",
        explanation: "Single pass over the input array.",
      },
      spaceComplexity: {
        current: "O(1)",
        explanation: "Uses constant extra space.",
      },
      codeQuality: {
        score: 9,
        issues: ["Clean formatting"],
      },
      edgeCases: ["Empty array", "Single element"],
      optimizationSuggestions: ["No further optimization needed."],
      learningFeedback: "Excellent understanding of two pointers.",
      recommendedNextStep: "Try 3Sum or 4Sum next.",
    };

    const parsed = aiCodeReviewPayloadSchema.safeParse(validSample);
    assert(parsed.success, "1. Zod schema validates correct structured AI review payload");

    // Test 2: Invalid Schema Rejection
    const invalidSample = {
      overallAssessment: "Invalid",
      correctness: { status: "invalid_status" },
    };
    const parsedInvalid = aiCodeReviewPayloadSchema.safeParse(invalidSample);
    assert(!parsedInvalid.success, "2. Zod schema rejects malformed AI payload");

    // Test 3: Ownership check / Non-existent submission handling
    const dummyUserId = new Types.ObjectId().toString();
    const dummySubmissionId = new Types.ObjectId().toString();

    let ownershipFailed = false;
    try {
      await aiReviewService.generateCodeReview(dummyUserId, dummySubmissionId);
    } catch (err: any) {
      if (err.message.includes("Submission not found")) {
        ownershipFailed = true;
      }
    }
    assert(ownershipFailed, "3. Reject review request for non-existent submission (404)");

    // Test 4: Idempotency with mock database records
    const testUserId = new Types.ObjectId();
    const testProblemId = new Types.ObjectId();
    const testSubmissionId = new Types.ObjectId();

    await SubmissionDoc.create({
      _id: testSubmissionId,
      userId: testUserId,
      problemId: testProblemId,
      code: "function sum(a, b) { return a + b; }",
      language: "javascript",
      status: "ACCEPTED",
      testCasesPassed: 10,
      totalTestCases: 10,
    });

    await AiCodeReview.create({
      userId: testUserId,
      submissionId: testSubmissionId,
      problemId: testProblemId,
      language: "javascript",
      reviewVersion: "v1",
      reviewPayload: validSample as any,
      provider: "mock",
    });

    const cachedReview = await aiReviewService.getExistingReview(
      testUserId.toString(),
      testSubmissionId.toString()
    );

    assert(
      cachedReview !== null && cachedReview.cached === true,
      "4. Return stored AI Code Review when available (Idempotent)"
    );

    // Test 5: Reject viewing another user's review
    const otherUserId = new Types.ObjectId().toString();
    let forbiddenOther = false;
    try {
      await aiReviewService.getExistingReview(otherUserId, testSubmissionId.toString());
    } catch (err: any) {
      if (err.message.includes("belonging to another user")) {
        forbiddenOther = true;
      }
    }
    assert(forbiddenOther, "5. Reject unauthorized user accessing another user's AI review (403)");

    // Clean up test records
    await SubmissionDoc.deleteOne({ _id: testSubmissionId });
    await AiCodeReview.deleteOne({ submissionId: testSubmissionId });

    console.log(`\nRESULTS: ${passed} PASSED, ${failed} FAILED`);
  } catch (err) {
    console.error("Test execution error:", err);
  } finally {
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runSelfTest();
