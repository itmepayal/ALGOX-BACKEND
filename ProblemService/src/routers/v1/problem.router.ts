import express from "express";
import { ProblemController } from "../../controllers/problem.controller";
import { ProblemService } from "../../services/problem.service";
import { ProblemRepository } from "../../repositories/problem.repository";
import { engagementController } from "../../controllers/engagement.controller";
import {
  authenticateAdmin,
  authenticateJwt,
  optionalAuthenticateJwt,
} from "../../middlewares/auth.middleware";

const problemRouter = express.Router();

const problemRepository = new ProblemRepository();
const problemService = new ProblemService(problemRepository);
const problemController = new ProblemController(problemService);

// Public User Endpoints
problemRouter.get("/", problemController.getProblems.bind(problemController));
problemRouter.get("/search", problemController.searchProblems.bind(problemController));
problemRouter.get(
  "/difficulty/:difficulty",
  problemController.findByDifficulty.bind(problemController)
);
problemRouter.get(
  "/slug/:slug",
  problemController.getProblemBySlug.bind(problemController)
);

// Engagement — register before bare /:id
problemRouter.get(
  "/bookmarks/me",
  authenticateJwt,
  engagementController.listMyBookmarks.bind(engagementController)
);
problemRouter.get(
  "/revisions/me",
  authenticateJwt,
  engagementController.listMyRevisions.bind(engagementController)
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
  "/:id/revision/toggle",
  authenticateJwt,
  engagementController.toggleRevision.bind(engagementController)
);

// Internal before bare /:id so "internal" is not treated as an id
problemRouter.get(
  "/internal/:id",
  problemController.getInternalProblemById.bind(problemController)
);

problemRouter.get("/:id", problemController.getProblemById.bind(problemController));

// Admin Endpoints
problemRouter.post(
  "/",
  authenticateAdmin,
  problemController.createProblem.bind(problemController)
);
problemRouter.put(
  "/:id",
  authenticateAdmin,
  problemController.updateProblem.bind(problemController)
);
problemRouter.delete(
  "/:id",
  authenticateAdmin,
  problemController.deleteProblem.bind(problemController)
);

export default problemRouter;
