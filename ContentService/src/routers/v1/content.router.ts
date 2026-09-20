import { Router } from "express";
import { ContentController } from "../../controllers/content.controller";
import { ContentService } from "../../services/content.service";
import { ContentRepository } from "../../repositories/content.repository";
import { companyController } from "../../controllers/company.controller";
import {
  authenticateJwt,
  optionalAuthenticateJwt,
  requirePermission,
} from "../../middlewares/auth.middleware";
import { requireFeature } from "../../middlewares/requireFeature.middleware";
import { validateRequestBody } from "../../validators";
import {
  createArticleSchema,
  createStudyPlanSchema,
  updateArticleSchema,
  updateStudyPlanSchema,
  upsertEditorialSchema,
} from "../../validators/content.validator";
import {
  createCompanySchema,
  updateCompanySchema,
  createCompanyQuestionSchema,
  updateCompanyQuestionSchema,
} from "../../validators/company.validator";

const contentRepository = new ContentRepository();
const contentService = new ContentService(contentRepository);
const contentController = new ContentController(contentService);

const contentRouter = Router();

// ── Staff write ops ──────────────────────────────────────────────────
contentRouter.post(
  "/editorials",
  authenticateJwt,
  requirePermission("content:create", "content:update"),
  validateRequestBody(upsertEditorialSchema),
  contentController.upsertEditorial.bind(contentController)
);
contentRouter.post(
  "/study-plans",
  authenticateJwt,
  requirePermission("content:create"),
  validateRequestBody(createStudyPlanSchema),
  contentController.createStudyPlan.bind(contentController)
);
contentRouter.post(
  "/articles",
  authenticateJwt,
  requirePermission("content:create"),
  validateRequestBody(createArticleSchema),
  contentController.createArticle.bind(contentController)
);

// ── Staff admin CMS ──────────────────────────────────────────────────
contentRouter.get(
  "/admin/articles",
  authenticateJwt,
  requirePermission("content:view"),
  contentController.adminListArticles.bind(contentController)
);
contentRouter.patch(
  "/admin/articles/:id",
  authenticateJwt,
  requirePermission("content:update"),
  validateRequestBody(updateArticleSchema),
  contentController.updateArticle.bind(contentController)
);
contentRouter.delete(
  "/admin/articles/:id",
  authenticateJwt,
  requirePermission("content:delete"),
  contentController.deleteArticle.bind(contentController)
);
contentRouter.get(
  "/admin/study-plans",
  authenticateJwt,
  requirePermission("content:view"),
  contentController.adminListStudyPlans.bind(contentController)
);
contentRouter.patch(
  "/admin/study-plans/:id",
  authenticateJwt,
  requirePermission("content:update"),
  validateRequestBody(updateStudyPlanSchema),
  contentController.updateStudyPlan.bind(contentController)
);
contentRouter.delete(
  "/admin/study-plans/:id",
  authenticateJwt,
  requirePermission("content:delete"),
  contentController.deleteStudyPlan.bind(contentController)
);
contentRouter.get(
  "/admin/editorials",
  authenticateJwt,
  requirePermission("content:view"),
  contentController.adminListEditorials.bind(contentController)
);
contentRouter.delete(
  "/admin/editorials/:id",
  authenticateJwt,
  requirePermission("content:delete"),
  contentController.deleteEditorial.bind(contentController)
);
contentRouter.get(
  "/admin/notes",
  authenticateJwt,
  requirePermission("content:view"),
  contentController.adminListNotes.bind(contentController)
);
contentRouter.delete(
  "/admin/notes/:id",
  authenticateJwt,
  requirePermission("content:delete"),
  contentController.deleteNote.bind(contentController)
);

// ── Companies (interview prep) ───────────────────────────────────────
contentRouter.get(
  "/admin/companies",
  authenticateJwt,
  requirePermission("content:view"),
  companyController.adminListCompanies.bind(companyController)
);
contentRouter.post(
  "/admin/companies",
  authenticateJwt,
  requirePermission("content:create"),
  validateRequestBody(createCompanySchema),
  companyController.adminCreateCompany.bind(companyController)
);
/** Admin company detail — REST completeness; list+inline edit covers current UI. */
contentRouter.get(
  "/admin/companies/:id",
  authenticateJwt,
  requirePermission("content:view"),
  companyController.adminGetCompany.bind(companyController)
);
contentRouter.patch(
  "/admin/companies/:id",
  authenticateJwt,
  requirePermission("content:update"),
  validateRequestBody(updateCompanySchema),
  companyController.adminUpdateCompany.bind(companyController)
);
contentRouter.delete(
  "/admin/companies/:id",
  authenticateJwt,
  requirePermission("content:delete"),
  companyController.adminDeleteCompany.bind(companyController)
);
contentRouter.get(
  "/admin/companies/:id/questions",
  authenticateJwt,
  requirePermission("content:view"),
  companyController.adminListQuestions.bind(companyController)
);
contentRouter.post(
  "/admin/companies/:id/questions",
  authenticateJwt,
  requirePermission("content:create"),
  validateRequestBody(createCompanyQuestionSchema),
  companyController.adminCreateQuestion.bind(companyController)
);
/** Admin question PATCH — REST completeness; current admin UI creates/deletes only. */
contentRouter.patch(
  "/admin/companies/:id/questions/:questionId",
  authenticateJwt,
  requirePermission("content:update"),
  validateRequestBody(updateCompanyQuestionSchema),
  companyController.adminUpdateQuestion.bind(companyController)
);
contentRouter.delete(
  "/admin/companies/:id/questions/:questionId",
  authenticateJwt,
  requirePermission("content:delete"),
  companyController.adminDeleteQuestion.bind(companyController)
);

contentRouter.get(
  "/companies",
  authenticateJwt,
  requireFeature("premium.company_questions"),
  companyController.listDirectory.bind(companyController)
);
contentRouter.get(
  "/companies/:slug",
  authenticateJwt,
  requireFeature("premium.company_questions"),
  companyController.getCompanyPage.bind(companyController)
);

// ── Authenticated user ops (own data only — enforced in controller) ──
// ── Authenticated user ops (own data only — enforced in controller) ──
contentRouter.post(
  "/study-plans/progress",
  authenticateJwt,
  contentController.updateStudyPlanProgress.bind(contentController)
);
/** S2S / multi-plan progress — AnalyticsService fans in; no dedicated client list UI. */
contentRouter.get(
  "/study-plans/progress/me",
  authenticateJwt,
  contentController.listMyStudyPlanProgress.bind(contentController)
);
contentRouter.post(
  "/study-plans/:slug/enroll",
  authenticateJwt,
  contentController.enrollStudyPlan.bind(contentController)
);
contentRouter.post(
  "/study-plans/:slug/complete",
  authenticateJwt,
  contentController.completeStudyPlan.bind(contentController)
);
contentRouter.get(
  "/study-plans/:slug/resume",
  authenticateJwt,
  contentController.resumeStudyPlan.bind(contentController)
);
contentRouter.post(
  "/notes",
  authenticateJwt,
  contentController.upsertProblemNote.bind(contentController)
);
contentRouter.get(
  "/notes/user/:userId",
  authenticateJwt,
  contentController.getUserNotes.bind(contentController)
);
contentRouter.get(
  "/notes/:userId/:problemId",
  authenticateJwt,
  contentController.getProblemNote.bind(contentController)
);
contentRouter.delete(
  "/notes/:userId/:problemId",
  authenticateJwt,
  contentController.deleteUserProblemNote.bind(contentController)
);
contentRouter.get(
  "/study-plans/progress/:userId/:slug",
  authenticateJwt,
  contentController.getUserStudyPlanProgress.bind(contentController)
);

// ── Public reads (optional JWT → entitlement redaction) ──────────────
contentRouter.get(
  "/editorials/problem/:problemId",
  optionalAuthenticateJwt,
  contentController.getEditorialByProblemId.bind(contentController)
);
contentRouter.get(
  "/study-plans",
  optionalAuthenticateJwt,
  contentController.getStudyPlans.bind(contentController)
);
contentRouter.get(
  "/study-plans/:slug",
  optionalAuthenticateJwt,
  contentController.getStudyPlanBySlug.bind(contentController)
);
contentRouter.get(
  "/articles",
  contentController.getArticles.bind(contentController)
);
contentRouter.get(
  "/articles/:slug",
  contentController.getArticleBySlug.bind(contentController)
);

export default contentRouter;
