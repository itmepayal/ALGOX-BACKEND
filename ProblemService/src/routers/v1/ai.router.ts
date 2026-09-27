import express from "express";
import { authenticateJwt } from "../../middlewares/auth.middleware";
import { aiAssistantController } from "../../controllers/aiAssistant.controller";
import { aiReviewController } from "../../controllers/aiReview.controller";

const aiRouter = express.Router();

aiRouter.use(authenticateJwt);

aiRouter.get(
  "/usage",
  aiAssistantController.usage.bind(aiAssistantController)
);
aiRouter.get(
  "/history",
  aiAssistantController.history.bind(aiAssistantController)
);
/** Explicit deny for /history/:userId probing */
aiRouter.get(
  "/history/:userId",
  aiAssistantController.historyForbiddenOther.bind(aiAssistantController)
);
aiRouter.post(
  "/assist",
  aiAssistantController.assist.bind(aiAssistantController)
);

// AI Code Review V1
aiRouter.post(
  "/review",
  aiReviewController.generateReview.bind(aiReviewController)
);
aiRouter.get(
  "/review/:submissionId",
  aiReviewController.getExistingReview.bind(aiReviewController)
);

export default aiRouter;

