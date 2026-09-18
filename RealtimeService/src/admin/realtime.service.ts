import type { Server as SocketIOServer } from "socket.io";
import {
  getActiveConnectionCount,
  listConnections,
  listOnlineUsers,
  getConnection,
  serializeConnection,
  unregisterConnection,
} from "../socket/presence";
import { listRooms } from "../socket/rooms";
import { listEvents, eventBufferSize } from "../events/eventStream";
import { metrics } from "../metrics/metrics";
import { RealtimeEvents } from "../socket/events";
import { executeBroadcast, listRecentBroadcasts, type BroadcastBody } from "../broadcast/broadcast.service";
import { forwardAdminAudit } from "../utils/helpers/audit.client";
import { NotFoundError } from "../utils/errors/app.error";
import { pushEvent } from "../events/eventStream";
import type { RedisAdapterStatus } from "../config/redis.adapter";
import {
  getBroadcastPersistenceStatus,
  isMongoReady,
} from "../config/db.config";
import { onlinePresenceService } from "../services/onlinePresence.service";

let redisStatus: RedisAdapterStatus = { enabled: false, reason: "pending" };

export function setRedisStatus(status: RedisAdapterStatus): void {
  redisStatus = status;
}

export class RealtimeAdminService {
  async overview(io: SocketIOServer) {
    const m = metrics.snapshot();
    const memoryOnline = listOnlineUsers().length;
    let onlineUsers = memoryOnline;
    try {
      const presenceCount = await onlinePresenceService.getOnlineCount();
      // Prefer the higher of Redis vs this node's memory map so we never
      // under-report authenticated sockets visible on this gateway.
      onlineUsers = Math.max(presenceCount, memoryOnline);
    } catch {
      /* keep memory count */
    }
    const namedRooms = await listRooms(io);
    const broadcastPersistence = getBroadcastPersistenceStatus();
    return {
      service: "RealtimeService",
      adapter: redisStatus.enabled ? "redis" : "memory",
      adapterReason: redisStatus.reason ?? null,
      mongoBroadcastLogs: isMongoReady(),
      broadcastPersistence,
      activeConnections: m.activeConnections,
      peakConnections: m.peakConnections,
      onlineUsers,
      /** Named product rooms only (excludes per-socket private rooms). */
      activeRooms: namedRooms.length,
      /** Raw Socket.IO adapter room map size — not a product metric. */
      adapterRoomMapSize: io.sockets.adapter.rooms.size,
      eventBufferSize: eventBufferSize(),
      eventsPerSecond: m.eventsPerSecond,
      totalDisconnects: m.totalDisconnects,
      totalReconnects: m.totalReconnects,
      uptimeMs: m.uptimeMs,
      /** Not measured — clients must show Unavailable / Not tracked. */
      latencyP50Ms: null,
      latencyP95Ms: null,
      latencyP99Ms: null,
      avgLatencyMs: null,
      workerCpuPercent: null,
    };
  }

  users() {
    return listOnlineUsers();
  }

  connections() {
    return listConnections().map(serializeConnection);
  }

  async rooms(io: SocketIOServer) {
    return listRooms(io);
  }

  events(limit?: number) {
    return listEvents(limit);
  }

  async analytics() {
    const m = metrics.snapshot();
    const broadcastPersistence = getBroadcastPersistenceStatus();
    return {
      ...m,
      onlineUsers: listOnlineUsers().length,
      activeConnections: getActiveConnectionCount(),
      recentBroadcasts: await listRecentBroadcasts(20),
      mongoBroadcastLogs: isMongoReady(),
      broadcastPersistence,
      // Explicit nulls for UI "Unavailable / Not tracked"
      latencyP50Ms: null,
      latencyP95Ms: null,
      latencyP99Ms: null,
      avgLatencyMs: null,
      workerCpuPercent: null,
      activeRooms: null as null, // use overview.activeRooms (named rooms)
    };
  }

  async broadcast(
    io: SocketIOServer,
    body: BroadcastBody,
    actor: { userId: string; email?: string }
  ) {
    return executeBroadcast(io, body, actor);
  }

  async forceDisconnect(
    io: SocketIOServer,
    socketId: string,
    actor: { userId: string; email?: string },
    token: string
  ) {
    const before = getConnection(socketId);
    if (!before) {
      throw new NotFoundError("Connection not found");
    }

    const sock = io.sockets.sockets.get(socketId);
    if (sock) {
      sock.emit(RealtimeEvents.FORCE_DISCONNECT, {
        reason: "admin_disconnect",
        at: Date.now(),
      });
      sock.disconnect(true);
    }

    unregisterConnection(socketId);

    pushEvent({
      name: RealtimeEvents.FORCE_DISCONNECT,
      direction: "system",
      socketId,
      userId: before.userId,
      payload: { actorId: actor.userId },
    });

    await forwardAdminAudit({
      action: "realtime.connection.disconnect",
      resource: "realtime_connection",
      resourceId: socketId,
      before: {
        userId: before.userId,
        email: before.email,
        status: before.status,
      },
      after: { disconnected: true },
      token,
    });

    return { socketId, userId: before.userId, disconnected: true };
  }
}

export const realtimeAdminService = new RealtimeAdminService();
