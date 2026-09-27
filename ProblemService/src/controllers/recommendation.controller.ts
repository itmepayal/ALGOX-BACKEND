import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { getAdaptiveRecommendations } from "../services/recommendation.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";

export class RecommendationController {
  getRecommendations = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }

      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 5;
      const topic = req.query.topic ? String(req.query.topic) : undefined;
      const difficulty = req.query.difficulty ? String(req.query.difficulty) : undefined;

      const data = await getAdaptiveRecommendations(req.user.userId, {
        limit,
        topic,
        difficulty,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Adaptive problem recommendations generated",
        data,
      });
    } catch (e) {
      next(e);
    }
  };
}

export const recommendationController = new RecommendationController();
