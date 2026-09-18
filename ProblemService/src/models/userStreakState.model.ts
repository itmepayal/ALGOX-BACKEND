import mongoose, { Document, Schema } from "mongoose";

export interface IStreakBadge {
  id: string;
  earnedAt: Date;
  label?: string;
}

export interface IUserStreakState extends Document {
  userId: string;
  /** IANA timezone used to map server clock → calendar dateKey. */
  timezone: string;
  currentStreak: number;
  longestStreak: number;
  /** Last dateKey that counted (completed or freeze). */
  lastQualifiedDateKey: string | null;
  /** Remaining streak freezes (premium.streak_freeze grants balance). */
  freezeBalance: number;
  weeklyGoalTarget: number;
  monthlyGoalTarget: number;
  badges: IStreakBadge[];
  timezoneUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const badgeSchema = new Schema<IStreakBadge>(
  {
    id: { type: String, required: true },
    earnedAt: { type: Date, required: true },
    label: { type: String },
  },
  { _id: false }
);

const userStreakStateSchema = new Schema<IUserStreakState>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    timezone: { type: String, default: "UTC" },
    currentStreak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    lastQualifiedDateKey: { type: String, default: null },
    freezeBalance: { type: Number, default: 0, min: 0 },
    weeklyGoalTarget: { type: Number, default: 5, min: 1, max: 7 },
    monthlyGoalTarget: { type: Number, default: 20, min: 1, max: 31 },
    badges: { type: [badgeSchema], default: [] },
    timezoneUpdatedAt: { type: Date },
  },
  { timestamps: true }
);

export const UserStreakState = mongoose.model<IUserStreakState>(
  "UserStreakState",
  userStreakStateSchema
);
