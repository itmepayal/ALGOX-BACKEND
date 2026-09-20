import express from "express";
import {
  authenticateJwt,
  requireInternalSecret,
} from "../../middlewares/auth.middleware";
import { requireFeature } from "../../middlewares/requireFeature.middleware";
import { mockInterviewController } from "../../controllers/mockInterview.controller";
import { MOCK_INTERVIEW_FEATURE } from "../../config/mockInterview.config";

const mockInterviewRouter = express.Router();

/** Public config — auth required so anonymous scrapers don't hit it freely; no premium gate. */
mockInterviewRouter.get(
  "/config",
  authenticateJwt,
  mockInterviewController.config.bind(mockInterviewController)
);

mockInterviewRouter.post(
  "/start",
  authenticateJwt,
  requireFeature(MOCK_INTERVIEW_FEATURE),
  mockInterviewController.start.bind(mockInterviewController)
);
mockInterviewRouter.get(
  "/active",
  authenticateJwt,
  requireFeature(MOCK_INTERVIEW_FEATURE),
  mockInterviewController.active.bind(mockInterviewController)
);
mockInterviewRouter.get(
  "/mine",
  authenticateJwt,
  requireFeature(MOCK_INTERVIEW_FEATURE),
  mockInterviewController.list.bind(mockInterviewController)
);
mockInterviewRouter.get(
  "/:sessionId",
  authenticateJwt,
  requireFeature(MOCK_INTERVIEW_FEATURE),
  mockInterviewController.getById.bind(mockInterviewController)
);
mockInterviewRouter.post(
  "/:sessionId/attach-submission",
  authenticateJwt,
  requireFeature(MOCK_INTERVIEW_FEATURE),
  mockInterviewController.attachSubmission.bind(mockInterviewController)
);
mockInterviewRouter.post(
  "/:sessionId/complete",
  authenticateJwt,
  requireFeature(MOCK_INTERVIEW_FEATURE),
  mockInterviewController.complete.bind(mockInterviewController)
);
mockInterviewRouter.get(
  "/:sessionId/report",
  authenticateJwt,
  requireFeature(MOCK_INTERVIEW_FEATURE),
  mockInterviewController.report.bind(mockInterviewController)
);
mockInterviewRouter.post(
  "/:sessionId/abandon",
  authenticateJwt,
  requireFeature(MOCK_INTERVIEW_FEATURE),
  mockInterviewController.abandon.bind(mockInterviewController)
);

export default mockInterviewRouter;

export function mountMockInterviewInternal(router: express.Router) {
  router.get(
    "/internal/interviews/:sessionId/allows-submission",
    requireInternalSecret,
    mockInterviewController.allowsSubmission.bind(mockInterviewController)
  );
  router.post(
    "/internal/interviews/:sessionId/record-submission",
    requireInternalSecret,
    mockInterviewController.recordSubmission.bind(mockInterviewController)
  );
}
