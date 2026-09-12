import { Response, NextFunction } from "express";
import {
  AuthenticatedRequest,
} from "../middlewares/auth.middleware";
import { progressImportService } from "../services/progressImport.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";

function requireUserId(req: AuthenticatedRequest): string {
  const userId = req.user?.userId;
  if (!userId) throw new UnauthorizedError("Authentication required");
  return userId;
}

export class ProgressImportController {
  async getStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      const data = await progressImportService.getStatus(
        userId,
        req.headers.authorization
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Progress import status retrieved",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async preview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req);
      // Never trust body.userId — always JWT.
      const authHeader = req.headers.authorization;
      const data = await progressImportService.preview(userId, authHeader);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Import preview calculated",
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async importProgress(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      const userId = requireUserId(req);
      const authHeader = req.headers.authorization;
      const data = await progressImportService.importProgress(
        userId,
        authHeader
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Progress imported successfully",
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const progressImportController = new ProgressImportController();
