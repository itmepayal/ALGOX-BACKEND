import { Response, NextFunction } from "express";
import {
  AuthenticatedRequest,
} from "../middlewares/auth.middleware";
import { realtimeAdminService } from "./realtime.service";
import { getIO } from "../socket";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS, REALTIME_MESSAGES } from "../utils/constants";
import { broadcastBodySchema } from "../broadcast/broadcast.service";
import { UnauthorizedError } from "../utils/errors/app.error";

export class RealtimeAdminController {
  overview(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = realtimeAdminService.overview(getIO());
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: REALTIME_MESSAGES.OVERVIEW_OK,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  users(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: REALTIME_MESSAGES.USERS_OK,
        data: realtimeAdminService.users(),
      });
    } catch (err) {
      next(err);
    }
  }

  connections(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: REALTIME_MESSAGES.CONNECTIONS_OK,
        data: realtimeAdminService.connections(),
      });
    } catch (err) {
      next(err);
    }
  }

  async rooms(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const data = await realtimeAdminService.rooms(getIO());
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: REALTIME_MESSAGES.ROOMS_OK,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  events(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const limit = Number(req.query.limit) || 100;
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: REALTIME_MESSAGES.EVENTS_OK,
        data: realtimeAdminService.events(limit),
      });
    } catch (err) {
      next(err);
    }
  }

  analytics(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: REALTIME_MESSAGES.ANALYTICS_OK,
        data: realtimeAdminService.analytics(),
      });
    } catch (err) {
      next(err);
    }
  }

  async broadcast(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new UnauthorizedError();
      const body = broadcastBodySchema.parse(req.body);
      const data = await realtimeAdminService.broadcast(getIO(), body, {
        userId: req.user.userId,
        email: req.user.email,
      });
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: REALTIME_MESSAGES.BROADCAST_OK,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async disconnect(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user || !req.accessToken) throw new UnauthorizedError();
      const socketId = String(req.params.id);
      const data = await realtimeAdminService.forceDisconnect(
        getIO(),
        socketId,
        { userId: req.user.userId, email: req.user.email },
        req.accessToken
      );
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: REALTIME_MESSAGES.DISCONNECT_OK,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const realtimeAdminController = new RealtimeAdminController();
