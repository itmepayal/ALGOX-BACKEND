import express from "express";
import {
  authenticateJwt,
  requirePermission,
} from "../../middlewares/auth.middleware";
import { adminLearningController } from "../../controllers/adminLearning.controller";

const adminLearningRouter = express.Router();

adminLearningRouter.use(authenticateJwt);

adminLearningRouter.get(
  "/sheet-progress",
  requirePermission("analytics:view", "sheets:manage"),
  adminLearningController.sheetProgressOverview
);

adminLearningRouter.get(
  "/topic-engagement",
  requirePermission("analytics:view", "problems:view"),
  adminLearningController.topicEngagement
);

adminLearningRouter.get(
  "/weak-topics",
  requirePermission("analytics:view", "problems:view"),
  adminLearningController.weakTopics
);

adminLearningRouter.get(
  "/revision-summary",
  requirePermission("analytics:view", "problems:view"),
  adminLearningController.revisionSummary
);

adminLearningRouter.get(
  "/product-usage",
  requirePermission("analytics:view"),
  adminLearningController.productUsage
);

export default adminLearningRouter;
