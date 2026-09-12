import { serverConfig } from "../config";
import { metrics } from "../metrics/metrics";

export interface SanitizedEvent {
  id: string;
  at: number;
  name: string;
  direction: "in" | "out" | "system";
  socketId?: string;
  userId?: string;
  room?: string;
  /** Redacted / size-capped payload summary */
  payload: Record<string, unknown> | null;
}

const SENSITIVE_KEYS = new Set([
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "password",
  "secret",
  "jwt",
  "apiKey",
  "apikey",
  "cookie",
]);

let seq = 0;
const buffer: SanitizedEvent[] = [];

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 200) return `${value.slice(0, 200)}…`;
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => redact(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = "[redacted]";
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

export function pushEvent(input: {
  name: string;
  direction: SanitizedEvent["direction"];
  socketId?: string;
  userId?: string;
  room?: string;
  payload?: unknown;
}): SanitizedEvent {
  metrics.recordEvent();
  seq += 1;
  const entry: SanitizedEvent = {
    id: `evt_${Date.now()}_${seq}`,
    at: Date.now(),
    name: input.name,
    direction: input.direction,
    socketId: input.socketId,
    userId: input.userId,
    room: input.room,
    payload:
      input.payload === undefined
        ? null
        : (redact(input.payload) as Record<string, unknown>),
  };

  buffer.push(entry);
  const max = serverConfig.EVENT_BUFFER_SIZE;
  while (buffer.length > max) buffer.shift();
  return entry;
}

export function listEvents(limit = 100): SanitizedEvent[] {
  const n = Math.min(Math.max(limit, 1), serverConfig.EVENT_BUFFER_SIZE);
  return buffer.slice(-n).reverse();
}

export function eventBufferSize(): number {
  return buffer.length;
}
