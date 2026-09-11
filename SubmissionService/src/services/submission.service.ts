import { Types } from "mongoose";
import { getProblemById } from "../apis/problem.api";
import logger from "../config/logger.config";
import { ISubmission, SubmissionStatus } from "../models/submission.model";
import { addSubmissionJob } from "../producers/submission.producer";
import { ISubmissionRepository } from "../repositories/submission.repository";
import { BadRequestError, NotFoundError } from "../utils/errors/app.error";
import { SUBMISSION_MESSAGES } from "../utils/constants";
import { CreateSubmissionDto } from "../validators/submission.validator";

export interface ISubmissionService {
  createSubmission(submission: CreateSubmissionDto): Promise<ISubmission>;
  getByProblemId(problemId: string): Promise<ISubmission[]>;
  getByUserId(userId: string): Promise<ISubmission[]>;
  getSubmissionById(id: string): Promise<ISubmission | null>;
  getAllSubmissions(
    page: number,
    limit: number
  ): Promise<{
    submissions: ISubmission[];
    total: number;
    page: number;
    totalPages: number;
  }>;
  updateSubmission(
    submissionId: string,
    submission: Partial<ISubmission>
  ): Promise<ISubmission | null>;
  deleteSubmission(submissionId: string): Promise<boolean>;
  getByStatus(status: SubmissionStatus): Promise<ISubmission[]>;
  getByLanguage(language: string): Promise<ISubmission[]>;
  searchSubmissions(query: string): Promise<ISubmission[]>;
}

export class SubmissionService implements ISubmissionService {
  constructor(private submissionRepository: ISubmissionRepository) { }

  async createSubmission(
    dto: CreateSubmissionDto
  ): Promise<ISubmission> {
    if (!dto.problemId || !dto.code || !dto.language) {
      throw new BadRequestError(SUBMISSION_MESSAGES.MISSING_REQUIRED_FIELDS);
    }

    const problemId = dto.problemId.toString();

    const problem = await getProblemById(problemId);

    if (!problem) {
      throw new NotFoundError("Problem not found in ProblemService");
    }

    const submissionData: Partial<ISubmission> = {
      problemId: new Types.ObjectId(dto.problemId),
      ...(dto.userId && { userId: new Types.ObjectId(dto.userId) }),
      language: dto.language,
      code: dto.code,
      status: "PENDING",
    };

    logger.info("SUBMISSION REQUEST RECEIVED", { problemId, language: dto.language });

    const response = await this.submissionRepository.createSubmission(submissionData);

    logger.info("PROBLEM FOUND — submission created", {
      submissionId: response._id,
      problemId,
    });

    // Official suite ONLY — loaded from ProblemService internal API.
    // Never accept testcases from the client (validator also omits them).
    const rawTestcases = (problem as any).testcases || [];
    const testcases = rawTestcases.map((tc: any) => ({
      input: tc.input,
      output: tc.output ?? tc.expectedOutput ?? "",
      expectedOutput: tc.expectedOutput ?? tc.output ?? "",
      isHidden: Boolean(tc.isHidden),
    }));

    const publicCount = testcases.filter((t: any) => !t.isHidden).length;
    const hiddenCount = testcases.filter((t: any) => t.isHidden).length;

    logger.info("SUBMIT — official testcases loaded from ProblemService", {
      submissionId: response._id,
      total: testcases.length,
      publicCount,
      hiddenCount,
    });

    if (testcases.length === 0) {
      await this.submissionRepository.updateSubmission(response._id.toString(), {
        status: "RUNTIME_ERROR",
        error: "Problem has no official test cases configured.",
      });
      return (await this.submissionRepository.getSubmissionById(
        response._id.toString()
      )) as ISubmission;
    }

    // Persist expected totals so the UI can show 0/N while PENDING
    const withTotals = await this.submissionRepository.updateSubmission(
      response._id.toString(),
      {
        totalTestCases: testcases.length,
        testCasesPassed: 0,
      } as any
    );

    const payload = {
      submissionId: response._id.toString(),
      problemId,
      problem,
      code: dto.code,
      language: dto.language,
      testcases,
      mode: "submit" as const,
      timeLimitMs: (problem as any).timeLimitMs || 2000,
      memoryLimitMb: (problem as any).memoryLimitMb || 256,
      userId: dto.userId,
    };

    try {
      const jobId = await Promise.race([
        addSubmissionJob(payload),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Redis queue add timed out after 8s")), 8000)
        ),
      ]);
      logger.info("Submission queued for evaluation", {
        submissionId: response._id,
        jobId,
      });
    } catch (error: any) {
      logger.error("Failed to queue submission for evaluation", {
        submissionId: response._id,
        error: error.message,
      });
      // Persist failure so frontend polling does not hang on PENDING forever
      await this.submissionRepository.updateSubmission(response._id.toString(), {
        status: "RUNTIME_ERROR",
        error: `Failed to queue evaluation: ${error.message}`,
      });
      return (await this.submissionRepository.getSubmissionById(
        response._id.toString()
      )) as ISubmission;
    }

    logger.info("RESPONSE SENT — returning PENDING submission", {
      submissionId: response._id,
    });
    return (
      withTotals ||
      ((await this.submissionRepository.getSubmissionById(
        response._id.toString()
      )) as ISubmission)
    );
  }

  async getByProblemId(problemId: string): Promise<ISubmission[]> {
    if (!problemId) throw new BadRequestError("Problem ID is required");
    return await this.submissionRepository.getByProblemId(problemId);
  }

  async getByUserId(userId: string): Promise<ISubmission[]> {
    if (!userId) throw new BadRequestError("User ID is required");
    return await this.submissionRepository.getByUserId(userId);
  }

  async getSubmissionById(id: string): Promise<ISubmission | null> {
    if (!id) throw new BadRequestError("Submission ID is required");

    const submission = await this.submissionRepository.getSubmissionById(id);

    if (!submission) {
      throw new NotFoundError(SUBMISSION_MESSAGES.SUBMISSION_NOT_FOUND);
    }

    return submission;
  }

  async getAllSubmissions(page: number, limit: number) {
    return await this.submissionRepository.getAllSubmissions(page, limit);
  }

  async updateSubmission(
    submissionId: string,
    submission: Partial<ISubmission>
  ): Promise<ISubmission | null> {
    if (!submissionId) throw new BadRequestError("Submission ID is required");

    const updated = await this.submissionRepository.updateSubmission(
      submissionId,
      submission
    );

    if (!updated) {
      throw new NotFoundError(SUBMISSION_MESSAGES.SUBMISSION_NOT_FOUND);
    }

    return updated;
  }

  async deleteSubmission(submissionId: string): Promise<boolean> {
    if (!submissionId) throw new BadRequestError("Submission ID is required");

    const deleted = await this.submissionRepository.deleteSubmission(
      submissionId
    );

    if (!deleted) {
      throw new NotFoundError(SUBMISSION_MESSAGES.SUBMISSION_NOT_FOUND);
    }

    return true;
  }

  async getByStatus(status: SubmissionStatus): Promise<ISubmission[]> {
    return await this.submissionRepository.getByStatus(status);
  }

  async getByLanguage(language: string): Promise<ISubmission[]> {
    return await this.submissionRepository.getByLanguage(language);
  }

  async searchSubmissions(query: string): Promise<ISubmission[]> {
    if (!query) return [];
    return await this.submissionRepository.searchSubmissions(query);
  }
}
