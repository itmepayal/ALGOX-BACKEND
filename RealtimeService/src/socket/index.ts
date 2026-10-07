import type { Server as SocketIOServer, Socket } from "socket.io";
import { z } from "zod";
import { socketAuthMiddleware } from "./auth";
import { RealtimeEvents } from "./events";
import {
  registerConnection,
  unregisterConnection,
  updatePresence,
  touchActivity,
  getSocketsForUser,
} from "./presence";
import { joinRoom, leaveRoom } from "./rooms";
import { clearSocketRateLimits, withRateLimit } from "./rateLimit";
import { pushEvent } from "../events/eventStream";
import { onlinePresenceService } from "../services/onlinePresence.service";
import logger from "../config/logger.config";
import { codingSessionService, CodingSessionError } from "../services/codingSession.service";

const presenceSchema = z.object({
  currentPage: z.string().max(200).nullable().optional(),
  currentProblem: z.string().max(100).nullable().optional(),
  status: z.enum(["ONLINE", "IDLE", "RECONNECTING"]).optional(),
});

const roomSchema = z.object({
  room: z.string().min(3).max(200),
});

const codingCreateSchema = z.object({
  problemId: z.string().trim().min(1).max(100),
  mode: z.enum(["replay", "collaborative"]),
  language: z.string().trim().min(1).max(40),
  code: z.string().max(20_000),
  inviteeIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(20).optional(),
});
const codingJoinSchema = z.object({ sessionId: z.string().regex(/^[a-f\d]{24}$/i) });
const codingUpdateSchema = z.object({
  sessionId: z.string().regex(/^[a-f\d]{24}$/i),
  eventId: z.string().min(8).max(100),
  baseRevision: z.number().int().nonnegative(),
  code: z.string().max(20_000),
  cursor: z.object({ line: z.number().int().min(1), column: z.number().int().min(1) }).optional(),
});
const codingCompleteSchema = z.object({
  sessionId: z.string().regex(/^[a-f\d]{24}$/i),
  status: z.enum(["completed", "cancelled"]),
});
const codingControlSchema = z.object({
  sessionId: z.string().regex(/^[a-f\d]{24}$/i),
  action: z.enum(["pause", "resume"]),
});
const codingCursorSchema = z.object({
  sessionId: z.string().regex(/^[a-f\d]{24}$/i),
  line: z.number().int().min(1).max(100_000),
  column: z.number().int().min(1).max(10_000),
});

function codingError(err: unknown) {
  if (err instanceof CodingSessionError) {
    const status = err.code === "INVALID" ? 422 : err.code === "NOT_FOUND" ? 404 : err.code === "FORBIDDEN" ? 403 : 409;
    return { ok: false, status, code: err.code, error: err.message };
  }
  logger.error("Coding session operation failed", { error: err instanceof Error ? err.message : String(err) });
  return { ok: false, status: 503, code: "UNAVAILABLE", error: "Coding session service is unavailable" };
}

let ioRef: SocketIOServer | null = null;
let lastBroadcastCount = -1;

export function getIO(): SocketIOServer {
  if (!ioRef) throw new Error("Socket.IO not initialized");
  return ioRef;
}

async function broadcastPresenceCount(
  io: SocketIOServer,
  force = false
): Promise<number> {
  const onlineUsers = await onlinePresenceService.getOnlineCount();
  if (!force && onlineUsers === lastBroadcastCount) return onlineUsers;
  lastBroadcastCount = onlineUsers;
  io.emit(RealtimeEvents.PRESENCE_COUNT, { onlineUsers });
  return onlineUsers;
}

export function attachSocketHandlers(io: SocketIOServer): void {
  ioRef = io;
  io.use(socketAuthMiddleware);

  // Periodic stale presence cleanup (Redis TTL safety net)
  setInterval(() => {
    void onlinePresenceService.cleanupStaleUsers().then(async () => {
      try {
        await broadcastPresenceCount(io, false);
      } catch {
        /* ignore */
      }
    });
  }, 45_000).unref?.();

  io.on(RealtimeEvents.CONNECTION, (socket: Socket) => {
    const user = socket.data.user;
    const isReconnect = Boolean(socket.handshake.auth?.reconnecting);

    registerConnection({
      socketId: socket.id,
      userId: user.userId,
      email: user.email,
      role: user.role,
      userAgent: socket.handshake.headers["user-agent"],
      ip: socket.handshake.address,
      isReconnect,
    });

    // Personal + role rooms
    void socket.join(`user:${user.userId}`);
    void socket.join(`role:${user.role}`);

    void (async () => {
      const onlineUsers = await onlinePresenceService.addSocket(
        user.userId,
        socket.id
      );
      lastBroadcastCount = onlineUsers;
      socket.emit(RealtimeEvents.PRESENCE_COUNT, { onlineUsers });
      io.emit(RealtimeEvents.PRESENCE_COUNT, { onlineUsers });
    })();

    pushEvent({
      name: RealtimeEvents.USER_ONLINE,
      direction: "system",
      socketId: socket.id,
      userId: user.userId,
      payload: { role: user.role },
    });

    socket.emit(RealtimeEvents.USER_ONLINE, {
      userId: user.userId,
      socketId: socket.id,
      at: Date.now(),
    });

    socket.on(
      RealtimeEvents.PRESENCE_GET,
      withRateLimit(
        socket,
        RealtimeEvents.PRESENCE_GET,
        async (_raw, ack?: (r: unknown) => void) => {
          try {
            const onlineUsers = await onlinePresenceService.getOnlineCount();
            const payload = { onlineUsers };
            socket.emit(RealtimeEvents.PRESENCE_COUNT, payload);
            ack?.(payload);
          } catch {
            ack?.({ onlineUsers: null, error: "unavailable" });
          }
        },
        { max: 20, windowMs: 10_000 }
      )
    );

    socket.on(
      RealtimeEvents.HEARTBEAT,
      withRateLimit(
        socket,
        RealtimeEvents.HEARTBEAT,
        async () => {
          touchActivity(socket.id);
          await onlinePresenceService.heartbeat(user.userId);
        },
        { max: 30, windowMs: 10_000 }
      )
    );

    socket.on(
      RealtimeEvents.PRESENCE_UPDATE,
      withRateLimit(
        socket,
        RealtimeEvents.PRESENCE_UPDATE,
        async (raw) => {
          const parsed = presenceSchema.safeParse(raw);
          if (!parsed.success) return;
          updatePresence(socket.id, parsed.data);
          await onlinePresenceService.heartbeat(user.userId);
          pushEvent({
            name: RealtimeEvents.PRESENCE_UPDATE,
            direction: "in",
            socketId: socket.id,
            userId: user.userId,
            payload: parsed.data,
          });
        },
        { max: 40, windowMs: 10_000 }
      )
    );

    socket.on(
      RealtimeEvents.ROOM_JOIN,
      withRateLimit(
        socket,
        RealtimeEvents.ROOM_JOIN,
        async (raw, ack?: (r: unknown) => void) => {
          try {
            const { room } = roomSchema.parse(raw);
            await joinRoom(socket, room);
            pushEvent({
              name: RealtimeEvents.ROOM_JOIN,
              direction: "in",
              socketId: socket.id,
              userId: user.userId,
              room,
            });
            ack?.({ ok: true, room });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to join room";
            ack?.({ ok: false, error: message });
          }
        },
        { max: 30, windowMs: 10_000 }
      )
    );

    socket.on(
      RealtimeEvents.ROOM_LEAVE,
      withRateLimit(
        socket,
        RealtimeEvents.ROOM_LEAVE,
        async (raw, ack?: (r: unknown) => void) => {
          try {
            const { room } = roomSchema.parse(raw);
            await leaveRoom(socket, room);
            pushEvent({
              name: RealtimeEvents.ROOM_LEAVE,
              direction: "in",
              socketId: socket.id,
              userId: user.userId,
              room,
            });
            ack?.({ ok: true, room });
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Failed to leave room";
            ack?.({ ok: false, error: message });
          }
        },
        { max: 30, windowMs: 10_000 }
      )
    );

    socket.on(RealtimeEvents.CODING_CREATE, withRateLimit(socket, RealtimeEvents.CODING_CREATE, async (raw, ack?: (r: unknown) => void) => {
      try {
        const input = codingCreateSchema.parse(raw);
        const session = await codingSessionService.create({ ...input, userId: user.userId });
        await socket.join(`coding:${session.id}`);
        ack?.({ ok: true, session });
      } catch (err) {
        ack?.(codingError(err));
      }
    }, { max: 5, windowMs: 60_000 }));

    socket.on(RealtimeEvents.CODING_JOIN, withRateLimit(socket, RealtimeEvents.CODING_JOIN, async (raw, ack?: (r: unknown) => void) => {
      try {
        const input = codingJoinSchema.parse(raw);
        const session = await codingSessionService.join(input.sessionId, user.userId);
        await socket.join(`coding:${session.id}`);
        ack?.({ ok: true, session });
      } catch (err) {
        ack?.(codingError(err));
      }
    }, { max: 20, windowMs: 10_000 }));

    socket.on(RealtimeEvents.CODING_UPDATE, withRateLimit(socket, RealtimeEvents.CODING_UPDATE, async (raw, ack?: (r: unknown) => void) => {
      try {
        const input = codingUpdateSchema.parse(raw);
        const update = await codingSessionService.update({ ...input, userId: user.userId });
        if (!update.duplicate) socket.to(`coding:${update.id}`).emit(RealtimeEvents.CODING_STATE, update);
        ack?.({ ok: true, ...update });
      } catch (err) {
        ack?.(codingError(err));
      }
    }, { max: 8, windowMs: 5_000 }));

    socket.on(RealtimeEvents.CODING_COMPLETE, withRateLimit(socket, RealtimeEvents.CODING_COMPLETE, async (raw, ack?: (r: unknown) => void) => {
      try {
        const input = codingCompleteSchema.parse(raw);
        const session = await codingSessionService.complete(input.sessionId, user.userId, input.status);
        io.to(`coding:${session.id}`).emit(RealtimeEvents.CODING_STATE, session);
        ack?.({ ok: true, session });
      } catch (err) {
        ack?.(codingError(err));
      }
    }, { max: 5, windowMs: 60_000 }));

    socket.on(RealtimeEvents.CODING_CONTROL, withRateLimit(socket, RealtimeEvents.CODING_CONTROL, async (raw, ack?: (r: unknown) => void) => {
      try {
        const input = codingControlSchema.parse(raw);
        const session = await codingSessionService.setPaused(input.sessionId, user.userId, input.action === "pause");
        io.to(`coding:${session.id}`).emit(RealtimeEvents.CODING_STATE, session);
        ack?.({ ok: true, session });
      } catch (err) {
        ack?.(codingError(err));
      }
    }, { max: 10, windowMs: 60_000 }));

    socket.on(RealtimeEvents.CODING_CURSOR, withRateLimit(socket, RealtimeEvents.CODING_CURSOR, async (raw) => {
      try {
        const input = codingCursorSchema.parse(raw);
        await codingSessionService.assertParticipant(input.sessionId, user.userId);
        socket.to(`coding:${input.sessionId}`).emit(RealtimeEvents.CODING_CURSOR_STATE, {
          sessionId: input.sessionId,
          userId: user.userId,
          line: input.line,
          column: input.column,
        });
      } catch { /* Invalid, expired, or unauthorized cursor events are ignored. */ }
    }, { max: 20, windowMs: 10_000 }));

    socket.on(RealtimeEvents.DISCONNECT, (reason) => {
      clearSocketRateLimits(socket.id);
      const rec = unregisterConnection(socket.id);
      pushEvent({
        name: RealtimeEvents.USER_OFFLINE,
        direction: "system",
        socketId: socket.id,
        userId: user.userId,
        payload: { reason },
      });

      void (async () => {
        const onlineUsers = await onlinePresenceService.removeSocket(
          user.userId,
          socket.id
        );
        lastBroadcastCount = onlineUsers;
        io.emit(RealtimeEvents.PRESENCE_COUNT, { onlineUsers });

        // Only emit offline if no remaining sockets for user
        if (getSocketsForUser(user.userId).length === 0) {
          io.to(`user:${user.userId}`).emit(RealtimeEvents.USER_OFFLINE, {
            userId: user.userId,
            at: Date.now(),
          });
        }
      })();

      logger.info("Socket disconnected", {
        socketId: socket.id,
        userId: user.userId,
        reason,
        hadRecord: Boolean(rec),
      });
    });
  });
}
