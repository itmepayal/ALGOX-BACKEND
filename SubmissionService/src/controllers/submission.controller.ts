import { Request, Response, NextFunction } from "express";
import { ISubmissionService } from "../services/submission.service";
import { SubmissionStatus } from "../models/submission.model";

export interface ISubmissionController {
  createSubmission(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void>;

  getSubmissionById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void>;

  getAllSubmissions(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void>;

  updateSubmission(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void>;

  deleteSubmission(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void>;

  getByProblemId(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void>;

  getByStatus(req: Request, res: Response, next: NextFunction): Promise<void>;

  getByLanguage(req: Request, res: Response, next: NextFunction): Promise<void>;

  searchSubmissions(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void>;
}

export class SubmissionController implements ISubmissionController {
  constructor(private submissionService: ISubmissionService) {}

  async createSubmission(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const submission = await this.submissionService.createSubmission(
        req.body,
      );

      res.status(201).json({
        success: true,
        message: "Submission created and queued successfully",
        data: submission,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSubmissionById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;

      const submission = await this.submissionService.getSubmissionById(id);

      res.status(200).json({
        success: true,
        message: "Submission retrieved successfully",
        data: submission,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllSubmissions(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;

      const result = await this.submissionService.getAllSubmissions(
        page,
        limit,
      );

      res.status(200).json({
        success: true,
        message: `${result.total} submissions retrieved successfully`,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateSubmission(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;

      const updated = await this.submissionService.updateSubmission(
        id,
        req.body,
      );

      res.status(200).json({
        success: true,
        message: "Submission updated successfully",
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteSubmission(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;

      await this.submissionService.deleteSubmission(id);

      res.status(200).json({
        success: true,
        message: "Submission deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getByProblemId(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { problemId } = req.params;

      const submissions =
        await this.submissionService.getByProblemId(problemId);

      res.status(200).json({
        success: true,
        message: "Submissions retrieved successfully",
        data: submissions,
      });
    } catch (error) {
      next(error);
    }
  }

  async getByStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const status = req.params.status as SubmissionStatus;

      const submissions = await this.submissionService.getByStatus(status);

      res.status(200).json({
        success: true,
        message: `Submissions with status '${status}' retrieved successfully`,
        data: submissions,
      });
    } catch (error) {
      next(error);
    }
  }

  async getByLanguage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { language } = req.params;

      const submissions = await this.submissionService.getByLanguage(language);

      res.status(200).json({
        success: true,
        message: `Submissions in '${language}' retrieved successfully`,
        data: submissions,
      });
    } catch (error) {
      next(error);
    }
  }

  async searchSubmissions(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { q } = req.query;

      const submissions = await this.submissionService.searchSubmissions(
        String(q),
      );

      res.status(200).json({
        success: true,
        message: "Search results retrieved successfully",
        data: submissions,
      });
    } catch (error) {
      next(error);
    }
  }
}
