import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { codeAnalysisService } from "../services/codeAnalysis.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";

function authHeader(req: AuthenticatedRequest) {
  return typeof req.headers.authorization === "string"
    ? req.headers.authorization
    : null;
}

export class CodeAnalysisController {
  analyze = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.user?.userId) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }
      const data = await codeAnalysisService.analyze(
        {
          code: req.body?.code,
          language: req.body?.language,
        },
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Static code analysis complete",
        data,
      });
    } catch (e) {
      next(e);
    }
  };
}

export const codeAnalysisController = new CodeAnalysisController();
