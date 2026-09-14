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

export default analyticsRouter;
