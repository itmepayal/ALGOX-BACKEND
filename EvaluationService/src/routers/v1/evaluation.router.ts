import { Router } from "express";
import { EvaluationController } from "../../controllers/evaluation.controller";

const evaluationRouter = Router();
const evaluationController = new EvaluationController();

evaluationRouter.post("/run", evaluationController.runCode);

evaluationRouter.post("/evaluate", evaluationController.evaluateSubmission);

export default evaluationRouter;
