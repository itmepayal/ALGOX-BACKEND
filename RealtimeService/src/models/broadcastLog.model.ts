import mongoose, { Document, Schema } from "mongoose";

export type BroadcastTargetType =
  | "everyone"
  | "online"
  | "users"
  | "roles"
  | "contest";

export interface IBroadcastLog extends Document {
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
  createdAt: Date;
  updatedAt: Date;
}

const broadcastLogSchema = new Schema<IBroadcastLog>(
  {
    event: { type: String, required: true, index: true },
    message: { type: String, required: true },
    targetType: {
      type: String,
      enum: ["everyone", "online", "users", "roles", "contest"],
      required: true,
    },
    targetIds: { type: [String], default: [] },
    actorId: { type: String, required: true, index: true },
    actorEmail: String,
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    payload: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const BroadcastLog = mongoose.model<IBroadcastLog>(
  "BroadcastLog",
  broadcastLogSchema
);

/** In-memory fallback when Mongo is unavailable */
export type MemoryBroadcastRecord = {
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
  createdAt: number;
};

export const memoryBroadcastLogs: MemoryBroadcastRecord[] = [];
const MEMORY_CAP = 200;

export function pushMemoryBroadcast(rec: MemoryBroadcastRecord): void {
  memoryBroadcastLogs.unshift(rec);
  while (memoryBroadcastLogs.length > MEMORY_CAP) memoryBroadcastLogs.pop();
}
