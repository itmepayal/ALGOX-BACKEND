import express from "express";
import { authenticateJwt } from "../../middlewares/auth.middleware";
import { aiAssistantController } from "../../controllers/aiAssistant.controller";

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

export default aiRouter;
