import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { aiAssistantService } from "../services/aiAssistant.service";
import { aiAssistSchema } from "../validators/ai.validator";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError, BadRequestError } from "../utils/errors/app.error";

function requireUserId(req: AuthenticatedRequest): string {
  const id = req.user?.userId;
  if (!id) throw new UnauthorizedError("Authentication required");
  return id;
}

function authHeader(req: AuthenticatedRequest): string | null {
  const h = req.headers.authorization;
  return typeof h === "string" ? h : null;
}

export class AiAssistantController {
  async usage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await aiAssistantService.getUsage(
        requireUserId(req),
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "AI usage retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async history(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const limit = Number(req.query.limit) || 30;
      const data = await aiAssistantService.getHistory(
        requireUserId(req),
        authHeader(req),
        limit
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "AI history retrieved",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async assist(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      // Reject client quota / key spoof fields
      if (
        req.body?.quota !== undefined ||
        req.body?.used !== undefined ||
        req.body?.remaining !== undefined ||
        req.body?.accessTier !== undefined ||
        req.body?.apiKey !== undefined ||
        req.body?.OPENAI_API_KEY !== undefined ||
        req.body?.GEMINI_API_KEY !== undefined
      ) {
        throw new BadRequestError(
          "Client quota/API key fields are not accepted; server tracks usage"
        );
      }
      const body = aiAssistSchema.parse(req.body || {});
      const data = await aiAssistantService.assist(
        requireUserId(req),
        body,
        authHeader(req)
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "AI assist completed",
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  /** Another user's history must never be readable — owner scoped only. */
  async historyForbiddenOther(
    _req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      res.status(403).json({
        success: false,
        message: "Cannot access another user's AI history",
      });
    } catch (err) {
      next(err);
    }
  }
}

export const aiAssistantController = new AiAssistantController();
