import { Request, Response, NextFunction } from "express";
import { ISubmissionService } from "../services/submission.service";
import { SubmissionStatus } from "../models/submission.model";
import {
  createSubmissionSchema,
  updateSubmissionSchema,
} from "../validators/submission.validator";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS, SUBMISSION_MESSAGES } from "../utils/constants";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { ForbiddenError, UnauthorizedError } from "../utils/errors/app.error";
import { hasAnyPermission } from "../rbac/permissions";

function actorUserId(req: Request): string | undefined {
  return (req as AuthenticatedRequest).user?.userId;
}

function canViewAllSubmissions(req: Request): boolean {
  const role = (req as AuthenticatedRequest).user?.role;
  return hasAnyPermission(role, ["submissions:view"]);
}

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
      const userId = actorUserId(req);
      if (!userId) throw new UnauthorizedError("Authentication required");

      const validated = createSubmissionSchema.parse({
        ...req.body,
        // Never trust client-supplied userId — bind to JWT subject
        userId,
      });
      const role = (req as AuthenticatedRequest).user?.role;
      const submission = await this.submissionService.createSubmission(
        validated,
        { role: typeof role === "string" ? role : undefined }
      );

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
      const userId = actorUserId(req);
      const ownerId = String((submission as any).userId || "");

      // Admin list uses same controller with submissions:view already gated by router.
      // Product GET /:id must enforce ownership unless staff.
      if (
        !canViewAllSubmissions(req) &&
        ownerId &&
        userId &&
        ownerId !== userId
      ) {
        throw new ForbiddenError("You cannot access another user's submission");
      }

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
      const actor = actorUserId(req);
      if (!actor) throw new UnauthorizedError("Authentication required");

      let submissions = await this.submissionService.getByProblemId(problemId);
      // Non-staff: only own submissions for this problem (prevents IDOR)
      if (!canViewAllSubmissions(req)) {
        submissions = submissions.filter(
          (s) => String((s as any).userId || "") === actor
        );
      }

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
      const actor = actorUserId(req);
      if (!actor) throw new UnauthorizedError("Authentication required");

      if (userId !== actor && !canViewAllSubmissions(req)) {
        throw new ForbiddenError("You cannot list another user's submissions");
      }

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
        statuses: req.query.statuses ? String(req.query.statuses) : undefined,
        language: req.query.language ? String(req.query.language) : undefined,
        problemId: req.query.problemId ? String(req.query.problemId) : undefined,
        userId: req.query.userId ? String(req.query.userId) : undefined,
        from: req.query.from ? String(req.query.from) : undefined,
        to: req.query.to ? String(req.query.to) : undefined,
        source: req.query.source ? String(req.query.source) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
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

  /** Dedicated failed-execution list (server-side pagination + filters). */
  async adminFailedList(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const defaultFail =
        "WRONG_ANSWER,RUNTIME_ERROR,TIME_LIMIT_EXCEEDED,MEMORY_LIMIT_EXCEEDED,COMPILATION_ERROR,SYSTEM_ERROR";
      const statuses =
        req.query.status && String(req.query.status) !== "all"
          ? String(req.query.status)
          : req.query.statuses
            ? String(req.query.statuses)
            : defaultFail;

      const result = await this.submissionService.adminList({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        statuses,
        language: req.query.language ? String(req.query.language) : undefined,
        problemId: req.query.problemId ? String(req.query.problemId) : undefined,
        userId: req.query.userId ? String(req.query.userId) : undefined,
        from: req.query.from ? String(req.query.from) : undefined,
        to: req.query.to ? String(req.query.to) : undefined,
        source: req.query.source ? String(req.query.source) : "submit",
        search: req.query.search ? String(req.query.search) : undefined,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Failed executions retrieved",
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

  async problemStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const problemId = String(req.params.problemId);
      const days = Number(req.query.days) || 30;
      const data = await this.submissionService.problemStats(problemId, days);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Problem submission stats",
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}
