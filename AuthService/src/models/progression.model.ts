import { model, models, Schema, Types } from "mongoose";

export type ProgressionEventType =
  | "problem_solved"
  | "battle_won"
  | "contest_participation"
  | "contest_top10"
  | "streak_milestone";
export interface IXPEvent {
  userId: Types.ObjectId;
  eventKey: string;
  eventType: ProgressionEventType;
  sourceId: string;
  xp: number;
  difficulty?: "easy" | "medium" | "hard";
  createdAt: Date;
}
const xpEventSchema = new Schema<IXPEvent>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    eventKey: { type: String, required: true },
    eventType: {
      type: String,
      enum: [
        "problem_solved",
        "battle_won",
        "contest_participation",
        "contest_top10",
        "streak_milestone",
      ],
      required: true,
    },
    sourceId: { type: String, required: true },
    xp: { type: Number, required: true, min: 0 },
    difficulty: { type: String, enum: ["easy", "medium", "hard"] },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "user_xp_events",
  },
);
xpEventSchema.index({ userId: 1, eventKey: 1 }, { unique: true });
xpEventSchema.index({ userId: 1, eventType: 1, difficulty: 1 });
export const XPEvent =
  (models.XPEvent as any) || model<IXPEvent>("XPEvent", xpEventSchema);

export interface IUserAchievement {
  userId: Types.ObjectId;
  achievementId: string;
  progress: number;
  target: number;
  unlockedAt?: Date | null;
  updatedAt: Date;
}
const achievementSchema = new Schema<IUserAchievement>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    achievementId: { type: String, required: true },
    progress: { type: Number, required: true, min: 0 },
    target: { type: Number, required: true, min: 1 },
    unlockedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "user_achievements" },
);
achievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });
achievementSchema.index({ userId: 1, unlockedAt: -1 });
export const UserAchievement =
  (models.UserAchievement as any) ||
  model<IUserAchievement>("UserAchievement", achievementSchema);
