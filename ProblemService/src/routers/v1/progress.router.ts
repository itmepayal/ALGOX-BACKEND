import express from "express";
import { authenticateJwt } from "../../middlewares/auth.middleware";
import { progressImportController } from "../../controllers/progressImport.controller";

const progressRouter = express.Router();

progressRouter.get(
  "/import/status",
  authenticateJwt,
  progressImportController.getStatus.bind(progressImportController)
);

progressRouter.post(
  "/import/preview",
  authenticateJwt,
  progressImportController.preview.bind(progressImportController)
);

progressRouter.post(
  "/import",
  authenticateJwt,
  progressImportController.importProgress.bind(progressImportController)
);

export default progressRouter;
