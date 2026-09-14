import { Router } from "express";
import { ContentController } from "../../controllers/content.controller";
import { ContentService } from "../../services/content.service";
import { ContentRepository } from "../../repositories/content.repository";
import {
  authenticateJwt,
  requirePermission,
} from "../../middlewares/auth.middleware";
import { validateRequestBody } from "../../validators";
import {
  createArticleSchema,
  createStudyPlanSchema,
  updateArticleSchema,
  updateStudyPlanSchema,
  upsertEditorialSchema,
} from "../../validators/content.validator";

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

// ── Authenticated user ops (own data only — enforced in controller) ──
contentRouter.post(
  "/study-plans/progress",
  authenticateJwt,
  contentController.updateStudyPlanProgress.bind(contentController)
);
contentRouter.post(
  "/notes",
  authenticateJwt,
  contentController.upsertProblemNote.bind(contentController)
);
contentRouter.get(
  "/notes/:userId/:problemId",
  authenticateJwt,
  contentController.getProblemNote.bind(contentController)
);
contentRouter.get(
  "/notes/user/:userId",
  authenticateJwt,
  contentController.getUserNotes.bind(contentController)
);
contentRouter.get(
  "/study-plans/progress/:userId/:slug",
  authenticateJwt,
  contentController.getUserStudyPlanProgress.bind(contentController)
);

// ── Public reads ─────────────────────────────────────────────────────
contentRouter.get(
  "/editorials/problem/:problemId",
  contentController.getEditorialByProblemId.bind(contentController)
);
contentRouter.get(
  "/study-plans",
  contentController.getStudyPlans.bind(contentController)
);
contentRouter.get(
  "/study-plans/:slug",
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
