import express from "express";
import { ProblemController } from "../../controllers/problem.controller";
import { ProblemService } from "../../services/problem.service";
import { ProblemRepository } from "../../repositories/problem.repository";
import { engagementController } from "../../controllers/engagement.controller";
import {
  authenticateJwt,
  optionalAuthenticateJwt,
  requirePermission,
  requireInternalSecret,
  requireTestcaseWritePermission,
} from "../../middlewares/auth.middleware";
import { sheetProgressController } from "../../controllers/sheetProgress.controller";

const problemRouter = express.Router();

const problemRepository = new ProblemRepository();
const problemService = new ProblemService(problemRepository);
const problemController = new ProblemController(problemService);

// ── Admin (before /:id) ──────────────────────────────────────────────
problemRouter.get(
  "/admin/list",
  authenticateJwt,
  requirePermission("problems:view"),
  problemController.getAdminProblems.bind(problemController)
);
problemRouter.get(
  "/admin/internal-stats",
  authenticateJwt,
  requirePermission("analytics:view", "problems:view"),
  problemController.internalStats.bind(problemController)
);
problemRouter.post(
  "/admin/bulk",
  authenticateJwt,
  requirePermission("problems:update"),
  problemController.bulkUpdate.bind(problemController)
);
problemRouter.post(
  "/admin/import",
  authenticateJwt,
  requirePermission("problems:create"),
  problemController.bulkImport.bind(problemController)
);
// Must be registered before /admin/:id or static segments are cast as ObjectId
problemRouter.get(
  "/admin/favourite-analytics",
  authenticateJwt,
  requirePermission("analytics:view"),
  engagementController.getFavouriteAnalytics.bind(engagementController)
);
problemRouter.get(
  "/admin/titles",
  authenticateJwt,
  requirePermission("problems:view", "analytics:view"),
  problemController.lookupTitlesByIds.bind(problemController)
);
problemRouter.get(
  "/admin/:id",
  authenticateJwt,
  requirePermission("problems:view"),
  problemController.getAdminProblemById.bind(problemController)
);
problemRouter.post(
  "/admin/:id/duplicate",
  authenticateJwt,
  requirePermission("problems:create"),
  problemController.duplicateProblem.bind(problemController)
);
problemRouter.patch(
  "/admin/:id/status",
  authenticateJwt,
  requirePermission("problems:publish"),
  problemController.setStatus.bind(problemController)
);

// Public User Endpoints — optional JWT so entitlement can unlock premium content
problemRouter.get(
  "/",
  optionalAuthenticateJwt,
  problemController.getProblems.bind(problemController)
);
/** REST convenience filters — UI uses GET /problems with query params; keep for API clients. */
problemRouter.get(
  "/search",
  optionalAuthenticateJwt,
  problemController.searchProblems.bind(problemController)
);
problemRouter.get(
  "/difficulty/:difficulty",
  optionalAuthenticateJwt,
  problemController.findByDifficulty.bind(problemController)
);
problemRouter.get(
  "/slug/:slug",
  optionalAuthenticateJwt,
  problemController.getProblemBySlug.bind(problemController)
);

// Sheet progress — before bare /:id
problemRouter.get(
  "/sheets/:sheetId/progress",
  authenticateJwt,
  sheetProgressController.getProgress.bind(sheetProgressController)
);
problemRouter.post(
  "/sheets/:sheetId/reset-progress",
  authenticateJwt,
  sheetProgressController.resetProgress.bind(sheetProgressController)
);

// Engagement — register before bare /:id
// Bookmark ≠ Favourite ≠ Important ≠ Revision (independent stores).
problemRouter.get(
  "/bookmarks/me",
  authenticateJwt,
  engagementController.listMyBookmarks.bind(engagementController)
);
problemRouter.get(
  "/favourites/me",
  authenticateJwt,
  engagementController.listMyFavourites.bind(engagementController)
);
problemRouter.get(
  "/favourites/ids",
  authenticateJwt,
  engagementController.listMyFavoriteIds.bind(engagementController)
);
problemRouter.get(
  "/important/me",
  authenticateJwt,
  engagementController.listMyImportantIds.bind(engagementController)
);
problemRouter.get(
  "/revisions/me",
  authenticateJwt,
  engagementController.listMyRevisions.bind(engagementController)
);
problemRouter.get(
  "/personalization/summary",
  authenticateJwt,
  engagementController.getPersonalizationSummary.bind(engagementController)
);
problemRouter.get(
  "/:id/engagement",
  optionalAuthenticateJwt,
  engagementController.getEngagement.bind(engagementController)
);
problemRouter.post(
  "/:id/reaction",
  authenticateJwt,
  engagementController.setReaction.bind(engagementController)
);
problemRouter.delete(
  "/:id/reaction",
  authenticateJwt,
  engagementController.clearReaction.bind(engagementController)
);
problemRouter.post(
  "/:id/bookmark",
  authenticateJwt,
  engagementController.addBookmark.bind(engagementController)
);
problemRouter.delete(
  "/:id/bookmark",
  authenticateJwt,
  engagementController.removeBookmark.bind(engagementController)
);
problemRouter.post(
  "/:id/bookmark/toggle",
  authenticateJwt,
  engagementController.toggleBookmark.bind(engagementController)
);
problemRouter.post(
  "/:id/favourite",
  authenticateJwt,
  engagementController.addFavorite.bind(engagementController)
);
problemRouter.post(
  "/:id/favourite/toggle",
  authenticateJwt,
  engagementController.toggleFavorite.bind(engagementController)
);
problemRouter.delete(
  "/:id/favourite",
  authenticateJwt,
  engagementController.removeFavorite.bind(engagementController)
);
problemRouter.post(
  "/:id/important/toggle",
  authenticateJwt,
  engagementController.toggleImportant.bind(engagementController)
);
problemRouter.patch(
  "/:id/personal-confidence",
  authenticateJwt,
  engagementController.setPersonalConfidence.bind(engagementController)
);
problemRouter.post(
  "/:id/revision/toggle",
  authenticateJwt,
  engagementController.toggleRevision.bind(engagementController)
);
problemRouter.post(
  "/:id/revision",
  authenticateJwt,
  engagementController.addRevision.bind(engagementController)
);
problemRouter.delete(
  "/:id/revision",
  authenticateJwt,
  engagementController.removeRevision.bind(engagementController)
);

// Internal before bare /:id so "internal" is not treated as an id
// Returns FULL problem including hidden testcases — service secret required
problemRouter.get(
  "/internal/:id",
  requireInternalSecret,
  problemController.getInternalProblemById.bind(problemController)
);

problemRouter.get(
  "/internal/:id/solve-access",
  requireInternalSecret,
  problemController.assertSolveAccess.bind(problemController)
);

problemRouter.get(
  "/:id",
  optionalAuthenticateJwt,
  problemController.getProblemById.bind(problemController)
);

// Admin mutate endpoints
problemRouter.post(
  "/",
  authenticateJwt,
  requirePermission("problems:create"),
  requireTestcaseWritePermission,
  problemController.createProblem.bind(problemController)
);
problemRouter.put(
  "/:id",
  authenticateJwt,
  requirePermission("problems:update"),
  requireTestcaseWritePermission,
  problemController.updateProblem.bind(problemController)
);
problemRouter.delete(
  "/:id",
  authenticateJwt,
  requirePermission("problems:delete"),
  problemController.deleteProblem.bind(problemController)
);

export default problemRouter;
