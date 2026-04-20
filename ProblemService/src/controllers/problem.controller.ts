import { Request, Response, NextFunction } from "express";
import { IProblemService } from "../services/problem.service";
import {
  createProblemSchema,
  updateProblemSchema,
} from "../validators/problem.validator";

export interface IProblemController {
  createProblem(req: Request, res: Response, next: NextFunction): Promise<void>;
  getProblemById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void>;
  getAllProblems(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void>;
  updateProblem(req: Request, res: Response, next: NextFunction): Promise<void>;
  deleteProblem(req: Request, res: Response, next: NextFunction): Promise<void>;
  searchProblems(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void>;
}

export class ProblemController implements IProblemController {
  constructor(private problemService: IProblemService) {}

  async createProblem(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      console.log("Wecloem ");
      const validated = createProblemSchema.parse(req.body);
      const problem = await this.problemService.createProblem(validated);

      res.status(201).json({
        success: true,
        message: "Problem created successfully",
        data: problem,
      });
    } catch (error) {
      next(error);
    }
  }

  async getProblemById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;

      const problem = await this.problemService.getProblemById(id);

      res.status(200).json({
        success: true,
        message: "Problem retrieved successfully",
        data: problem,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllProblems(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await this.problemService.getAllProblems();

      res.status(200).json({
        success: true,
        message: `${result.total} problems retrieved successfully`,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProblem(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const validated = updateProblemSchema.parse(req.body);

      const updated = await this.problemService.updateProblem(id, validated);

      res.status(200).json({
        success: true,
        message: "Problem updated successfully",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteProblem(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;

      await this.problemService.deleteProblem(id);

      res.status(200).json({
        success: true,
        message: "Problem deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async findByDifficulty(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const difficulty = req.params.difficulty as "easy" | "medium" | "hard";

      const problems = await this.problemService.findByDifficulty(difficulty);

      res.status(200).json({
        success: true,
        message: `Problems with difficulty '${difficulty}' retrieved successfully`,
        data: problems,
      });
    } catch (error) {
      next(error);
    }
  }

  async searchProblems(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { q } = req.query;

      const problems = await this.problemService.searchProblems(String(q));

      res.status(200).json({
        success: true,
        message: "Search results retrieved successfully",
        data: problems,
      });
    } catch (error) {
      next(error);
    }
  }
}
