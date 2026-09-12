import { Request, Response, NextFunction } from "express";
import { ISubmissionService } from "../services/submission.service";
import { SubmissionStatus } from "../models/submission.model";
import {
  createSubmissionSchema,
  updateSubmissionSchema,
} from "../validators/submission.validator";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS, SUBMISSION_MESSAGES } from "../utils/constants";

export interface ISubmissionController {
  createSubmission(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void>;

  getSubmissionById(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void>;

  getAllSubmissions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void>;

  updateSubmission(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void>;

  deleteSubmission(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void>;

  getByProblemId(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void>;

  getByUserId(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void>;

  getImportSourceForMe(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void>;

  getByStatus(req: Request, res: Response, next: NextFunction): Promise<void>;

  getByLanguage(req: Request, res: Response, next: NextFunction): Promise<void>;

  searchSubmissions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void>;
}

export class SubmissionController implements ISubmissionController {
  constructor(private submissionService: ISubmissionService) { }

  async createSubmission(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = createSubmissionSchema.parse(req.body);
      const submission = await this.submissionService.createSubmission(validated);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message:
          validated.source === "run"
            ? "Run attempt recorded"
            : SUBMISSION_MESSAGES.SUBMISSION_CREATED,
        data: submission,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSubmissionById(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const submission = await this.submissionService.getSubmissionById(id);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: SUBMISSION_MESSAGES.SUBMISSION_RETRIEVED,
        data: submission,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllSubmissions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 10;

      const result = await this.submissionService.getAllSubmissions(
        page,
        limit
      );

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: SUBMISSION_MESSAGES.SUBMISSIONS_RETRIEVED,
        data: result.submissions,
        meta: {
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateSubmission(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const validated = updateSubmissionSchema.parse(req.body);

      const updated = await this.submissionService.updateSubmission(
        id,
        validated
      );

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: SUBMISSION_MESSAGES.SUBMISSION_UPDATED,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteSubmission(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      await this.submissionService.deleteSubmission(id);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: SUBMISSION_MESSAGES.SUBMISSION_DELETED,
      });
    } catch (error) {
      next(error);
    }
  }

  async getByProblemId(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { problemId } = req.params;
      const submissions = await this.submissionService.getByProblemId(problemId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: SUBMISSION_MESSAGES.SUBMISSIONS_RETRIEVED,
        data: submissions,
      });
    } catch (error) {
      next(error);
    }
  }

  async getByUserId(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId } = req.params;
      const submissions = await this.submissionService.getByUserId(userId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: SUBMISSION_MESSAGES.SUBMISSIONS_RETRIEVED,
        data: submissions,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticated lean feed for progress import.
   * Always scoped to JWT userId — never trusts body/params userId.
   */
  async getImportSourceForMe(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = (req as any).user?.userId as string | undefined;
      if (!userId) {
        res.status(401).json({ success: false, message: "Authentication required" });
        return;
      }
      const submissions =
        await this.submissionService.getImportSourceByUserId(userId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: SUBMISSION_MESSAGES.SUBMISSIONS_RETRIEVED,
        data: { submissions },
      });
    } catch (error) {
      next(error);
    }
  }

  async getByStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const status = req.params.status as SubmissionStatus;
      const submissions = await this.submissionService.getByStatus(status);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: SUBMISSION_MESSAGES.SUBMISSIONS_RETRIEVED,
        data: submissions,
      });
    } catch (error) {
      next(error);
    }
  }

  async getByLanguage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { language } = req.params;
      const submissions = await this.submissionService.getByLanguage(language);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: SUBMISSION_MESSAGES.SUBMISSIONS_RETRIEVED,
        data: submissions,
      });
    } catch (error) {
      next(error);
    }
  }

  async searchSubmissions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { q } = req.query;
      const submissions = await this.submissionService.searchSubmissions(
        String(q || "")
      );

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: SUBMISSION_MESSAGES.SUBMISSIONS_RETRIEVED,
        data: submissions,
      });
    } catch (error) {
      next(error);
    }
  }

  async adminList(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await this.submissionService.adminList({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        status: req.query.status ? String(req.query.status) : undefined,
        language: req.query.language ? String(req.query.language) : undefined,
        problemId: req.query.problemId ? String(req.query.problemId) : undefined,
        userId: req.query.userId ? String(req.query.userId) : undefined,
        from: req.query.from ? String(req.query.from) : undefined,
        to: req.query.to ? String(req.query.to) : undefined,
        source: req.query.source ? String(req.query.source) : undefined,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: SUBMISSION_MESSAGES.SUBMISSIONS_RETRIEVED,
        data: result.submissions,
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

  async internalStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const days = Number(req.query.days) || 30;
      const data = await this.submissionService.internalStats(days);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Internal submission stats",
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}
