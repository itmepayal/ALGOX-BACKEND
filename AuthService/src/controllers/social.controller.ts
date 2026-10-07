import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { socialService } from "../services/social.service";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { BadRequestError, UnauthorizedError } from "../utils/errors/app.error";

export class SocialController {
  private userId(req: AuthenticatedRequest) {
    if (!req.user?.userId) throw new UnauthorizedError("Authentication required");
    return req.user.userId;
  }
  private async run(req: AuthenticatedRequest, res: Response, next: NextFunction, message: string, action: (userId: string) => Promise<unknown>) {
    try {
      const data = await action(this.userId(req));
      sendResponse({ res, statusCode: HTTP_STATUS.OK, message, data });
    } catch (error) { next(error); }
  }
  discover = (req: AuthenticatedRequest, res: Response, next: NextFunction) => this.run(req, res, next, "Users retrieved", (userId) => socialService.discover(userId, String(req.query.q || "")));
  sendRequest = (req: AuthenticatedRequest, res: Response, next: NextFunction) => this.run(req, res, next, "Friend request sent", (userId) => socialService.sendFriendRequest(userId, String(req.body?.userId || "")));
  requests = (req: AuthenticatedRequest, res: Response, next: NextFunction) => this.run(req, res, next, "Friend requests retrieved", (userId) => {
    const direction = String(req.query.direction || "incoming");
    if (direction !== "incoming" && direction !== "outgoing") throw new BadRequestError("direction must be incoming or outgoing");
    return socialService.listRequests(userId, direction);
  });
  respond = (action: "accept" | "reject" | "cancel") => (req: AuthenticatedRequest, res: Response, next: NextFunction) => this.run(req, res, next, `Friend request ${action}ed`, (userId) => socialService.respondToRequest(userId, String(req.params.requestId), action));
  friends = (req: AuthenticatedRequest, res: Response, next: NextFunction) => this.run(req, res, next, "Friends retrieved", (userId) => socialService.friends(userId));
  removeFriend = (req: AuthenticatedRequest, res: Response, next: NextFunction) => this.run(req, res, next, "Friend removed", (userId) => socialService.removeFriend(userId, String(req.params.userId)));
  follow = (req: AuthenticatedRequest, res: Response, next: NextFunction) => this.run(req, res, next, "User followed", (userId) => socialService.follow(userId, String(req.params.userId)));
  unfollow = (req: AuthenticatedRequest, res: Response, next: NextFunction) => this.run(req, res, next, "User unfollowed", (userId) => socialService.unfollow(userId, String(req.params.userId)));
  followers = (req: AuthenticatedRequest, res: Response, next: NextFunction) => this.run(req, res, next, "Followers retrieved", (userId) => socialService.listFollowUsers(userId, "followers"));
  following = (req: AuthenticatedRequest, res: Response, next: NextFunction) => this.run(req, res, next, "Following retrieved", (userId) => socialService.listFollowUsers(userId, "following"));
  activity = (req: AuthenticatedRequest, res: Response, next: NextFunction) => this.run(req, res, next, "Activity retrieved", (userId) => {
    const limit = Number(req.query.limit || 30);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new BadRequestError("limit must be between 1 and 50");
    return socialService.activity(userId, limit, req.query.before ? String(req.query.before) : undefined);
  });
}

export const socialController = new SocialController();
