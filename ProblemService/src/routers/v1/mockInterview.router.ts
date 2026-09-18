import express from "express";
import {
  authenticateJwt,
  requireInternalSecret,
} from "../../middlewares/auth.middleware";
import { mockInterviewController } from "../../controllers/mockInterview.controller";

const mockInterviewRouter = express.Router();

mockInterviewRouter.post(
  "/start",
  authenticateJwt,
  mockInterviewController.start.bind(mockInterviewController)
);
mockInterviewRouter.get(
  "/active",
  authenticateJwt,
  mockInterviewController.active.bind(mockInterviewController)
);
mockInterviewRouter.get(
  "/mine",
  authenticateJwt,
  mockInterviewController.list.bind(mockInterviewController)
);
mockInterviewRouter.get(
  "/:sessionId",
  authenticateJwt,
  mockInterviewController.getById.bind(mockInterviewController)
);
mockInterviewRouter.post(
  "/:sessionId/attach-submission",
  authenticateJwt,
  mockInterviewController.attachSubmission.bind(mockInterviewController)
);
mockInterviewRouter.post(
  "/:sessionId/complete",
  authenticateJwt,
  mockInterviewController.complete.bind(mockInterviewController)
);
mockInterviewRouter.get(
  "/:sessionId/report",
  authenticateJwt,
  mockInterviewController.report.bind(mockInterviewController)
);
mockInterviewRouter.post(
  "/:sessionId/abandon",
  authenticateJwt,
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
