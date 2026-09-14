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
import { writeAdminAudit } from "../utils/helpers/audit.helper";

async function auditProblem(
  req: AuthenticatedRequest,
  action: string,
  resourceId?: string,
  after?: Record<string, unknown>
) {
  await writeAdminAudit({
    actorId: req.user!.userId,
    actorEmail: req.user!.email,
    action,
    resource: "problem",
    resourceId,
    after,
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
    authorization: req.headers.authorization,
  });
}

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

      await auditProblem(req, "problem.create", String((problem as any)._id || (problem as any).id), {
        title: validated.title,
        status: (problem as any).status,
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

      await auditProblem(req, "problem.update", id, {
        fields: Object.keys(validated),
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

      await auditProblem(req, "problem.delete", id);

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

      await auditProblem(req, "problem.publish", id, { status: body.status });

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

  /**
   * Import many problems (JSON array). Validates each row; creates drafts.
   * Returns per-row success/error — partial import allowed.
   */
  async bulkImport(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const raw = req.body?.problems ?? req.body;
      if (!Array.isArray(raw) || raw.length === 0) {
        res.status(400).json({
          success: false,
          message: "Body must include a non-empty problems array",
        });
        return;
      }
      if (raw.length > 100) {
        res.status(400).json({
          success: false,
          message: "Import limited to 100 problems per request",
        });
        return;
      }

      const results: Array<{
        index: number;
        ok: boolean;
        id?: string;
        title?: string;
        error?: string;
      }> = [];

      for (let i = 0; i < raw.length; i++) {
        const parsed = createProblemSchema.safeParse({
          ...raw[i],
          status: raw[i]?.status || "draft",
        });
        if (!parsed.success) {
          results.push({
            index: i,
            ok: false,
            title: raw[i]?.title,
            error: parsed.error.issues
              .map((x) => `${x.path.join(".")}: ${x.message}`)
              .join("; "),
          });
          continue;
        }
        try {
          const problem = await this.problemService.createProblem(parsed.data, {
            userId: req.user!.userId,
          });
          const id =
            (problem as any).id ||
            (problem as any)._id?.toString?.() ||
            undefined;
          results.push({
            index: i,
            ok: true,
            id,
            title: parsed.data.title,
          });
        } catch (err: any) {
          results.push({
            index: i,
            ok: false,
            title: parsed.data.title,
            error: err?.message || "Create failed",
          });
        }
      }

      const created = results.filter((r) => r.ok).length;
      const failed = results.length - created;

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: `Import finished: ${created} created, ${failed} failed`,
        data: { created, failed, results },
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
