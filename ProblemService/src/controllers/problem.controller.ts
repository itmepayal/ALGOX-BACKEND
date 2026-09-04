import { Request, Response, NextFunction } from "express";
import { IProblemService } from "../services/problem.service";
import {
  createProblemSchema,
  updateProblemSchema,
  problemQuerySchema,
} from "../validators/problem.validator";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS, PROBLEM_MESSAGES } from "../utils/constants";

export interface IProblemController {
  createProblem(req: Request, res: Response, next: NextFunction): Promise<void>;
  getProblemById(req: Request, res: Response, next: NextFunction): Promise<void>;
  getProblemBySlug(req: Request, res: Response, next: NextFunction): Promise<void>;
  getInternalProblemById(req: Request, res: Response, next: NextFunction): Promise<void>;
  getProblems(req: Request, res: Response, next: NextFunction): Promise<void>;
  updateProblem(req: Request, res: Response, next: NextFunction): Promise<void>;
  deleteProblem(req: Request, res: Response, next: NextFunction): Promise<void>;
  findByDifficulty(req: Request, res: Response, next: NextFunction): Promise<void>;
  searchProblems(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export class ProblemController implements IProblemController {
  constructor(private problemService: IProblemService) {}

  async createProblem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createProblemSchema.parse(req.body);
      const problem = await this.problemService.createProblem(validated);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: PROBLEM_MESSAGES.PROBLEM_CREATED,
        data: problem,
      });
    } catch (error) {
      next(error);
    }
  }

  async getProblemById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const problem = await this.problemService.getProblemById(id, true);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: PROBLEM_MESSAGES.PROBLEM_RETRIEVED,
        data: problem,
      });
    } catch (error) {
      next(error);
    }
  }

  async getProblemBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug } = req.params;
      const problem = await this.problemService.getProblemBySlug(slug, true);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: PROBLEM_MESSAGES.PROBLEM_RETRIEVED,
        data: problem,
      });
    } catch (error) {
      next(error);
    }
  }

  async getInternalProblemById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const problem = await this.problemService.getProblemById(id, false);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: PROBLEM_MESSAGES.PROBLEM_RETRIEVED,
        data: problem,
      });
    } catch (error) {
      next(error);
    }
  }

  async getProblems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = problemQuerySchema.parse(req.query);
      const result = await this.problemService.getProblems(query, true);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: PROBLEM_MESSAGES.PROBLEMS_RETRIEVED,
        data: result.problems,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProblem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const validated = updateProblemSchema.parse(req.body);
      const updated = await this.problemService.updateProblem(id, validated);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: PROBLEM_MESSAGES.PROBLEM_UPDATED,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteProblem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await this.problemService.deleteProblem(id);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: PROBLEM_MESSAGES.PROBLEM_DELETED,
      });
    } catch (error) {
      next(error);
    }
  }

  async findByDifficulty(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const difficulty = req.params.difficulty as "easy" | "medium" | "hard";
      const problems = await this.problemService.findByDifficulty(difficulty);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: PROBLEM_MESSAGES.PROBLEMS_RETRIEVED,
        data: problems,
      });
    } catch (error) {
      next(error);
    }
  }

  async searchProblems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { q } = req.query;
      const problems = await this.problemService.searchProblems(String(q || ""));

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: PROBLEM_MESSAGES.PROBLEMS_RETRIEVED,
        data: problems,
      });
    } catch (error) {
      next(error);
    }
  }
}
