import { z } from "zod";
import type { Server as SocketIOServer } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import {
  BroadcastLog,
  memoryBroadcastLogs,
  pushMemoryBroadcast,
  type BroadcastTargetType,
  type MemoryBroadcastRecord,
} from "../models/broadcastLog.model";
import { isMongoReady } from "../config/db.config";
import logger from "../config/logger.config";
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
  /** Honest persistence mode — never claims mongo unless write succeeded. */
  persisted: "mongo" | "memory";
}

export type RecentBroadcastView = {
  id: string;
  event: string;
  message: string;
  targetType: BroadcastTargetType;
  targetIds: string[];
  actorId: string;
  actorEmail?: string;
  sent: number;
  delivered: number;
  failed: number;
  payload?: Record<string, unknown>;
  createdAt: number | string | Date;
  /** Source of the row — admin UI can show durable vs session-only. */
  source: "mongo" | "memory";
};

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

function toMemoryView(rec: MemoryBroadcastRecord): RecentBroadcastView {
  return { ...rec, source: "memory" };
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
  const recordBase = {
    event: parsed.event,
    message: parsed.message,
    targetType: parsed.target as BroadcastTargetType,
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
  };

  if (isMongoReady()) {
    try {
      const doc = await BroadcastLog.create(recordBase);
      return {
        id: String(doc._id),
        event: parsed.event,
        targetType: parsed.target,
        sent,
        delivered,
        failed,
        persisted: "mongo",
      };
    } catch (err) {
      logger.warn("BroadcastLog Mongo write failed — falling back to memory", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  pushMemoryBroadcast({
    id,
    ...recordBase,
    createdAt: Date.now(),
  });

  return {
    id,
    event: parsed.event,
    targetType: parsed.target,
    sent,
    delivered,
    failed,
    persisted: "memory",
  };
}

/**
 * Prefer durable Mongo logs when connected; otherwise in-memory session logs.
 * Never merges sources in a way that implies Mongo durability for memory rows.
 */
export async function listRecentBroadcasts(
  limit = 50
): Promise<RecentBroadcastView[]> {
  const cap = Math.min(Math.max(limit, 1), 200);

  if (isMongoReady()) {
    try {
      const docs = await BroadcastLog.find()
        .sort({ createdAt: -1 })
        .limit(cap)
        .lean()
        .exec();
      return docs.map((d) => ({
        id: String(d._id),
        event: d.event,
        message: d.message,
        targetType: d.targetType,
        targetIds: d.targetIds || [],
        actorId: d.actorId,
        actorEmail: d.actorEmail,
        sent: d.sent,
        delivered: d.delivered,
        failed: d.failed,
        payload: d.payload as Record<string, unknown> | undefined,
        createdAt: d.createdAt,
        source: "mongo" as const,
      }));
    } catch (err) {
      logger.warn("BroadcastLog Mongo list failed — using memory", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return memoryBroadcastLogs.slice(0, cap).map(toMemoryView);
}
