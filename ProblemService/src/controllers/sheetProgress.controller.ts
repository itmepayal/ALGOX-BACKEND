import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { sheetProgressService } from "../services/sheetProgress.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";

export class SheetProgressController {
  async getProgress(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required");
      const sheetId = String(req.params.sheetId || "");
      const data = await sheetProgressService.getProgress(userId, sheetId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Sheet progress retrieved",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async resetProgress(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) throw new UnauthorizedError("Authentication required");
      const sheetId = String(req.params.sheetId || "");
      const data = await sheetProgressService.resetProgress(userId, sheetId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Sheet progress reset successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const sheetProgressController = new SheetProgressController();
