import express from "express";
import { authenticateJwt } from "../../middlewares/auth.middleware";
import { recommendationController } from "../../controllers/recommendation.controller";

const recommendationRouter = express.Router();

recommendationRouter.get("/me", authenticateJwt, recommendationController.getRecommendations);
recommendationRouter.get("/", authenticateJwt, recommendationController.getRecommendations);

export default recommendationRouter;
