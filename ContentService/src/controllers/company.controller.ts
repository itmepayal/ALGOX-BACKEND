import { Request, Response, NextFunction } from "express";
import { companyService } from "../services/company.service";
import {
  AuthenticatedRequest,
} from "../middlewares/auth.middleware";
import { writeAdminAudit } from "../utils/helpers/audit.helper";
import {
  companyDirectoryQuerySchema,
  companyQuestionsQuerySchema,
  createCompanyQuestionSchema,
  createCompanySchema,
  updateCompanyQuestionSchema,
  updateCompanySchema,
} from "../validators/company.validator";
import {
  hasFeature,
  resolveEntitlements,
} from "../utils/entitlementClient";

async function audit(
  req: Request,
  action: string,
  resourceId?: string,
  after?: Record<string, unknown>
) {
  const user = (req as AuthenticatedRequest).user;
  if (!user?.userId) return;
  await writeAdminAudit({
    actorId: user.userId,
    actorEmail: user.email,
    action,
    resource: "company",
    resourceId,
    after,
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
    authorization: req.headers.authorization,
  });
}

function sendError(res: Response, err: any) {
  const status = err?.statusCode || (err?.name === "ZodError" ? 400 : 500);
  res.status(status).json({
    success: false,
    message: err?.message || "Request failed",
    issues: err?.issues,
  });
}

export class CompanyController {
  // ── Admin ──────────────────────────────────────────────────────────
  async adminCreateCompany(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createCompanySchema.parse(req.body);
      const company = await companyService.createCompany(body);
      await audit(req, "company.create", String((company as any)._id), {
        name: body.name,
      });
      res.status(201).json({ success: true, data: company });
    } catch (err) {
      if ((err as any)?.statusCode) return sendError(res, err);
      next(err);
    }
  }

  async adminUpdateCompany(req: Request, res: Response, next: NextFunction) {
    try {
      const body = updateCompanySchema.parse(req.body);
      const company = await companyService.updateCompany(
        String(req.params.id),
        body
      );
      await audit(req, "company.update", String(req.params.id), {
        fields: Object.keys(body),
      });
      res.status(200).json({ success: true, data: company });
    } catch (err) {
      if ((err as any)?.statusCode) return sendError(res, err);
      next(err);
    }
  }

  async adminDeleteCompany(req: Request, res: Response, next: NextFunction) {
    try {
      await companyService.deleteCompany(String(req.params.id));
      await audit(req, "company.delete", String(req.params.id));
      res.status(200).json({ success: true, message: "Company deleted" });
    } catch (err) {
      if ((err as any)?.statusCode) return sendError(res, err);
      next(err);
    }
  }

  async adminListCompanies(req: Request, res: Response, next: NextFunction) {
    try {
      const query = companyDirectoryQuerySchema.parse(req.query);
      const result = await companyService.adminListCompanies(query);
      res.status(200).json({
        success: true,
        data: result.companies,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async adminGetCompany(req: Request, res: Response, next: NextFunction) {
    try {
      const company = await companyService.adminGetCompany(String(req.params.id));
      res.status(200).json({ success: true, data: company });
    } catch (err) {
      if ((err as any)?.statusCode) return sendError(res, err);
      next(err);
    }
  }

  async adminCreateQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createCompanyQuestionSchema.parse(req.body);
      const question = await companyService.createQuestion(
        String(req.params.id),
        body
      );
      await audit(req, "company.question.create", String((question as any)._id), {
        companyId: req.params.id,
        problemId: body.problemId,
      });
      res.status(201).json({ success: true, data: question });
    } catch (err) {
      if ((err as any)?.statusCode) return sendError(res, err);
      next(err);
    }
  }

  async adminUpdateQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      const body = updateCompanyQuestionSchema.parse(req.body);
      const question = await companyService.updateQuestion(
        String(req.params.questionId),
        body
      );
      await audit(req, "company.question.update", String(req.params.questionId));
      res.status(200).json({ success: true, data: question });
    } catch (err) {
      if ((err as any)?.statusCode) return sendError(res, err);
      next(err);
    }
  }

  async adminDeleteQuestion(req: Request, res: Response, next: NextFunction) {
    try {
      await companyService.deleteQuestion(String(req.params.questionId));
      await audit(req, "company.question.delete", String(req.params.questionId));
      res.status(200).json({ success: true, message: "Question deleted" });
    } catch (err) {
      if ((err as any)?.statusCode) return sendError(res, err);
      next(err);
    }
  }

  async adminListQuestions(req: Request, res: Response, next: NextFunction) {
    try {
      const query = companyQuestionsQuerySchema.parse(req.query);
      const result = await companyService.adminListQuestions(
        String(req.params.id),
        query
      );
      res.status(200).json({
        success: true,
        data: result.questions,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  // ── Public ─────────────────────────────────────────────────────────
  async listDirectory(req: Request, res: Response, next: NextFunction) {
    try {
      const query = companyDirectoryQuerySchema.parse(req.query);
      const result = await companyService.listDirectory(query);
      res.status(200).json({
        success: true,
        data: result.companies,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async getCompanyPage(req: Request, res: Response, next: NextFunction) {
    try {
      const query = companyQuestionsQuerySchema.parse(req.query);
      const entitlements = await resolveEntitlements(
        typeof req.headers.authorization === "string"
          ? req.headers.authorization
          : null
      );
      const page = await companyService.getCompanyPage(
        String(req.params.slug),
        query,
        {
          canAccessCompanyQuestions: hasFeature(
            entitlements,
            "premium.company_questions"
          ),
        }
      );
      res.status(200).json({ success: true, data: page });
    } catch (err) {
      if ((err as any)?.statusCode) return sendError(res, err);
      next(err);
    }
  }
}

export const companyController = new CompanyController();
