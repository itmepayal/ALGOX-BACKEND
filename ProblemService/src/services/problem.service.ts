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
import {
  filterPublicProblem,
  PremiumRequiredError,
  type PublicProblemViewOpts,
} from "../utils/problemAccess";
import type { EntitlementSnapshot } from "../utils/entitlementClient";
import { hasFeature } from "../utils/entitlementClient";
import {
  getFreeSheetProblemIdSet,
  isProblemOnFreeSheet,
} from "../utils/sheetFreeAccess";

export type PublicViewContext = {
  entitlements: EntitlementSnapshot;
};

async function toPublicOpts(
  publicCtx?: PublicViewContext
): Promise<PublicProblemViewOpts> {
  const freeSheetProblemIds = await getFreeSheetProblemIdSet();
  return {
    entitlements: publicCtx?.entitlements || {
      accessTier: "GUEST",
      features: new Set<string>(),
    },
    freeSheetProblemIds,
  };
}

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
    isPublicView?: boolean,
    publicCtx?: PublicViewContext
  ): Promise<IProblem | Record<string, unknown> | null>;

  getProblemBySlug(
    slug: string,
    isPublicView?: boolean,
    publicCtx?: PublicViewContext
  ): Promise<IProblem | Record<string, unknown> | null>;

  getProblems(
    query: ProblemQueryDto,
    isPublicView?: boolean,
    publicCtx?: PublicViewContext
  ): Promise<{
    problems: Array<IProblem | Record<string, unknown>>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;

  findByDifficulty(
    difficulty: "easy" | "medium" | "hard",
    publicCtx?: PublicViewContext
  ): Promise<Array<IProblem | Record<string, unknown>>>;
  searchProblems(
    query: string,
    publicCtx?: PublicViewContext
  ): Promise<Array<IProblem | Record<string, unknown>>>;
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
  internalStats(opts?: { status?: string }): Promise<Record<string, unknown>>;
  findTitlesByIds(
    ids: string[]
  ): Promise<
    Array<{ id: string; title: string; difficulty?: string; slug?: string }>
  >;
  assertSolveAccess(
    problemId: string,
    entitlements: EntitlementSnapshot
  ): Promise<{ allowed: true; isSheetFree: boolean; isPremium: boolean }>;
}

export class ProblemService implements IProblemService {
  constructor(private problemRepository: IProblemRepository) {}

  /**
   * Hard gate for run/submit — FREE sheet problems allowed; else premium.problems.
   */
  async assertSolveAccess(
    problemId: string,
    entitlements: EntitlementSnapshot
  ): Promise<{ allowed: true; isSheetFree: boolean; isPremium: boolean }> {
    const problem = await this.problemRepository.getProblemById(problemId);
    if (!problem) throw new NotFoundError("Problem Not Found");
    if ((problem as any).status && (problem as any).status !== "published") {
      throw new NotFoundError("Problem Not Found");
    }

    const isSheetFree = await isProblemOnFreeSheet(String(problemId));
    const isPremium = !isSheetFree;
    if (isPremium && !hasFeature(entitlements, "premium.problems")) {
      throw new PremiumRequiredError(
        "Solving this problem requires an active premium subscription.",
        { accessTier: entitlements.accessTier, isSheetFree: false }
      );
    }
    return { allowed: true, isSheetFree, isPremium };
  }

  async createProblem(
    problem: CreateProblemDto,
    actor?: { userId: string }
  ): Promise<IProblem> {
    const status = (problem.status as ProblemStatus) || "draft";
    const payload: any = {
      ...problem,
      status,
      isPremium:
        problem.isPremium !== undefined ? Boolean(problem.isPremium) : true,
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

    if (problem.isPremium !== undefined) {
      payload.isPremium = Boolean(problem.isPremium);
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
    isPublicView: boolean = true,
    publicCtx?: PublicViewContext
  ): Promise<IProblem | Record<string, unknown> | null> {
    const problem = await this.problemRepository.getProblemById(problemId);

    if (!problem) {
      throw new NotFoundError("Problem Not Found");
    }

    if (isPublicView && (problem as any).status && (problem as any).status !== "published") {
      throw new NotFoundError("Problem Not Found");
    }

    return isPublicView
      ? filterPublicProblem(problem, await toPublicOpts(publicCtx))
      : problem;
  }

  async getProblemBySlug(
    slug: string,
    isPublicView: boolean = true,
    publicCtx?: PublicViewContext
  ): Promise<IProblem | Record<string, unknown> | null> {
    const problem = await this.problemRepository.getProblemBySlug(slug);

    if (!problem) {
      throw new NotFoundError("Problem Not Found");
    }

    if (isPublicView && (problem as any).status && (problem as any).status !== "published") {
      throw new NotFoundError("Problem Not Found");
    }

    return isPublicView
      ? filterPublicProblem(problem, await toPublicOpts(publicCtx))
      : problem;
  }

  async getProblems(
    query: ProblemQueryDto,
    isPublicView: boolean = true,
    publicCtx?: PublicViewContext
  ) {
    const result = await this.problemRepository.getProblems(query, {
      publicOnly: isPublicView,
    });
    if (isPublicView) {
      const opts = await toPublicOpts(publicCtx);
      result.problems = result.problems.map((p) =>
        filterPublicProblem(p, opts)
      ) as any;
    }
    return result;
  }

  async findByDifficulty(
    difficulty: "easy" | "medium" | "hard",
    publicCtx?: PublicViewContext
  ): Promise<Array<IProblem | Record<string, unknown>>> {
    const problems = await this.problemRepository.findByDifficulty(difficulty);
    const opts = await toPublicOpts(publicCtx);
    return problems.map((p) => filterPublicProblem(p, opts));
  }

  async searchProblems(
    query: string,
    publicCtx?: PublicViewContext
  ): Promise<Array<IProblem | Record<string, unknown>>> {
    if (!query || query.trim() === "") {
      throw new BadRequestError("Query parameter is required");
    }
    const problems = await this.problemRepository.searchProblems(query, true);
    const opts = await toPublicOpts(publicCtx);
    return problems.map((p) => filterPublicProblem(p, opts));
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
    } else if (data.action === "premium") {
      if (typeof data.isPremium !== "boolean") {
        throw new BadRequestError("isPremium boolean is required");
      }
      update.isPremium = data.isPremium;
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

  async internalStats(opts?: { status?: string }) {
    return this.problemRepository.internalStats(opts);
  }

  async findTitlesByIds(ids: string[]) {
    return this.problemRepository.findTitlesByIds(ids);
  }
}
