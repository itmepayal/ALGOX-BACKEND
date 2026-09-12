import { z } from "zod";
import type { Server as SocketIOServer } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import {
  BroadcastLog,
  memoryBroadcastLogs,
  pushMemoryBroadcast,
  type BroadcastTargetType,
} from "../models/broadcastLog.model";
import { isMongoReady } from "../config/db.config";
import {
  getActiveConnectionCount,
  getSocketsForRoles,
  getSocketsForUser,
  listConnections,
} from "../socket/presence";
import { RealtimeEvents } from "../socket/events";
import { pushEvent } from "../events/eventStream";
import { BadRequestError } from "../utils/errors/app.error";

export const broadcastBodySchema = z.object({
  event: z
    .string()
    .min(1)
    .max(100)
    .default(RealtimeEvents.SYSTEM_BROADCAST),
  message: z.string().min(1).max(4000),
  title: z.string().max(200).optional(),
  target: z.enum(["everyone", "online", "users", "roles", "contest"]),
  userIds: z.array(z.string().min(1)).max(500).optional(),
  roles: z.array(z.string().min(1)).max(20).optional(),
  contestId: z.string().min(1).max(100).optional(),
  payload: z.record(z.unknown()).optional(),
});

export type BroadcastBody = z.infer<typeof broadcastBodySchema>;

export interface BroadcastResult {
  id: string;
  event: string;
  targetType: BroadcastTargetType;
  sent: number;
  delivered: number;
  failed: number;
  persisted: "mongo" | "memory";
}

function resolveTargets(
  io: SocketIOServer,
  body: BroadcastBody
): { socketIds: string[]; room?: string } {
  switch (body.target) {
    case "everyone":
      return { socketIds: [...io.sockets.sockets.keys()] };
    case "online":
      return { socketIds: listConnections().map((c) => c.socketId) };
    case "users": {
      if (!body.userIds?.length) {
        throw new BadRequestError("userIds required when target=users");
      }
      const ids = new Set<string>();
      for (const uid of body.userIds) {
        for (const sid of getSocketsForUser(uid)) ids.add(sid);
      }
      return { socketIds: [...ids] };
    }
    case "roles": {
      if (!body.roles?.length) {
        throw new BadRequestError("roles required when target=roles");
      }
      return { socketIds: getSocketsForRoles(body.roles) };
    }
    case "contest": {
      if (!body.contestId) {
        throw new BadRequestError("contestId required when target=contest");
      }
      const room = `contest:${body.contestId}`;
      return { socketIds: [], room };
    }
    default:
      throw new BadRequestError("Invalid broadcast target");
  }
}

export async function executeBroadcast(
  io: SocketIOServer,
  body: BroadcastBody,
  actor: { userId: string; email?: string }
): Promise<BroadcastResult> {
  const parsed = broadcastBodySchema.parse(body);
  const { socketIds, room } = resolveTargets(io, parsed);

  const envelope = {
    title: parsed.title,
    message: parsed.message,
    at: Date.now(),
    ...(parsed.payload || {}),
  };

  let sent = 0;
  let delivered = 0;
  let failed = 0;

  if (room) {
    const size = io.sockets.adapter.rooms.get(room)?.size ?? 0;
    io.to(room).emit(parsed.event, envelope);
    sent = size;
    delivered = size;
  } else {
    for (const sid of socketIds) {
      sent += 1;
      try {
        const sock = io.sockets.sockets.get(sid);
        if (!sock) {
          failed += 1;
          continue;
        }
        sock.emit(parsed.event, envelope);
        delivered += 1;
      } catch {
        failed += 1;
      }
    }
  }

  pushEvent({
    name: parsed.event,
    direction: "out",
    payload: {
      target: parsed.target,
      message: parsed.message,
      sent,
      delivered,
      failed,
      activeConnections: getActiveConnectionCount(),
    },
  });

  const id = uuidv4();
  let persisted: "mongo" | "memory" = "memory";

  if (isMongoReady()) {
    try {
      const doc = await BroadcastLog.create({
        event: parsed.event,
        message: parsed.message,
        targetType: parsed.target,
        targetIds:
          parsed.userIds ||
          parsed.roles ||
          (parsed.contestId ? [parsed.contestId] : []),
        actorId: actor.userId,
        actorEmail: actor.email,
        sent,
        delivered,
        failed,
        payload: envelope,
      });
      return {
        id: String(doc._id),
        event: parsed.event,
        targetType: parsed.target,
        sent,
        delivered,
        failed,
        persisted: "mongo",
      };
    } catch {
      persisted = "memory";
    }
  }

  pushMemoryBroadcast({
    id,
    event: parsed.event,
    message: parsed.message,
    targetType: parsed.target,
    targetIds:
      parsed.userIds ||
      parsed.roles ||
      (parsed.contestId ? [parsed.contestId] : []),
    actorId: actor.userId,
    actorEmail: actor.email,
    sent,
    delivered,
    failed,
    payload: envelope,
    createdAt: Date.now(),
  });

  return {
    id,
    event: parsed.event,
    targetType: parsed.target,
    sent,
    delivered,
    failed,
    persisted,
  };
}

export function listRecentBroadcasts(limit = 50) {
  return memoryBroadcastLogs.slice(0, limit);
}
