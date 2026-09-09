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
  constructor(private submissionRepository: ISubmissionRepository) {}

  async createSubmission(
    dto: CreateSubmissionDto
  ): Promise<ISubmission> {
    if (!dto.problemId || !dto.code || !dto.language) {
      throw new BadRequestError(SUBMISSION_MESSAGES.MISSING_REQUIRED_FIELDS);
    }

    const problemId = dto.problemId.toString();

    // Fetch problem details (includes testcases) from ProblemService
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

    const response = await this.submissionRepository.createSubmission(submissionData);


    const payload = {
      submissionId: response._id.toString(),
      problem,
      code: dto.code,
      language: dto.language,
    };


    try {
      const jobId = await addSubmissionJob(payload);
      logger.info("Submission queued for evaluation", {
        submissionId: response._id,
        jobId,
      });
    } catch (error: any) {
      logger.error("Failed to queue submission for evaluation", {
        submissionId: response._id,
        error: error.message,
      });
    }

    return response;
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
