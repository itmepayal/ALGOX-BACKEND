import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { getUserSkillProfile, recalculateUserSkills } from "../services/skill.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { UnauthorizedError } from "../utils/errors/app.error";

export class SkillController {
  getMyProfile = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }
      const data = await getUserSkillProfile(req.user.userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "User topic skill profile retrieved",
        data,
      });
    } catch (e) {
      next(e);
    }
  };

  recalculateMyProfile = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.user?.userId) {
        throw new UnauthorizedError("Authentication required");
      }
      await recalculateUserSkills(req.user.userId);
      const data = await getUserSkillProfile(req.user.userId);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "User topic skill profile recalculated",
        data,
      });
    } catch (e) {
      next(e);
    }
  };
}

export const skillController = new SkillController();
