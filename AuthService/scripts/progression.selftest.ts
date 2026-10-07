import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
import { XPEvent, UserAchievement } from "../src/models/progression.model";
import { SocialActivity } from "../src/models/social.model";
import { progressionService } from "../src/services/progression.service";

dotenv.config();
const mongoUrl = process.env.MONGO_URL || process.env.MONGO_URI;
if (!mongoUrl) throw new Error("Set MONGO_URL to run the progression self-test");

async function main() {
  await mongoose.connect(mongoUrl);
  const userId = new Types.ObjectId().toString();
  const sourceId = new Types.ObjectId().toString();
  const eventKey = `selftest:${userId}:${sourceId}`;
  try {
    const first = await progressionService.record({ userId, eventKey, eventType: "problem_solved", sourceId, difficulty: "hard" });
    const duplicate = await progressionService.record({ userId, eventKey, eventType: "problem_solved", sourceId, difficulty: "hard" });
    assert(first.inserted && first.xp === 30, "verified hard solve awards XP once");
    assert(!duplicate.inserted && duplicate.xp === 0, "duplicate delivery does not award XP twice");
    const profile = await progressionService.profile(userId);
    assert(profile.xp === 30 && profile.achievements.find((item) => item.id === "first_solve")?.unlockedAt, "profile and first-solve unlock derive from ledger");
    const activityCount = await SocialActivity.countDocuments({ actorId: userId, type: "problem_solved", sourceId });
    assert(activityCount === 1, "real solve creates one feed activity");
    console.log("PASS: progression self-test");
  } finally {
    await Promise.all([
      XPEvent.deleteMany({ userId }),
      UserAchievement.deleteMany({ userId }),
      SocialActivity.deleteMany({ actorId: userId }),
    ]);
    await mongoose.disconnect();
  }
}

function assert(value: boolean, message: string) {
  if (!value) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
