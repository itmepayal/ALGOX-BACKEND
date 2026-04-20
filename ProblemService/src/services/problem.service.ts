import { IProblem } from "../models/problem.model";
import { IProblemRepository } from "../repositories/problem.repository";
import { BadRequestError, NotFoundError } from "../utils/errors/app.error";
import { sanitizeMarkdown } from "../utils/markdown/markdown.sanitizer";
import {
  CreateProblemDto,
  UpdateProblemDto,
} from "../validators/problem.validator";

export interface IProblemService {
  createProblem(data: CreateProblemDto): Promise<IProblem>;

  updateProblem(
    problemId: string,
    data: UpdateProblemDto,
  ): Promise<IProblem | null>;

  deleteProblem(problemId: string): Promise<boolean>;

  getProblemById(problemId: string): Promise<IProblem | null>;

  getAllProblems(): Promise<{
    problems: IProblem[];
    total: number;
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
        problem.editorial && (await sanitizeMarkdown(problem?.editorial)),
    };
    return this.problemRepository.createProblem(payload);
  }

  async updateProblem(
    problemId: string,
    problem: UpdateProblemDto,
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

  async getProblemById(problemId: string): Promise<IProblem | null> {
    const problem = await this.problemRepository.getProblemById(problemId);

    if (!problem) {
      throw new NotFoundError("Problem Not Found");
    }

    return problem;
  }

  async getAllProblems(): Promise<{
    problems: IProblem[];
    total: number;
  }> {
    return this.problemRepository.getAllProblems();
  }

  async findByDifficulty(
    difficulty: "easy" | "medium" | "hard",
  ): Promise<IProblem[]> {
    return await this.problemRepository.findByDifficulty(difficulty);
  }

  async searchProblems(query: string): Promise<IProblem[]> {
    if (!query || query.trim() === "") {
      throw new BadRequestError("Query Not Found");
    }
    return await this.problemRepository.searchProblems(query);
  }
}
