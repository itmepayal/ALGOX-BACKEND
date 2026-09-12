import express from "express";
import {
  authenticateJwt,
  requirePermission,
} from "../../middlewares/auth.middleware";
import { SuspiciousSubmissionRepository } from "../../repositories/suspiciousSubmission.repository";
import { SuspiciousSubmissionService } from "../../services/suspiciousSubmission.service";
import { SuspiciousSubmissionController } from "../../controllers/suspiciousSubmission.controller";

const router = express.Router();

const repo = new SuspiciousSubmissionRepository();
const service = new SuspiciousSubmissionService(repo);
const controller = new SuspiciousSubmissionController(service);

router.use(authenticateJwt);

router.get(
  "/",
  requirePermission("suspicious:view"),
  controller.list.bind(controller)
);

router.get(
  "/:id",
  requirePermission("suspicious:view"),
  controller.getById.bind(controller)
);

router.post(
  "/:id/review",
  requirePermission("suspicious:review"),
  controller.markReviewing.bind(controller)
);

router.post(
  "/:id/confirm",
  requirePermission("suspicious:review"),
  controller.confirm.bind(controller)
);

router.post(
  "/:id/dismiss",
  requirePermission("suspicious:review"),
  controller.dismiss.bind(controller)
);

export default router;
