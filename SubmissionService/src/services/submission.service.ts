import { getProblemById } from "../apis/problem.api";
import logger from "../config/logger.config";
import { ISubmission, SubmissionStatus } from "../models/submission.model";
import { addSubmissionJob } from "../producers/submission.producer";
import { ISubmissionRepository } from "../repositories/submission.repository";
import { BadRequestError, NotFoundError } from "../utils/errors/app.error";

export interface ISubmissionService {
  createSubmission(submission: Partial<ISubmission>): Promise<ISubmission>;
  getByProblemId(problemId: string): Promise<ISubmission[]>;
  getSubmissionById(id: string): Promise<ISubmission | null>;
  getAllSubmissions(
    page: number,
    limit: number,
  ): Promise<{
    submissions: ISubmission[];
    total: number;
    page: number;
    totalPages: number;
  }>;
  updateSubmission(
    submissionId: string,
    submission: Partial<ISubmission>,
  ): Promise<ISubmission | null>;
  deleteSubmission(submissionId: string): Promise<boolean>;
  getByStatus(status: SubmissionStatus): Promise<ISubmission[]>;
  getByLanguage(language: string): Promise<ISubmission[]>;
  searchSubmissions(query: string): Promise<ISubmission[]>;
}

export class SubmissionService implements ISubmissionService {
  private submissionRepository: ISubmissionRepository;

  constructor(submissionRepository: ISubmissionRepository) {
    this.submissionRepository = submissionRepository;
  }

  async createSubmission(
    submission: Partial<ISubmission>,
  ): Promise<ISubmission> {
    if (!submission.problemId || !submission.code || !submission.language) {
      throw new BadRequestError("Missing required fields");
    }

    const problemId = submission.problemId.toString();

    const problem = await getProblemById(problemId);

    if (!problem) {
      throw new NotFoundError("Problem not found");
    }

    submission.status = "PENDING";

    const response =
      await this.submissionRepository.createSubmission(submission);

    const payload = {
      submissionId: response._id.toString(),
      problem,
      code: submission.code!,
      language: submission.language!,
    };

    const jobId = await addSubmissionJob(payload);

    logger.info("Submission queued", {
      submissionId: response._id,
      jobId,
    });

    return response;
  }

  async getByProblemId(problemId: string): Promise<ISubmission[]> {
    if (!problemId) throw new BadRequestError("Problem ID is required");

    return await this.submissionRepository.getByProblemId(problemId);
  }

  async getSubmissionById(id: string): Promise<ISubmission | null> {
    if (!id) throw new BadRequestError("Submission ID is required");

    const submission = await this.submissionRepository.getSubmissionById(id);

    if (!submission) {
      throw new NotFoundError("Submission not found");
    }

    return submission;
  }

  async getAllSubmissions(page: number, limit: number) {
    return await this.submissionRepository.getAllSubmissions(page, limit);
  }

  async updateSubmission(
    submissionId: string,
    submission: Partial<ISubmission>,
  ): Promise<ISubmission | null> {
    if (!submissionId) throw new BadRequestError("Submission ID is required");

    const updated = await this.submissionRepository.updateSubmission(
      submissionId,
      submission,
    );

    if (!updated) {
      throw new NotFoundError("Submission not found");
    }

    return updated;
  }

  async deleteSubmission(submissionId: string): Promise<boolean> {
    if (!submissionId) throw new BadRequestError("Submission ID is required");

    const deleted =
      await this.submissionRepository.deleteSubmission(submissionId);

    if (!deleted) {
      throw new NotFoundError("Submission not found or already deleted");
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
