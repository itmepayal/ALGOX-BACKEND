import { Router } from "express";
import { EvaluationController } from "../../controllers/evaluation.controller";
import {
  authenticateJwt,
  requireInternalSecret,
} from "../../middlewares/auth.middleware";
import { requireFeatureFlag } from "../../middlewares/featureFlag.middleware";

const evaluationRouter = Router();
const evaluationController = new EvaluationController();

evaluationRouter.post(
  "/run",
  authenticateJwt,
  requireFeatureFlag("submissions"),
  evaluationController.runCode
);

/** Full judge with official tests — S2S only (never client JWT). */
evaluationRouter.post(
  "/evaluate",
  requireInternalSecret,
  evaluationController.evaluateSubmission
);

export default evaluationRouter;
