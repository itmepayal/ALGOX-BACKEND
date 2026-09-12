import express from "express";
import { SubmissionController } from "../../controllers/submission.controller";
import { SubmissionService } from "../../services/submission.service";
import { SubmissionRepository } from "../../repositories/submission.repository";
import {
  authenticateJwt,
  requirePermission,
} from "../../middlewares/auth.middleware";

const submissionRouter = express.Router();

const submissionRepository = new SubmissionRepository();
const submissionService = new SubmissionService(submissionRepository);
const submissionController = new SubmissionController(submissionService);

// Product: create + poll + user/problem scoped lists
submissionRouter.post(
  "/",
  submissionController.createSubmission.bind(submissionController)
);
submissionRouter.get(
  "/me/import-source",
  authenticateJwt,
  submissionController.getImportSourceForMe.bind(submissionController)
);
submissionRouter.get(
  "/problem/:problemId",
  submissionController.getByProblemId.bind(submissionController)
);
submissionRouter.get(
  "/user/:userId",
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
  "/admin/internal-stats",
  authenticateJwt,
  requirePermission("analytics:view"),
  submissionController.internalStats.bind(submissionController)
);
submissionRouter.get(
  "/admin/:id",
  authenticateJwt,
  requirePermission("submissions:view"),
  submissionController.getSubmissionById.bind(submissionController)
);

// Legacy list-all / filters — now staff-only
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

// Polling for product UI (single submission)
submissionRouter.get(
  "/:id",
  submissionController.getSubmissionById.bind(submissionController)
);

/** Evaluation worker callback — service-to-service, no JWT. Triggers suspicious re-analysis on terminal status. */
submissionRouter.put(
  "/internal/:id",
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
