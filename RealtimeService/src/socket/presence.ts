import { serverConfig } from "../config";
import { metrics } from "../metrics/metrics";

export type PresenceStatus =
  | "ONLINE"
  | "IDLE"
  | "RECONNECTING"
  | "OFFLINE";

export interface ConnectionRecord {
  socketId: string;
  userId: string;
  email: string;
  role: string;
  connectedAt: number;
  lastActivity: number;
  currentPage: string | null;
  currentProblem: string | null;
  status: PresenceStatus;
  rooms: Set<string>;
  userAgent?: string;
  ip?: string;
}

export interface PresenceUpdate {
  currentPage?: string | null;
  currentProblem?: string | null;
  status?: Exclude<PresenceStatus, "OFFLINE">;
}

const connections = new Map<string, ConnectionRecord>();
const userSockets = new Map<string, Set<string>>();

export function registerConnection(input: {
  socketId: string;
  userId: string;
  email: string;
  role: string;
  userAgent?: string;
  ip?: string;
  isReconnect?: boolean;
}): ConnectionRecord {
  const now = Date.now();
  const record: ConnectionRecord = {
    socketId: input.socketId,
    userId: input.userId,
    email: input.email,
    role: input.role,
    connectedAt: now,
    lastActivity: now,
    currentPage: null,
    currentProblem: null,
    status: input.isReconnect ? "RECONNECTING" : "ONLINE",
    rooms: new Set(),
    userAgent: input.userAgent,
    ip: input.ip,
  };

  connections.set(input.socketId, record);

  let set = userSockets.get(input.userId);
  if (!set) {
    set = new Set();
    userSockets.set(input.userId, set);
  }
  set.add(input.socketId);

  metrics.onConnect(connections.size);
  if (input.isReconnect) metrics.onReconnect();

  // Brief RECONNECTING → ONLINE
  if (input.isReconnect) {
    setTimeout(() => {
      const cur = connections.get(input.socketId);
      if (cur && cur.status === "RECONNECTING") {
        cur.status = "ONLINE";
        cur.lastActivity = Date.now();
      }
    }, 1500);
  }

  return record;
}

export function unregisterConnection(socketId: string): ConnectionRecord | null {
  const record = connections.get(socketId);
  if (!record) return null;

  connections.delete(socketId);
  const set = userSockets.get(record.userId);
  if (set) {
    set.delete(socketId);
    if (set.size === 0) userSockets.delete(record.userId);
  }

  metrics.onDisconnect(connections.size);
  return { ...record, status: "OFFLINE", rooms: new Set(record.rooms) };
}

export function touchActivity(socketId: string): void {
  const record = connections.get(socketId);
  if (!record) return;
  record.lastActivity = Date.now();
  if (record.status === "IDLE" || record.status === "RECONNECTING") {
    record.status = "ONLINE";
  }
}

export function updatePresence(
  socketId: string,
  update: PresenceUpdate
): ConnectionRecord | null {
  const record = connections.get(socketId);
  if (!record) return null;

  if (update.currentPage !== undefined) record.currentPage = update.currentPage;
  if (update.currentProblem !== undefined) {
    record.currentProblem = update.currentProblem;
  }
  if (update.status) record.status = update.status;
  record.lastActivity = Date.now();
  return record;
}

export function addRoom(socketId: string, room: string): void {
  connections.get(socketId)?.rooms.add(room);
}

export function removeRoom(socketId: string, room: string): void {
  connections.get(socketId)?.rooms.delete(room);
}

export function getConnection(socketId: string): ConnectionRecord | undefined {
  return connections.get(socketId);
}

export function listConnections(): ConnectionRecord[] {
  refreshIdleStatuses();
  return Array.from(connections.values());
}

export function listOnlineUsers(): Array<{
  userId: string;
  email: string;
  role: string;
  status: PresenceStatus;
  connectionCount: number;
  socketIds: string[];
  currentPage: string | null;
  currentProblem: string | null;
  lastActivity: number;
}> {
  refreshIdleStatuses();
  const out: ReturnType<typeof listOnlineUsers> = [];

  for (const [userId, socketIds] of userSockets.entries()) {
    const records = [...socketIds]
      .map((id) => connections.get(id))
      .filter((r): r is ConnectionRecord => Boolean(r));
    if (records.length === 0) continue;

    const latest = records.reduce((a, b) =>
      a.lastActivity >= b.lastActivity ? a : b
    );

    out.push({
      userId,
      email: latest.email,
      role: latest.role,
      status: latest.status,
      connectionCount: records.length,
      socketIds: records.map((r) => r.socketId),
      currentPage: latest.currentPage,
      currentProblem: latest.currentProblem,
      lastActivity: latest.lastActivity,
    });
  }

  return out;
}

export function getSocketsForUser(userId: string): string[] {
  return [...(userSockets.get(userId) || [])];
}

export function getSocketsForRoles(roles: string[]): string[] {
  const roleSet = new Set(roles.map((r) => r.toLowerCase()));
  const ids: string[] = [];
  for (const rec of connections.values()) {
    if (roleSet.has(rec.role.toLowerCase())) ids.push(rec.socketId);
  }
  return ids;
}

export function getActiveConnectionCount(): number {
  return connections.size;
}

function refreshIdleStatuses(): void {
  const now = Date.now();
  const idleAfter = serverConfig.IDLE_TIMEOUT_MS;
  for (const rec of connections.values()) {
    if (
      rec.status === "ONLINE" &&
      now - rec.lastActivity >= idleAfter
    ) {
      rec.status = "IDLE";
    }
  }
}

/** Serialize for admin API (rooms as array). */
export function serializeConnection(rec: ConnectionRecord) {
  return {
    socketId: rec.socketId,
    userId: rec.userId,
    email: rec.email,
    role: rec.role,
    connectedAt: rec.connectedAt,
    lastActivity: rec.lastActivity,
    currentPage: rec.currentPage,
    currentProblem: rec.currentProblem,
    status: rec.status,
    rooms: [...rec.rooms],
    userAgent: rec.userAgent,
    ip: rec.ip,
  };
}
