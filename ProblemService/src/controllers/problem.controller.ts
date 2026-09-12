import { Response, NextFunction } from "express";
import { IProblemService } from "../services/problem.service";
import {
  createProblemSchema,
  updateProblemSchema,
  problemQuerySchema,
  problemStatusSchema,
  bulkProblemSchema,
} from "../validators/problem.validator";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS, PROBLEM_MESSAGES } from "../utils/constants";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";

export class ProblemController {
  constructor(private problemService: IProblemService) {}

  async createProblem(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = createProblemSchema.parse(req.body);
      const problem = await this.problemService.createProblem(validated, {
        userId: req.user!.userId,
      });

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

  async getProblemById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
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

  async getAdminProblemById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
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

  async getProblemBySlug(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
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

  async getInternalProblemById(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
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

  async getProblems(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
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

  async getAdminProblems(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const query = problemQuerySchema.parse(req.query);
      const result = await this.problemService.getProblems(query, false);

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

  async updateProblem(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const validated = updateProblemSchema.parse(req.body);
      const updated = await this.problemService.updateProblem(id, validated, {
        userId: req.user!.userId,
      });

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

  async deleteProblem(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
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

  async setStatus(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const body = problemStatusSchema.parse(req.body);
      const updated = await this.problemService.setStatus(id, body.status, {
        userId: req.user!.userId,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Problem status updated",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async duplicateProblem(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const copy = await this.problemService.duplicateProblem(id, {
        userId: req.user!.userId,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: "Problem duplicated",
        data: copy,
      });
    } catch (error) {
      next(error);
    }
  }

  async bulkUpdate(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const body = bulkProblemSchema.parse(req.body);
      const result = await this.problemService.bulkUpdate(body, {
        userId: req.user!.userId,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Bulk update applied",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async internalStats(
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const data = await this.problemService.internalStats();
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Internal problem stats",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async findByDifficulty(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
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

  async searchProblems(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
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
