import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
import { CodingSession } from "../src/models/codingSession.model";
import { codingSessionService, CodingSessionError } from "../src/services/codingSession.service";

dotenv.config();
const mongoUrl = process.env.MONGO_URL || process.env.MONGO_URI;
if (!mongoUrl) throw new Error("Set MONGO_URL to run the coding session self-test");

async function main() {
  await mongoose.connect(mongoUrl);
  const owner = new Types.ObjectId().toString();
  const peer = new Types.ObjectId().toString();
  let sessionId = "";
  try {
    const created = await codingSessionService.create({ userId: owner, problemId: "selftest-problem", mode: "collaborative", language: "javascript", code: "let n = 1;", inviteeIds: [peer] });
    sessionId = created.id;
    const joined = await codingSessionService.join(sessionId, peer);
    assert(joined.code === "let n = 1;", "invited participant loads persisted shared state");

    const writes = await Promise.allSettled([
      codingSessionService.update({ sessionId, userId: owner, eventId: "owner-event-0001", baseRevision: 0, code: "let n = 2;" }),
      codingSessionService.update({ sessionId, userId: peer, eventId: "peer-event-00001", baseRevision: 0, code: "let n = 3;" }),
    ]);
    const winner = writes.filter((result) => result.status === "fulfilled");
    const conflict = writes.filter((result) => result.status === "rejected");
    assert(winner.length === 1, "simultaneous edits accept exactly one revision");
    assert(conflict.length === 1 && conflict[0].status === "rejected" && conflict[0].reason instanceof CodingSessionError && conflict[0].reason.code === "CONFLICT", "stale simultaneous edit receives a conflict");

    const current = winner[0].status === "fulfilled" ? winner[0].value : null;
    if (!current) throw new Error("No winning edit was saved");
    const duplicate = await codingSessionService.update({ sessionId, userId: owner, eventId: current.snapshots.at(-1)?.eventId || "owner-event-0001", baseRevision: 0, code: current.code });
    assert(duplicate.duplicate === true, "duplicate edit event is idempotent");
    const paused = await codingSessionService.setPaused(sessionId, owner, true);
    assert(paused.status === "paused", "replay owner can pause recording");
    const resumed = await codingSessionService.setPaused(sessionId, owner, false);
    assert(resumed.status === "active", "replay owner can resume recording");
    const replay = await codingSessionService.join(sessionId, owner);
    assert(replay.revision === 1 && replay.snapshots.length === 2, "replay history and current revision persist");
    console.log("PASS: coding session self-test");
  } finally {
    if (sessionId) await CodingSession.deleteOne({ _id: sessionId });
    await mongoose.disconnect();
  }
}

function assert(value: boolean, message: string) {
  if (!value) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

void main().catch((err) => { console.error(err); process.exitCode = 1; });
