import { Router } from "express";
import { EvaluationController } from "../../controllers/evaluation.controller";

const evaluationRouter = Router();
const evaluationController = new EvaluationController();

// 🚀 Instant Synchronous "Run Code" Button API
evaluationRouter.post("/run", evaluationController.runCode);

// 📝 Synchronous "Evaluate Testcases" API
evaluationRouter.post("/evaluate", evaluationController.evaluateSubmission);

export default evaluationRouter;
