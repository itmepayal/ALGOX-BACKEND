import { Router } from "express";
import { AnalyticsController } from "../../controllers/analytics.controller";
import { AnalyticsService } from "../../services/analytics.service";
import { AnalyticsRepository } from "../../repositories/analytics.repository";
import {
  authenticateJwt,
  requirePermission,
  requireInternalSecret,
} from "../../middlewares/auth.middleware";

const analyticsRepository = new AnalyticsRepository();
const analyticsService = new AnalyticsService(analyticsRepository);
const analyticsController = new AnalyticsController(analyticsService);

const analyticsRouter = Router();

// Own analytics only — staff can view any via permission
analyticsRouter.get(
  "/user/:userId",
  authenticateJwt,
  analyticsController.getUserAnalytics.bind(analyticsController)
);

analyticsRouter.get(
  "/me/overview",
  authenticateJwt,
  analyticsController.getMyOverview.bind(analyticsController)
);
analyticsRouter.get(
  "/me/history",
  authenticateJwt,
  analyticsController.getMyHistory.bind(analyticsController)
);
analyticsRouter.get(
  "/me/premium",
  authenticateJwt,
  analyticsController.getMyPremium.bind(analyticsController)
);
analyticsRouter.get(
  "/me/learning",
  authenticateJwt,
  analyticsController.getMyLearning.bind(analyticsController)
);

// Evaluation worker only
analyticsRouter.post(
  "/record-submission",
  requireInternalSecret,
  analyticsController.recordSubmissionEvent.bind(analyticsController)
);

analyticsRouter.get(
  "/admin/overview",
  authenticateJwt,
  requirePermission("analytics:view"),
  analyticsController.getOverview.bind(analyticsController)
);
analyticsRouter.get(
  "/admin/charts",
  authenticateJwt,
  requirePermission("analytics:view"),
  analyticsController.getCharts.bind(analyticsController)
);
analyticsRouter.get(
  "/admin/dashboard",
  authenticateJwt,
  requirePermission("analytics:view"),
  analyticsController.getDashboard.bind(analyticsController)
);
analyticsRouter.get(
  "/admin/export",
  authenticateJwt,
  requirePermission("analytics:view"),
  analyticsController.exportDashboard.bind(analyticsController)
);

export default analyticsRouter;
