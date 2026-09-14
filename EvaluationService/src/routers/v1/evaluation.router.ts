import { Router } from "express";
import { EvaluationController } from "../../controllers/evaluation.controller";
import {
  authenticateJwt,
  authenticateJwtOrInternal,
} from "../../middlewares/auth.middleware";

const evaluationRouter = Router();
const evaluationController = new EvaluationController();

evaluationRouter.post("/run", authenticateJwt, evaluationController.runCode);

evaluationRouter.post(
  "/evaluate",
  authenticateJwtOrInternal,
  evaluationController.evaluateSubmission
);

export default evaluationRouter;
