import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { getIO } from "../socket";
import { pushEvent } from "../events/eventStream";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { BadRequestError } from "../utils/errors/app.error";
import {
  AuthenticatedRequest,
  authenticateJwt,
} from "../middlewares/auth.middleware";
import { serverConfig } from "../config";

const bodySchema = z.object({
  event: z.string().min(1).max(120),
  source: z.string().max(80).optional(),
  userId: z.string().optional(),
  room: z.string().optional(),
  status: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});

/**
 * Service-to-service event ingest for submission/execution/worker events.
 * Auth: x-realtime-secret / x-internal-secret required (fail closed).
 */
export const ingestRouter = Router();

ingestRouter.post(
  "/events",
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const secret =
      req.headers["x-realtime-secret"] || req.headers["x-internal-secret"];
    const configured = serverConfig.INTERNAL_SECRET;
    if (!configured) {
      return next(
        new BadRequestError(
          "Internal realtime secret is not configured — refusing ingest"
        )
      );
    }
    if (secret && secret === configured) return next();
    // Staff JWT fallback for admin tooling only
    return authenticateJwt(req, res, next);
  },
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) throw new BadRequestError("Invalid event payload");
      const { event, source, userId, room, status, payload } = parsed.data;

      pushEvent({
        name: event,
        direction: "in",
        userId,
        room,
        payload: {
          source: source || "ingest",
          status: status || "ok",
          ...(payload || {}),
        },
      });

      try {
        const io = getIO();
        const data = { userId, status, ...(payload || {}) };
        if (room) io.to(room).emit(event, data);
        else io.to("admin:realtime").emit(event, data);
      } catch {
        // Socket not ready — event still buffered for admin stream
      }

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: "Event accepted",
      });
    } catch (err) {
      next(err);
    }
  }
);
