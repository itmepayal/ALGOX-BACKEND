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
import logger from "../config/logger.config";
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

function emitProgressionEvent(eventKey: string, userId: string, eventType: string, sourceId: string) {
  const base = serverConfig.AUTH_SERVICE_URL.replace(/\/$/, "");
  void fetch(`${base}/auth/internal/progression/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": serverConfig.INTERNAL_SERVICE_SECRET },
    body: JSON.stringify({ eventKey, userId, eventType, sourceId }),
    signal: AbortSignal.timeout(2500),
  }).then((response) => {
    if (!response.ok) logger.warn("Progression event rejected by AuthService", { status: response.status, eventType });
  }).catch((err) => logger.warn("Progression event fan-out failed", { eventType, error: err instanceof Error ? err.message : String(err) }));
}

ingestRouter.post(
  "/events",
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const secret =
      req.headers["x-realtime-secret"] || req.headers["x-internal-secret"];
    const configured = serverConfig.INTERNAL_SERVICE_SECRET;
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

      // Forward only facts from verified domain events. AuthService makes these writes idempotent.
      if (event === "battle:finished" && payload?.battleMode === "ranked" && typeof payload?.winnerId === "string" && typeof payload?.battleId === "string") {
        emitProgressionEvent(`battle:${payload.battleId}:${payload.winnerId}`, payload.winnerId, "battle_won", payload.battleId);
      }
      if (event === "contest.status_changed" && payload?.type === "participant.registered" && typeof payload?.userId === "string" && typeof payload?.contestId === "string") {
        emitProgressionEvent(`contest-participation:${payload.contestId}:${payload.userId}`, payload.userId, "contest_participation", payload.contestId);
      }
      if (event === "contest.status_changed" && payload?.type === "streak.milestone" && payload?.days === 30 && typeof payload?.userId === "string") {
        emitProgressionEvent(`streak:${payload.userId}:30`, payload.userId, "streak_milestone", "30");
      }
      if (event === "leaderboard.updated" && payload?.kind === "contest" && typeof payload?.contestId === "string" && Array.isArray(payload?.top)) {
        for (const row of payload.top) {
          if (Number(row?.rank) > 0 && Number(row?.rank) <= 10 && typeof row?.userId === "string") {
            emitProgressionEvent(`contest-top10:${payload.contestId}:${row.userId}`, row.userId, "contest_top10", payload.contestId);
          }
        }
      }

      try {
        const io = getIO();
        const data = { userId, status, ...(payload || {}) };
        // Targeted room (user/contest/…) when provided.
        if (room) io.to(room).emit(event, data);
        // Always mirror ingest to admin monitor so Live Submissions / Event Stream see it.
        io.to("admin:realtime").emit(event, data);
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
