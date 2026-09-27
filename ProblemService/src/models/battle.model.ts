import mongoose, { Document, Schema, Types } from "mongoose";

export type BattleStatus =
  | "PENDING"
  | "ACCEPTED"
  | "WAITING"
  | "READY"
  | "ACTIVE"
  | "FINISHED"
  | "RESULT_PUBLISHED"
  | "DECLINED"
  | "EXPIRED"
  | "CANCELLED"
  | "FORFEITED";

export type BattleDifficulty = "easy" | "medium" | "hard" | "mixed";
export type BattleMode = "ranked" | "unranked";

export interface IBattle extends Document {
  creatorId: Types.ObjectId;
  creatorName: string;
  creatorEmail: string;
  opponentId: Types.ObjectId;
  opponentName: string;
  opponentEmail: string;

  status: BattleStatus;
  difficulty: BattleDifficulty;
  battleMode: BattleMode;
  isRated: boolean;
  problemCount: number;
  durationSeconds: number;

  startedAt?: Date | null;
  endsAt?: Date | null;
  finishedAt?: Date | null;

  winnerId?: Types.ObjectId | null;
  forfeitedBy?: Types.ObjectId | null;

  createdAt: Date;
  updatedAt: Date;
}

const battleSchema = new Schema<IBattle>(
  {
    creatorId: { type: Schema.Types.ObjectId, required: true, index: true },
    creatorName: { type: String, required: true, trim: true },
    creatorEmail: { type: String, required: true, trim: true },

    opponentId: { type: Schema.Types.ObjectId, required: true, index: true },
    opponentName: { type: String, required: true, trim: true },
    opponentEmail: { type: String, required: true, trim: true },

    status: {
      type: String,
      enum: [
        "PENDING",
        "ACCEPTED",
        "WAITING",
        "READY",
        "ACTIVE",
        "FINISHED",
        "RESULT_PUBLISHED",
        "DECLINED",
        "EXPIRED",
        "CANCELLED",
        "FORFEITED",
      ],
      default: "PENDING",
      index: true,
    },

    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard", "mixed"],
      default: "medium",
    },

    battleMode: {
      type: String,
      enum: ["ranked", "unranked"],
      default: "ranked",
      index: true,
    },

    isRated: {
      type: Boolean,
      default: false,
      index: true,
    },

    problemCount: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      default: 3,
    },

    durationSeconds: {
      type: Number,
      required: true,
      min: 300,
      max: 7200,
      default: 1800,
    },

    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },

    winnerId: { type: Schema.Types.ObjectId, default: null },
    forfeitedBy: { type: Schema.Types.ObjectId, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: any) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

battleSchema.index({ creatorId: 1, createdAt: -1 });
battleSchema.index({ opponentId: 1, createdAt: -1 });
battleSchema.index({ status: 1, createdAt: -1 });

export const Battle = mongoose.model<IBattle>("Battle", battleSchema);
