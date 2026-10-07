import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { progressionService } from "../services/progression.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { UnauthorizedError, BadRequestError } from "../utils/errors/app.error";

const eventSchema = z.object({
  eventKey: z.string().min(1).max(180),
  userId: z.string().regex(/^[a-f\d]{24}$/i),
  eventType: z.enum(["problem_solved", "battle_won", "contest_participation", "contest_top10", "streak_milestone"]),
  sourceId: z.string().min(1).max(160),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

export class ProgressionController {
  async me(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.userId) throw new UnauthorizedError("Authentication required");
      const data = await progressionService.profile(req.user.userId);
      sendResponse({ res, statusCode: HTTP_STATUS.OK, message: "Progression retrieved", data });
    } catch (error) { next(error); }
  }

  async recordEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = eventSchema.safeParse(req.body);
      if (!parsed.success) throw new BadRequestError("Invalid progression event");
      const data = await progressionService.record(parsed.data);
      sendResponse({ res, statusCode: HTTP_STATUS.OK, message: "Progression event processed", data });
    } catch (error) { next(error); }
  }
}

export const progressionController = new ProgressionController();
