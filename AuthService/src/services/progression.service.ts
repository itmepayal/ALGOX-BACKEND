import { Types } from "mongoose";
import { XPEvent, UserAchievement, type ProgressionEventType } from "../models/progression.model";
import { SocialActivity } from "../models/social.model";
import { BadRequestError } from "../utils/errors/app.error";

export const ACHIEVEMENTS = [
  { id: "first_solve", title: "First Solve", description: "Solve your first problem.", target: 1, stat: "solves" },
  { id: "hundred_problems", title: "100 Problems", description: "Solve 100 different problems.", target: 100, stat: "solves" },
  { id: "fifty_medium", title: "Medium Momentum", description: "Solve 50 medium problems.", target: 50, stat: "medium" },
  { id: "first_hard", title: "First Hard", description: "Solve a hard problem.", target: 1, stat: "hard" },
  { id: "five_battle_wins", title: "Battle Champion", description: "Win five ranked battles.", target: 5, stat: "battle_wins" },
  { id: "contest_top10", title: "Contest Top 10", description: "Place in the top 10 of a contest.", target: 1, stat: "contest_top10" },
  { id: "thirty_day_streak", title: "30 Day Streak", description: "Reach a verified 30 day streak.", target: 1, stat: "streak_30" },
] as const;

type IncomingEvent = { eventKey: string; userId: string; eventType: ProgressionEventType; sourceId: string; difficulty?: "easy" | "medium" | "hard" };

export const progressionService = {
  async record(input: IncomingEvent) {
    if (!Types.ObjectId.isValid(input.userId) || input.eventKey.length > 180 || input.sourceId.length > 160) throw new BadRequestError("Invalid progression event");
    let xp = input.eventType === "problem_solved" ? 10 + (input.difficulty === "medium" ? 10 : input.difficulty === "hard" ? 20 : 0)
      : input.eventType === "battle_won" ? 25
      : input.eventType === "contest_participation" ? 15
      : input.eventType === "contest_top10" ? 50
      : input.eventType === "streak_milestone" ? 100 : 0;
    let inserted = false;
    try {
      await XPEvent.create({ userId: new Types.ObjectId(input.userId), eventKey: input.eventKey, eventType: input.eventType, sourceId: input.sourceId, difficulty: input.difficulty, xp });
      inserted = true;
    } catch (err: any) {
      if (err?.code !== 11000) throw err;
    }
    if (input.eventType === "problem_solved" || input.eventType === "battle_won" || input.eventType === "contest_participation") {
      const activityType = input.eventType === "contest_participation" ? "contest_participated" : input.eventType;
      await SocialActivity.updateOne(
        { actorId: new Types.ObjectId(input.userId), type: activityType, sourceId: input.sourceId },
        { $setOnInsert: { actorId: new Types.ObjectId(input.userId), type: activityType, targetId: new Types.ObjectId(input.userId), sourceId: input.sourceId } },
        { upsert: true }
      );
    }
    const counts = await XPEvent.aggregate([
      { $match: { userId: new Types.ObjectId(input.userId) } },
      { $group: {
        _id: null,
        xp: { $sum: "$xp" },
        solves: { $sum: { $cond: [{ $eq: ["$eventType", "problem_solved"] }, 1, 0] } },
        medium: { $sum: { $cond: [{ $and: [{ $eq: ["$eventType", "problem_solved"] }, { $eq: ["$difficulty", "medium"] }] }, 1, 0] } },
        hard: { $sum: { $cond: [{ $and: [{ $eq: ["$eventType", "problem_solved"] }, { $eq: ["$difficulty", "hard"] }] }, 1, 0] } },
        battle_wins: { $sum: { $cond: [{ $eq: ["$eventType", "battle_won"] }, 1, 0] } },
        contest_top10: { $sum: { $cond: [{ $eq: ["$eventType", "contest_top10"] }, 1, 0] } },
        streak_30: { $sum: { $cond: [{ $and: [{ $eq: ["$eventType", "streak_milestone"] }, { $eq: ["$sourceId", "30"] }] }, 1, 0] } },
      } },
    ]);
    const stats = counts[0] || { xp: 0, solves: 0, medium: 0, hard: 0, battle_wins: 0, contest_top10: 0, streak_30: 0 };
    const ops = ACHIEVEMENTS.map((achievement) => {
      const progress = Math.min(achievement.target, Number(stats[achievement.stat] || 0));
      return {
        updateOne: {
          filter: { userId: new Types.ObjectId(input.userId), achievementId: achievement.id },
          update: { $set: { progress, target: achievement.target } },
          upsert: true,
        },
      };
    });
    await UserAchievement.bulkWrite(ops as any, { ordered: false });
    const newlyUnlocked = await Promise.all(ACHIEVEMENTS.map(async (achievement) => {
      const result = await UserAchievement.updateOne(
        { userId: new Types.ObjectId(input.userId), achievementId: achievement.id, progress: { $gte: achievement.target }, unlockedAt: null },
        { $set: { unlockedAt: new Date() } }
      );
      if (result.modifiedCount) {
        await SocialActivity.updateOne(
          { actorId: new Types.ObjectId(input.userId), type: "achievement_unlocked", sourceId: achievement.id },
          { $setOnInsert: { actorId: new Types.ObjectId(input.userId), type: "achievement_unlocked", targetId: new Types.ObjectId(input.userId), sourceId: achievement.id } },
          { upsert: true }
        );
        return achievement.id;
      }
      return null;
    }));
    return { inserted, xp: inserted ? xp : 0, newlyUnlocked: newlyUnlocked.filter(Boolean) };
  },

  async profile(userId: string) {
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestError("Invalid user id");
    const uid = new Types.ObjectId(userId);
    const [total, events, stored] = await Promise.all([
      XPEvent.aggregate([{ $match: { userId: uid } }, { $group: { _id: null, xp: { $sum: "$xp" }, events: { $sum: 1 } } }]),
      XPEvent.find({ userId: uid }).sort({ createdAt: -1 }).limit(30).lean(),
      UserAchievement.find({ userId: uid }).lean(),
    ]);
    const byId = new Map(stored.map((row: any) => [row.achievementId, row]));
    const xp = total[0]?.xp || 0;
    const level = Math.floor(xp / 500) + 1;
    return {
      xp,
      level,
      xpIntoLevel: xp % 500,
      xpToNextLevel: 500 - (xp % 500),
      achievements: ACHIEVEMENTS.map((definition) => {
        const row = byId.get(definition.id) as any;
        return { ...definition, progress: row?.progress || 0, unlockedAt: row?.unlockedAt || null };
      }),
      recentXp: events.map((row: any) => ({ eventType: row.eventType, sourceId: row.sourceId, xp: row.xp, createdAt: row.createdAt })),
    };
  },
};
