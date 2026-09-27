import mongoose, { Document, Schema, Types } from "mongoose";

export type TeamBattleState =
  | "CREATED"
  | "PENDING_ACCEPTANCE"
  | "ACCEPTED"
  | "LOBBY"
  | "READY"
  | "LIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "ABANDONED";

export interface ITeamBattle extends Document {
  teamAId: Types.ObjectId;
  teamBId: Types.ObjectId;
  creatorId: Types.ObjectId;
  teamAParticipants: Types.ObjectId[];
  teamBParticipants: Types.ObjectId[];
  problemIds: Types.ObjectId[];
  state: TeamBattleState;
  durationSeconds: number;
  startedAt?: Date | null;
  endsAt?: Date | null;
  completedAt?: Date | null;
  teamAScore: number;
  teamBScore: number;
  winnerTeamId?: Types.ObjectId | null;
  teamARatingChange: number;
  teamBRatingChange: number;
  createdAt: Date;
  updatedAt: Date;
}

const teamBattleSchema = new Schema<ITeamBattle>(
  {
    teamAId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    teamBId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    teamAParticipants: [{ type: Schema.Types.ObjectId, ref: "User" }],
    teamBParticipants: [{ type: Schema.Types.ObjectId, ref: "User" }],
    problemIds: [{ type: Schema.Types.ObjectId, ref: "Problem" }],
    state: {
      type: String,
      enum: [
        "CREATED",
        "PENDING_ACCEPTANCE",
        "ACCEPTED",
        "LOBBY",
        "READY",
        "LIVE",
        "COMPLETED",
        "CANCELLED",
        "ABANDONED",
      ],
      default: "PENDING_ACCEPTANCE",
      index: true,
    },
    durationSeconds: { type: Number, default: 1800 },
    startedAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    teamAScore: { type: Number, default: 0 },
    teamBScore: { type: Number, default: 0 },
    winnerTeamId: { type: Schema.Types.ObjectId, ref: "Team", default: null },
    teamARatingChange: { type: Number, default: 0 },
    teamBRatingChange: { type: Number, default: 0 },
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

teamBattleSchema.index({ teamAId: 1, createdAt: -1 });
teamBattleSchema.index({ teamBId: 1, createdAt: -1 });

export const TeamBattle = mongoose.model<ITeamBattle>("TeamBattle", teamBattleSchema);
