import { Types } from "mongoose";
import { CodingSession, type CodingSessionMode } from "../models/codingSession.model";

const CODE_LIMIT = 20_000;
const SNAPSHOT_LIMIT = 200;
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

export class CodingSessionError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID" | "NOT_FOUND" | "FORBIDDEN" | "CONFLICT"
  ) {
    super(message);
  }
}

function objectId(value: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new CodingSessionError("Invalid user or session id", "INVALID");
  }
  return new Types.ObjectId(value);
}

function view(session: any) {
  return {
    id: session._id.toString(),
    ownerId: session.ownerId.toString(),
    participantIds: session.participantIds.map((id: Types.ObjectId) => id.toString()),
    problemId: session.problemId,
    mode: session.mode,
    language: session.language,
    code: session.code,
    revision: session.revision,
    status: session.status,
    expiresAt: session.expiresAt,
    snapshots: session.snapshots.map((event: any) => ({
      eventId: event.eventId,
      sequence: event.sequence,
      userId: event.userId.toString(),
      code: event.code,
      cursor: event.cursor,
      createdAt: event.createdAt,
    })),
  };
}

export const codingSessionService = {
  async create(input: {
    userId: string;
    problemId: string;
    mode: CodingSessionMode;
    language: string;
    code: string;
    inviteeIds?: string[];
  }) {
    if (input.code.length > CODE_LIMIT) throw new CodingSessionError("Code exceeds the 20KB limit", "INVALID");
    if (!input.problemId.trim() || input.problemId.length > 100 || !input.language.trim() || input.language.length > 40) {
      throw new CodingSessionError("Problem and language are required", "INVALID");
    }
    const ownerId = objectId(input.userId);
    const invitees = [...new Set((input.inviteeIds || []).map((id) => objectId(id).toString()))]
      .filter((id) => id !== ownerId.toString())
      .slice(0, 20)
      .map((id) => new Types.ObjectId(id));
    const now = new Date();
    const session = await CodingSession.create({
      ownerId,
      participantIds: input.mode === "collaborative" ? [ownerId, ...invitees] : [ownerId],
      problemId: input.problemId.trim(),
      mode: input.mode,
      language: input.language.trim(),
      code: input.code,
      expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
      snapshots: [{ eventId: `start:${ownerId}:${now.getTime()}`, sequence: 0, userId: ownerId, code: input.code, createdAt: now }],
    });
    return view(session);
  },

  async join(sessionId: string, userId: string) {
    const session = await CodingSession.findById(objectId(sessionId));
    if (!session || session.expiresAt.getTime() <= Date.now() || !["active", "paused"].includes(session.status)) {
      throw new CodingSessionError("Coding session has expired or ended", "NOT_FOUND");
    }
    const member = (session.participantIds as Types.ObjectId[]).some((id: Types.ObjectId) => id.toString() === userId);
    if (!member) throw new CodingSessionError("You are not invited to this coding session", "FORBIDDEN");
    return view(session);
  },

  async assertParticipant(sessionId: string, userId: string) {
    const session = await CodingSession.findById(objectId(sessionId))
      .select("participantIds ownerId mode status expiresAt")
      .lean();
    if (!session || session.expiresAt.getTime() <= Date.now() || !["active", "paused"].includes(session.status)) {
      throw new CodingSessionError("Coding session has expired or ended", "NOT_FOUND");
    }
    const allowed = session.mode === "collaborative"
      ? session.participantIds.some((id: Types.ObjectId) => id.toString() === userId)
      : session.ownerId.toString() === userId;
    if (!allowed) throw new CodingSessionError("You are not a participant in this coding session", "FORBIDDEN");
  },

  async update(input: {
    sessionId: string;
    userId: string;
    eventId: string;
    baseRevision: number;
    code: string;
    cursor?: { line: number; column: number };
  }) {
    if (input.code.length > CODE_LIMIT || input.eventId.length > 100) {
      throw new CodingSessionError("Update payload exceeds limits", "INVALID");
    }
    const sessionId = objectId(input.sessionId);
    const userId = objectId(input.userId);
    const existing = await CodingSession.findById(sessionId).select("mode ownerId participantIds status expiresAt revision snapshots code").lean();
    if (!existing || existing.expiresAt.getTime() <= Date.now() || existing.status !== "active") {
      throw new CodingSessionError("Coding session has expired or ended", "NOT_FOUND");
    }
    const allowed = existing.mode === "collaborative"
      ? existing.participantIds.some((id: Types.ObjectId) => id.toString() === userId.toString())
      : existing.ownerId.toString() === userId.toString();
    if (!allowed) throw new CodingSessionError("You cannot edit this coding session", "FORBIDDEN");
    const duplicate = existing.snapshots.some((item: { eventId: string }) => item.eventId === input.eventId);
    if (duplicate) return { ...view(existing), duplicate: true };
    if (existing.revision !== input.baseRevision) {
      throw new CodingSessionError("Editor state is stale; reload the latest session", "CONFLICT");
    }

    const updated = await CodingSession.findOneAndUpdate(
      { _id: sessionId, revision: input.baseRevision, status: "active", expiresAt: { $gt: new Date() } },
      {
        $set: { code: input.code },
        $inc: { revision: 1 },
        $push: {
          snapshots: {
            $each: [{ eventId: input.eventId, sequence: input.baseRevision + 1, userId, code: input.code, cursor: input.cursor, createdAt: new Date() }],
            $slice: -SNAPSHOT_LIMIT,
          },
        },
      },
      { new: true }
    ).lean();
    if (!updated) throw new CodingSessionError("Editor state changed; reload the latest session", "CONFLICT");
    return { ...view(updated), duplicate: false };
  },

  async complete(sessionId: string, userId: string, status: "completed" | "cancelled") {
    const session = await CodingSession.findById(objectId(sessionId));
    if (!session) throw new CodingSessionError("Coding session not found", "NOT_FOUND");
    if (session.ownerId.toString() !== userId) throw new CodingSessionError("Only the session owner can end it", "FORBIDDEN");
    if (session.status !== "active") return view(session);
    session.status = status;
    await session.save();
    return view(session);
  },

  async setPaused(sessionId: string, userId: string, paused: boolean) {
    const session = await CodingSession.findById(objectId(sessionId));
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new CodingSessionError("Coding session has expired", "NOT_FOUND");
    }
    if (session.ownerId.toString() !== userId) {
      throw new CodingSessionError("Only the session owner can pause or resume it", "FORBIDDEN");
    }
    if (session.mode !== "replay") {
      throw new CodingSessionError("Only replay recordings can be paused", "INVALID");
    }
    if (session.status === "completed" || session.status === "cancelled") return view(session);
    session.status = paused ? "paused" : "active";
    await session.save();
    return view(session);
  },
};
