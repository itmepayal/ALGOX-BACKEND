import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import { getIO } from "../socket";
import { pushEvent } from "../events/eventStream";
import { sendResponse } from "../utils/helpers/response.helper";
import { HTTP_STATUS } from "../utils/constants";
import { BadRequestError, ForbiddenError } from "../utils/errors/app.error";
import {
  AuthenticatedRequest,
  authenticateJwt,
  requirePermission,
} from "../middlewares/auth.middleware";
import { serverConfig } from "../config";
import { KNOWN_EVENT_NAMES } from "../socket/events";

const ALLOWED_INGEST_EVENTS = new Set(KNOWN_EVENT_NAMES);

const bodySchema = z.object({
  event: z.string().min(1).max(120),
  source: z.string().max(80).optional(),
  userId: z.string().optional(),
  room: z.string().max(200).optional(),
  status: z.string().max(80).optional(),
  payload: z.record(z.unknown()).optional(),
});

/**
 * Service-to-service event ingest.
 * Auth: internal secret (preferred) OR staff JWT with realtime:broadcast|events.
 * Event names are allowlisted — never trust arbitrary client event strings.
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
    if (secret && secret === configured) {
      (req as any).__ingestViaSecret = true;
      return next();
    }
    // Staff JWT fallback for admin tooling only
    return authenticateJwt(req, res, (err?: any) => {
      if (err) return next(err);
      return requirePermission("realtime:broadcast", "realtime:events")(
        req,
        res,
        next
      );
    });
  },
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) throw new BadRequestError("Invalid event payload");
      const { event, source, userId, room, status, payload } = parsed.data;

      if (!ALLOWED_INGEST_EVENTS.has(event)) {
        throw new BadRequestError(`Event '${event}' is not allowed for ingest`);
      }

      // JWT path must not impersonate arbitrary users without broadcast permission
      // (already gated). Secret path is trusted service-to-service.
      if (!(req as any).__ingestViaSecret && !req.user) {
        throw new ForbiddenError("Unauthorized ingest");
      }

      pushEvent({
        name: event,
        direction: "in",
        userId,
        room,
        payload: {
          source: source || ((req as any).__ingestViaSecret ? "ingest" : "admin"),
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
