import { Types } from "mongoose";
import { getProblemById, assertContestAllowsSubmission } from "../apis/problem.api";
import logger from "../config/logger.config";
import { ISubmission, SubmissionStatus } from "../models/submission.model";
import { addSubmissionJob } from "../producers/submission.producer";
import { ISubmissionRepository } from "../repositories/submission.repository";
import { BadRequestError, NotFoundError } from "../utils/errors/app.error";
import { SUBMISSION_MESSAGES } from "../utils/constants";
import { CreateSubmissionDto } from "../validators/submission.validator";
import { scheduleSuspiciousAnalysis } from "./suspiciousHeuristic.service";
import { emitRealtimeEvent } from "../utils/helpers/realtimeEmit";
import { enforceSubmissionLimits } from "../utils/platformLimits";

const TERMINAL_STATUSES: SubmissionStatus[] = [
  "ACCEPTED",
  "WRONG_ANSWER",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "RUNTIME_ERROR",
  "COMPILATION_ERROR",
];

export interface ISubmissionService {
  createSubmission(
    submission: CreateSubmissionDto,
    options?: { role?: string; isEmailVerified?: boolean }
  ): Promise<ISubmission>;
  getByProblemId(problemId: string): Promise<ISubmission[]>;
  getByUserId(userId: string): Promise<ISubmission[]>;
  getImportSourceByUserId(userId: string): Promise<
    Array<{
      problemId: string;
      status: string;
      source?: string;
      executionTime?: number;
      memory?: number;
      createdAt: Date;
      updatedAt: Date;
    }>
  >;
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
  adminList(filters: {
    page?: number;
    limit?: number;
    status?: string;
    statuses?: string;
    language?: string;
    problemId?: string;
    userId?: string;
    from?: string;
    to?: string;
    source?: string;
    search?: string;
  }): Promise<{
    submissions: ISubmission[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  internalStats(rangeDays?: number): Promise<Record<string, unknown>>;
  problemStats(problemId: string, rangeDays?: number): Promise<Record<string, unknown>>;
}

export class SubmissionService implements ISubmissionService {
  constructor(private submissionRepository: ISubmissionRepository) { }

  async createSubmission(
    dto: CreateSubmissionDto,
    options?: { role?: string; isEmailVerified?: boolean }
  ): Promise<ISubmission> {
    if (!dto.problemId || !dto.code || !dto.language) {
      throw new BadRequestError(SUBMISSION_MESSAGES.MISSING_REQUIRED_FIELDS);
    }

    const problemId = dto.problemId.toString();
    const source = dto.source === "run" ? "run" : "submit";

    if (!dto.userId) {
      throw new BadRequestError(SUBMISSION_MESSAGES.MISSING_REQUIRED_FIELDS);
    }

    const concurrentActive =
      source === "submit"
        ? await this.submissionRepository.countActiveByUser(dto.userId)
        : 0;
    const hourlyCount = await this.submissionRepository.countInLastHourByUser(
      dto.userId,
      source
    );

    await enforceSubmissionLimits({
      userId: dto.userId,
      code: dto.code,
      source,
      role: options?.role,
      concurrentActive,
      hourlyCount,
      isEmailVerified: options?.isEmailVerified,
    });

    if (dto.contestId) {
      await assertContestAllowsSubmission(dto.contestId);
    }

    const problem = await getProblemById(problemId);

    if (!problem) {
      throw new NotFoundError("Problem not found in ProblemService");
    }

    // ── RUN ATTEMPT: persist progress only, never queue full judge ──
    if (source === "run") {
      const allowed: SubmissionStatus[] = [
        "ACCEPTED",
        "WRONG_ANSWER",
        "TIME_LIMIT_EXCEEDED",
        "MEMORY_LIMIT_EXCEEDED",
        "RUNTIME_ERROR",
        "COMPILATION_ERROR",
      ];
      const status: SubmissionStatus =
        dto.status && allowed.includes(dto.status as SubmissionStatus)
          ? (dto.status as SubmissionStatus)
          : "RUNTIME_ERROR";

      const runDoc: Partial<ISubmission> = {
        problemId: new Types.ObjectId(dto.problemId),
        ...(dto.userId && { userId: new Types.ObjectId(dto.userId) }),
        ...(dto.contestId && { contestId: new Types.ObjectId(dto.contestId) }),
        language: dto.language,
        code: dto.code,
        source: "run",
        status,
        output: dto.output,
        error: dto.error,
        executionTime: dto.executionTime,
        memory: dto.memory,
        testCasesPassed: dto.testCasesPassed ?? 0,
        totalTestCases: dto.totalTestCases,
      };

      logger.info("RUN ATTEMPT persisted", {
        problemId,
        status,
        userId: dto.userId,
      });

      const runSaved = await this.submissionRepository.createSubmission(runDoc);
      // Heuristic flag only — never auto-ban
      scheduleSuspiciousAnalysis(runSaved);
      emitRealtimeEvent({
        event: "submission.created",
        userId: dto.userId,
        status: status,
        payload: {
          submissionId: String(runSaved._id),
          problemId,
          source: "run",
        },
      });
      return runSaved;
    }

    // ── SUBMIT: official judge via queue ──
    const submissionData: Partial<ISubmission> = {
      problemId: new Types.ObjectId(dto.problemId),
      ...(dto.userId && { userId: new Types.ObjectId(dto.userId) }),
      ...(dto.contestId && { contestId: new Types.ObjectId(dto.contestId) }),
      language: dto.language,
      code: dto.code,
      source: "submit",
      status: "PENDING",
    };

    logger.info("SUBMISSION REQUEST RECEIVED", { problemId, language: dto.language });

    const response = await this.submissionRepository.createSubmission(submissionData);

    logger.info("PROBLEM FOUND — submission created", {
      submissionId: response._id,
      problemId,
    });

    emitRealtimeEvent({
      event: "submission.created",
      userId: dto.userId,
      status: "PENDING",
      payload: {
        submissionId: String(response._id),
        problemId,
        source: "submit",
      },
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
      const failed = (await this.submissionRepository.getSubmissionById(
        response._id.toString()
      )) as ISubmission;
      scheduleSuspiciousAnalysis(failed);
      return failed;
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
      problem: {
        difficulty: (problem as any).difficulty,
        tags: (problem as any).tags || [],
        functionName: (problem as any).functionName,
        className: (problem as any).className,
        returnType: (problem as any).returnType,
        parameters: (problem as any).parameters,
      },
      code: dto.code,
      language: dto.language,
      testcases,
      mode: "submit" as const,
      timeLimitMs: (problem as any).timeLimitMs || 2000,
      memoryLimitMb: (problem as any).memoryLimitMb || 256,
      userId: dto.userId,
      functionName: (problem as any).functionName,
      className: (problem as any).className,
      returnType: (problem as any).returnType,
      parameters: (problem as any).parameters,
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
      const failedQueue = (await this.submissionRepository.getSubmissionById(
        response._id.toString()
      )) as ISubmission;
      scheduleSuspiciousAnalysis(failedQueue);
      return failedQueue;
    }

    logger.info("RESPONSE SENT — returning PENDING submission", {
      submissionId: response._id,
    });
    const pending =
      withTotals ||
      ((await this.submissionRepository.getSubmissionById(
        response._id.toString()
      )) as ISubmission);
    emitRealtimeEvent({
      event: "submission.queued",
      userId: dto.userId,
      status: "PENDING",
      payload: { submissionId: String(response._id), problemId },
    });
    // Frequency / identical-hash signals apply as soon as the row is saved
    scheduleSuspiciousAnalysis(pending);
    return pending;
  }

  async getByProblemId(problemId: string): Promise<ISubmission[]> {
    if (!problemId) throw new BadRequestError("Problem ID is required");
    return await this.submissionRepository.getByProblemId(problemId);
  }

  async getByUserId(userId: string): Promise<ISubmission[]> {
    if (!userId) throw new BadRequestError("User ID is required");
    return await this.submissionRepository.getByUserId(userId);
  }

  async getImportSourceByUserId(userId: string) {
    if (!userId) throw new BadRequestError("User ID is required");
    return await this.submissionRepository.getImportSourceByUserId(userId);
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

    // Re-analyze on terminal verdicts (acceptance-rate spike needs final status)
    if (updated.status && TERMINAL_STATUSES.includes(updated.status)) {
      scheduleSuspiciousAnalysis(updated);
      const accepted = updated.status === "ACCEPTED";
      emitRealtimeEvent({
        event: accepted ? "submission.accepted" : "submission.completed",
        userId: updated.userId?.toString(),
        status: updated.status,
        payload: {
          submissionId: String(updated._id),
          problemId: updated.problemId?.toString(),
        },
      });
      if (!accepted) {
        emitRealtimeEvent({
          event: "submission.failed",
          userId: updated.userId?.toString(),
          status: updated.status,
          payload: { submissionId: String(updated._id) },
        });
      }
    } else if (updated.status === "RUNNING") {
      emitRealtimeEvent({
        event: "submission.running",
        userId: updated.userId?.toString(),
        status: "RUNNING",
        payload: { submissionId: String(updated._id) },
      });
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

  async adminList(filters: {
    page?: number;
    limit?: number;
    status?: string;
    statuses?: string;
    language?: string;
    problemId?: string;
    userId?: string;
    from?: string;
    to?: string;
    source?: string;
    search?: string;
  }) {
    return this.submissionRepository.adminList(filters);
  }

  async internalStats(rangeDays = 30) {
    return this.submissionRepository.internalStats(rangeDays);
  }

  async problemStats(problemId: string, rangeDays = 30) {
    if (!problemId) throw new BadRequestError("problemId is required");
    return this.submissionRepository.problemStats(problemId, rangeDays);
  }
}
