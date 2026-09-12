import { IProblem, ProblemStatus } from "../models/problem.model";
import { IProblemRepository } from "../repositories/problem.repository";
import { BadRequestError, NotFoundError } from "../utils/errors/app.error";
import { sanitizeMarkdown } from "../utils/markdown/markdown.sanitizer";
import {
  CreateProblemDto,
  UpdateProblemDto,
  ProblemQueryDto,
  BulkProblemDto,
} from "../validators/problem.validator";

export interface IProblemService {
  createProblem(
    data: CreateProblemDto,
    actor?: { userId: string }
  ): Promise<IProblem>;

  updateProblem(
    problemId: string,
    data: UpdateProblemDto,
    actor?: { userId: string }
  ): Promise<IProblem | null>;

  deleteProblem(problemId: string): Promise<boolean>;

  getProblemById(
    problemId: string,
    isPublicView?: boolean
  ): Promise<IProblem | null>;

  getProblemBySlug(
    slug: string,
    isPublicView?: boolean
  ): Promise<IProblem | null>;

  getProblems(
    query: ProblemQueryDto,
    isPublicView?: boolean
  ): Promise<{
    problems: IProblem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;

  findByDifficulty(difficulty: "easy" | "medium" | "hard"): Promise<IProblem[]>;
  searchProblems(query: string): Promise<IProblem[]>;
  setStatus(
    problemId: string,
    status: ProblemStatus,
    actor?: { userId: string }
  ): Promise<IProblem | null>;
  duplicateProblem(
    problemId: string,
    actor?: { userId: string }
  ): Promise<IProblem>;
  bulkUpdate(data: BulkProblemDto, actor?: { userId: string }): Promise<{ modified: number }>;
  internalStats(): Promise<Record<string, unknown>>;
}

export class ProblemService implements IProblemService {
  constructor(private problemRepository: IProblemRepository) {}

  async createProblem(
    problem: CreateProblemDto,
    actor?: { userId: string }
  ): Promise<IProblem> {
    const status = (problem.status as ProblemStatus) || "draft";
    const payload: any = {
      ...problem,
      status,
      description: await sanitizeMarkdown(problem.description),
      editorial: problem.editorial
        ? await sanitizeMarkdown(problem.editorial)
        : undefined,
      createdBy: actor?.userId,
      updatedBy: actor?.userId,
    };
    if (status === "published") {
      payload.publishedAt = new Date();
    }
    return this.problemRepository.createProblem(payload);
  }

  async updateProblem(
    problemId: string,
    problem: UpdateProblemDto,
    actor?: { userId: string }
  ): Promise<IProblem | null> {
    const existing = await this.problemRepository.getProblemById(problemId);

    if (!existing) {
      throw new NotFoundError("Problem Not Found");
    }

    const payload: Partial<IProblem> = {
      ...problem,
      updatedBy: actor?.userId,
    } as any;

    // Status changes go through setStatus / publish permission
    if ("status" in payload) {
      delete (payload as any).status;
    }

    if (problem.description) {
      payload.description = await sanitizeMarkdown(problem.description);
    }

    if (problem.editorial) {
      payload.editorial = await sanitizeMarkdown(problem.editorial);
    }

    return this.problemRepository.updateProblem(problemId, payload);
  }

  async deleteProblem(problemId: string): Promise<boolean> {
    const existing = await this.problemRepository.getProblemById(problemId);

    if (!existing) {
      throw new NotFoundError("Problem Not Found");
    }

    return this.problemRepository.deleteProblem(problemId);
  }

  async getProblemById(
    problemId: string,
    isPublicView: boolean = true
  ): Promise<IProblem | null> {
    const problem = await this.problemRepository.getProblemById(problemId);

    if (!problem) {
      throw new NotFoundError("Problem Not Found");
    }

    if (isPublicView && (problem as any).status && (problem as any).status !== "published") {
      throw new NotFoundError("Problem Not Found");
    }

    return isPublicView ? filterPublicProblem(problem) : problem;
  }

  async getProblemBySlug(
    slug: string,
    isPublicView: boolean = true
  ): Promise<IProblem | null> {
    const problem = await this.problemRepository.getProblemBySlug(slug);

    if (!problem) {
      throw new NotFoundError("Problem Not Found");
    }

    if (isPublicView && (problem as any).status && (problem as any).status !== "published") {
      throw new NotFoundError("Problem Not Found");
    }

    return isPublicView ? filterPublicProblem(problem) : problem;
  }

  async getProblems(query: ProblemQueryDto, isPublicView: boolean = true) {
    const result = await this.problemRepository.getProblems(query, {
      publicOnly: isPublicView,
    });
    if (isPublicView) {
      result.problems = result.problems.map((p) => filterPublicProblem(p));
    }
    return result;
  }

  async findByDifficulty(
    difficulty: "easy" | "medium" | "hard"
  ): Promise<IProblem[]> {
    const problems = await this.problemRepository.findByDifficulty(difficulty);
    return problems.map((p) => filterPublicProblem(p));
  }

  async searchProblems(query: string): Promise<IProblem[]> {
    if (!query || query.trim() === "") {
      throw new BadRequestError("Query parameter is required");
    }
    const problems = await this.problemRepository.searchProblems(query, true);
    return problems.map((p) => filterPublicProblem(p));
  }

  async setStatus(
    problemId: string,
    status: ProblemStatus,
    actor?: { userId: string }
  ): Promise<IProblem | null> {
    const existing = await this.problemRepository.getProblemById(problemId);
    if (!existing) throw new NotFoundError("Problem Not Found");
    return this.problemRepository.updateStatus(
      problemId,
      status,
      actor?.userId
    );
  }

  async duplicateProblem(
    problemId: string,
    actor?: { userId: string }
  ): Promise<IProblem> {
    const copy = await this.problemRepository.duplicateProblem(
      problemId,
      actor?.userId
    );
    if (!copy) throw new NotFoundError("Problem Not Found");
    return copy;
  }

  async bulkUpdate(
    data: BulkProblemDto,
    actor?: { userId: string }
  ): Promise<{ modified: number }> {
    let update: any = { updatedBy: actor?.userId };
    if (data.action === "status") {
      if (!data.status) throw new BadRequestError("status is required");
      update.status = data.status;
      if (data.status === "published") update.publishedAt = new Date();
    } else if (data.action === "difficulty") {
      if (!data.difficulty) throw new BadRequestError("difficulty is required");
      update.difficulty = data.difficulty;
    } else if (data.action === "tags") {
      if (!data.tags?.length) throw new BadRequestError("tags are required");
      if (data.tagMode === "replace") {
        update.tags = data.tags;
      } else {
        update = {
          $addToSet: { tags: { $each: data.tags } },
          $set: { updatedBy: actor?.userId },
        };
      }
    }
    const modified = await this.problemRepository.bulkUpdate(data.ids, update);
    return { modified };
  }

  async internalStats() {
    return this.problemRepository.internalStats();
  }
}

function filterPublicProblem(problem: IProblem): IProblem {
  const pObj = problem.toObject ? problem.toObject() : { ...problem };
  if (pObj.testcases) {
    const all = pObj.testcases as any[];
    (pObj as any).publicTestcaseCount = all.filter((tc) => !tc.isHidden).length;
    (pObj as any).hiddenTestcaseCount = all.filter((tc) =>
      Boolean(tc.isHidden)
    ).length;
    (pObj as any).totalTestcaseCount = all.length;
    pObj.testcases = all.filter((tc) => !tc.isHidden);
  } else {
    (pObj as any).publicTestcaseCount = 0;
    (pObj as any).hiddenTestcaseCount = 0;
    (pObj as any).totalTestcaseCount = 0;
  }
  (pObj as any).likeCount = Math.max(0, Number((pObj as any).likeCount) || 0);
  (pObj as any).dislikeCount = Math.max(
    0,
    Number((pObj as any).dislikeCount) || 0
  );
  (pObj as any).bookmarkCount = Math.max(
    0,
    Number((pObj as any).bookmarkCount) || 0
  );
  return pObj as IProblem;
}
