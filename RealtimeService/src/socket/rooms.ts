import type { Socket } from "socket.io";
import { hasAnyPermission, isStaffRole, type Permission } from "../rbac/permissions";
import { addRoom, removeRoom, touchActivity } from "./presence";
import { ForbiddenError, BadRequestError } from "../utils/errors/app.error";

export type RoomKind =
  | "problem"
  | "contest"
  | "leaderboard"
  | "discussion"
  | "user"
  | "admin"
  | "system";

const ROOM_RE =
  /^(problem|contest|leaderboard|discussion|user|admin|system):([A-Za-z0-9_\-:]+)$/;

export function parseRoom(room: string): { kind: RoomKind; id: string } | null {
  const m = room.match(ROOM_RE);
  if (!m) return null;
  return { kind: m[1] as RoomKind, id: m[2] };
}

export function authorizeRoomJoin(
  user: { userId: string; role: string },
  room: string
): void {
  const parsed = parseRoom(room);
  if (!parsed) {
    throw new BadRequestError(
      "Invalid room. Expected kind:id (problem|contest|leaderboard|discussion|user|admin|system)"
    );
  }

  const { kind, id } = parsed;

  switch (kind) {
    case "user":
      if (id !== user.userId && !isStaffRole(user.role)) {
        throw new ForbiddenError("Cannot join another user's private room");
      }
      return;
    case "admin":
      if (
        !hasAnyPermission(user.role, [
          "realtime:view",
          "admin:view",
        ] as Permission[])
      ) {
        throw new ForbiddenError("Admin room requires staff realtime access");
      }
      return;
    case "system":
      if (
        !hasAnyPermission(user.role, [
          "realtime:security",
          "realtime:debug",
          "admin:view",
        ] as Permission[])
      ) {
        throw new ForbiddenError("System room restricted");
      }
      return;
    case "problem":
    case "contest":
    case "leaderboard":
    case "discussion":
      return;
    default:
      throw new ForbiddenError("Unknown room kind");
  }
}

export async function joinRoom(socket: Socket, room: string): Promise<string> {
  const user = socket.data.user;
  if (!user) throw new ForbiddenError("Not authenticated");

  authorizeRoomJoin(user, room);
  await socket.join(room);
  addRoom(socket.id, room);
  touchActivity(socket.id);
  return room;
}

export async function leaveRoom(socket: Socket, room: string): Promise<string> {
  await socket.leave(room);
  removeRoom(socket.id, room);
  touchActivity(socket.id);
  return room;
}

/** Aggregate room membership from Socket.IO adapter (local view). */
export async function listRooms(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  io: { sockets: { adapter: { rooms: Map<string, Set<string>> } } }
): Promise<
  Array<{
    room: string;
    kind: RoomKind | "unknown";
    size: number;
    members: string[];
  }>
> {
  const out: Array<{
    room: string;
    kind: RoomKind | "unknown";
    size: number;
    members: string[];
  }> = [];

  for (const [name, members] of io.sockets.adapter.rooms.entries()) {
    if (members.has(name) && members.size === 1) continue;
    const parsed = parseRoom(name);
    out.push({
      room: name,
      kind: parsed?.kind ?? "unknown",
      size: members.size,
      members: [...members],
    });
  }

  out.sort((a, b) => b.size - a.size);
  return out;
}
