import express from "express";
import { SubmissionController } from "../../controllers/submission.controller";
import { SubmissionService } from "../../services/submission.service";
import { SubmissionRepository } from "../../repositories/submission.repository";
import {
  authenticateJwt,
  requirePermission,
  requireInternalSecret,
} from "../../middlewares/auth.middleware";
import { requireFeatureFlag } from "../../middlewares/featureFlag.middleware";

const submissionRouter = express.Router();

const submissionRepository = new SubmissionRepository();
const submissionService = new SubmissionService(submissionRepository);
const submissionController = new SubmissionController(submissionService);

// Product: create + poll + user/problem scoped lists (JWT + ownership)
submissionRouter.post(
  "/",
  authenticateJwt,
  requireFeatureFlag("submissions"),
  submissionController.createSubmission.bind(submissionController)
);
/** Must be registered before /:id so "me" is never treated as an ObjectId. */
submissionRouter.get(
  "/me",
  authenticateJwt,
  submissionController.getMySubmissions.bind(submissionController)
);
submissionRouter.get(
  "/me/import-source",
  authenticateJwt,
  submissionController.getImportSourceForMe.bind(submissionController)
);
submissionRouter.get(
  "/me/analytics",
  authenticateJwt,
  submissionController.getMyAnalytics.bind(submissionController)
);
submissionRouter.get(
  "/problem/:problemId",
  authenticateJwt,
  submissionController.getByProblemId.bind(submissionController)
);
submissionRouter.get(
  "/user/:userId",
  authenticateJwt,
  submissionController.getByUserId.bind(submissionController)
);

// Admin surfaces
submissionRouter.get(
  "/admin/list",
  authenticateJwt,
  requirePermission("submissions:view"),
  submissionController.adminList.bind(submissionController)
);
submissionRouter.get(
  "/admin/failed",
  authenticateJwt,
  requirePermission("submissions:view"),
  submissionController.adminFailedList.bind(submissionController)
);
submissionRouter.get(
  "/admin/internal-stats",
  authenticateJwt,
  requirePermission("analytics:view"),
  submissionController.internalStats.bind(submissionController)
);
submissionRouter.get(
  "/admin/problem-stats/:problemId",
  authenticateJwt,
  requirePermission("analytics:view"),
  submissionController.problemStats.bind(submissionController)
);
submissionRouter.get(
  "/admin/:id",
  authenticateJwt,
  requirePermission("submissions:view"),
  submissionController.getSubmissionById.bind(submissionController)
);

// Legacy list-all / filters — staff-only
submissionRouter.get(
  "/",
  authenticateJwt,
  requirePermission("submissions:view"),
  submissionController.getAllSubmissions.bind(submissionController)
);
submissionRouter.get(
  "/search",
  authenticateJwt,
  requirePermission("submissions:view"),
  submissionController.searchSubmissions.bind(submissionController)
);
submissionRouter.get(
  "/status/:status",
  authenticateJwt,
  requirePermission("submissions:view"),
  submissionController.getByStatus.bind(submissionController)
);
submissionRouter.get(
  "/language/:language",
  authenticateJwt,
  requirePermission("submissions:view"),
  submissionController.getByLanguage.bind(submissionController)
);

// Polling for product UI (owner or staff)
submissionRouter.get(
  "/:id",
  authenticateJwt,
  submissionController.getSubmissionById.bind(submissionController)
);

/** Evaluation worker callback — internal secret required. */
submissionRouter.put(
  "/internal/:id",
  requireInternalSecret,
  submissionController.updateSubmission.bind(submissionController)
);

submissionRouter.put(
  "/:id",
  authenticateJwt,
  requirePermission("submissions:update"),
  submissionController.updateSubmission.bind(submissionController)
);
submissionRouter.delete(
  "/:id",
  authenticateJwt,
  requirePermission("submissions:delete"),
  submissionController.deleteSubmission.bind(submissionController)
);

export default submissionRouter;
