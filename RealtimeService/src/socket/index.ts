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

const presenceSchema = z.object({
  currentPage: z.string().max(200).nullable().optional(),
  currentProblem: z.string().max(100).nullable().optional(),
  status: z.enum(["ONLINE", "IDLE", "RECONNECTING"]).optional(),
});

const roomSchema = z.object({
  room: z.string().min(3).max(200),
});

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
