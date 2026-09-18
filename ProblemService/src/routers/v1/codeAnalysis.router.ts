import express from "express";
import { authenticateJwt } from "../../middlewares/auth.middleware";
import { codeAnalysisController } from "../../controllers/codeAnalysis.controller";

const codeAnalysisRouter = express.Router();

codeAnalysisRouter.post(
  "/analyze",
  authenticateJwt,
  codeAnalysisController.analyze.bind(codeAnalysisController)
);

export default codeAnalysisRouter;
