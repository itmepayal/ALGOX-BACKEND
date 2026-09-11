import { IProblem } from "../models/problem.model";
import { IProblemRepository } from "../repositories/problem.repository";
import { BadRequestError, NotFoundError } from "../utils/errors/app.error";
import { sanitizeMarkdown } from "../utils/markdown/markdown.sanitizer";
import {
  CreateProblemDto,
  UpdateProblemDto,
  ProblemQueryDto,
} from "../validators/problem.validator";

export interface IProblemService {
  createProblem(data: CreateProblemDto): Promise<IProblem>;

  updateProblem(
    problemId: string,
    data: UpdateProblemDto
  ): Promise<IProblem | null>;

  deleteProblem(problemId: string): Promise<boolean>;

  getProblemById(problemId: string, isPublicView?: boolean): Promise<IProblem | null>;

  getProblemBySlug(slug: string, isPublicView?: boolean): Promise<IProblem | null>;

  getProblems(query: ProblemQueryDto, isPublicView?: boolean): Promise<{
    problems: IProblem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;

  findByDifficulty(difficulty: "easy" | "medium" | "hard"): Promise<IProblem[]>;
  searchProblems(query: string): Promise<IProblem[]>;
}

export class ProblemService implements IProblemService {
  constructor(private problemRepository: IProblemRepository) {}

  async createProblem(problem: CreateProblemDto): Promise<IProblem> {
    const payload = {
      ...problem,
      description: await sanitizeMarkdown(problem.description),
      editorial:
        problem.editorial ? await sanitizeMarkdown(problem.editorial) : undefined,
    };
    return this.problemRepository.createProblem(payload);
  }

  async updateProblem(
    problemId: string,
    problem: UpdateProblemDto
  ): Promise<IProblem | null> {
    const existing = await this.problemRepository.getProblemById(problemId);

    if (!existing) {
      throw new NotFoundError("Problem Not Found");
    }

    const payload: Partial<IProblem> = {
      ...problem,
    };

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

  async getProblemById(problemId: string, isPublicView: boolean = true): Promise<IProblem | null> {
    const problem = await this.problemRepository.getProblemById(problemId);

    if (!problem) {
      throw new NotFoundError("Problem Not Found");
    }

    return isPublicView ? filterPublicProblem(problem) : problem;
  }

  async getProblemBySlug(slug: string, isPublicView: boolean = true): Promise<IProblem | null> {
    const problem = await this.problemRepository.getProblemBySlug(slug);

    if (!problem) {
      throw new NotFoundError("Problem Not Found");
    }

    return isPublicView ? filterPublicProblem(problem) : problem;
  }

  async getProblems(query: ProblemQueryDto, isPublicView: boolean = true) {
    const result = await this.problemRepository.getProblems(query);
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
    const problems = await this.problemRepository.searchProblems(query);
    return problems.map((p) => filterPublicProblem(p));
  }
}

function filterPublicProblem(problem: IProblem): IProblem {
  const pObj = problem.toObject ? problem.toObject() : { ...problem };
  if (pObj.testcases) {
    const all = pObj.testcases as any[];
    // Counts let the UI show pending hidden slots without leaking content
    (pObj as any).publicTestcaseCount = all.filter((tc) => !tc.isHidden).length;
    (pObj as any).hiddenTestcaseCount = all.filter((tc) => Boolean(tc.isHidden)).length;
    (pObj as any).totalTestcaseCount = all.length;
    pObj.testcases = all.filter((tc) => !tc.isHidden);
  } else {
    (pObj as any).publicTestcaseCount = 0;
    (pObj as any).hiddenTestcaseCount = 0;
    (pObj as any).totalTestcaseCount = 0;
  }
  // Engagement counters (denormalized on problem docs)
  (pObj as any).likeCount = Math.max(0, Number((pObj as any).likeCount) || 0);
  (pObj as any).dislikeCount = Math.max(0, Number((pObj as any).dislikeCount) || 0);
  (pObj as any).bookmarkCount = Math.max(0, Number((pObj as any).bookmarkCount) || 0);
  return pObj as IProblem;
}
