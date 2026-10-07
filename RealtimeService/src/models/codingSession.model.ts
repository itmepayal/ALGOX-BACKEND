import { Schema, model, models, type Document, type Types } from "mongoose";

export type CodingSessionMode = "replay" | "collaborative";

export interface ICodingSnapshot {
  eventId: string;
  sequence: number;
  userId: Types.ObjectId;
  code: string;
  cursor?: { line: number; column: number };
  createdAt: Date;
}

export interface ICodingSession extends Document {
  ownerId: Types.ObjectId;
  participantIds: Types.ObjectId[];
  problemId: string;
  mode: CodingSessionMode;
  language: string;
  code: string;
  revision: number;
  snapshots: ICodingSnapshot[];
  status: "active" | "paused" | "completed" | "cancelled";
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const snapshotSchema = new Schema<ICodingSnapshot>(
  {
    eventId: { type: String, required: true },
    sequence: { type: Number, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    code: { type: String, required: true, maxlength: 20_000 },
    cursor: {
      line: { type: Number, min: 1 },
      column: { type: Number, min: 1 },
    },
    createdAt: { type: Date, required: true },
  },
  { _id: false }
);

const codingSessionSchema = new Schema<ICodingSession>(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true },
    participantIds: { type: [Schema.Types.ObjectId], required: true, default: [] },
    problemId: { type: String, required: true, maxlength: 100 },
    mode: { type: String, enum: ["replay", "collaborative"], required: true },
    language: { type: String, required: true, maxlength: 40 },
    code: { type: String, required: true, maxlength: 20_000 },
    revision: { type: Number, required: true, default: 0 },
    // Batched full snapshots (not keystrokes). Bound history to keep documents well below Mongo's 16MB limit.
    snapshots: { type: [snapshotSchema], default: [] },
    status: { type: String, enum: ["active", "paused", "completed", "cancelled"], default: "active" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "coding_sessions" }
);

codingSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
codingSessionSchema.index({ ownerId: 1, createdAt: -1 });
codingSessionSchema.index({ participantIds: 1, status: 1 });

export const CodingSession =
  (models.CodingSession as any) ||
  model<ICodingSession>("CodingSession", codingSessionSchema);
