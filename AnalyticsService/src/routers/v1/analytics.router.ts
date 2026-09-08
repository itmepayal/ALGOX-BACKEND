import { Router } from "express";
import { AnalyticsController } from "../../controllers/analytics.controller";
import { AnalyticsService } from "../../services/analytics.service";
import { AnalyticsRepository } from "../../repositories/analytics.repository";

const analyticsRepository = new AnalyticsRepository();
const analyticsService = new AnalyticsService(analyticsRepository);
const analyticsController = new AnalyticsController(analyticsService);

const analyticsRouter = Router();

analyticsRouter.get("/user/:userId", analyticsController.getUserAnalytics.bind(analyticsController));
analyticsRouter.post("/record-submission", analyticsController.recordSubmissionEvent.bind(analyticsController));

export default analyticsRouter;
