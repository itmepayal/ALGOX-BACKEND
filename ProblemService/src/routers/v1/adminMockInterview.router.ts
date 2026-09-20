import express from "express";
import {
  authenticateJwt,
  requirePermission,
} from "../../middlewares/auth.middleware";
import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../../middlewares/auth.middleware";
import {
  getMockInterviewAdminDetail,
  getMockInterviewAdminOverview,
} from "../../services/mockInterviewAdmin.service";
import { sendResponse } from "../../utils/helpers/response.helper";
import { HTTP_STATUS } from "../../utils/constants";
import { NotFoundError } from "../../utils/errors/app.error";

const adminMockInterviewRouter = express.Router();

adminMockInterviewRouter.use(authenticateJwt);

adminMockInterviewRouter.get(
  "/overview",
  requirePermission("analytics:view"),
  async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await getMockInterviewAdminOverview();
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Mock interview admin overview",
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);

adminMockInterviewRouter.get(
  "/:sessionId",
  requirePermission("analytics:view", "users:view"),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await getMockInterviewAdminDetail(String(req.params.sessionId));
      if (!data) throw new NotFoundError("Mock interview session not found");
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Mock interview detail",
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default adminMockInterviewRouter;
