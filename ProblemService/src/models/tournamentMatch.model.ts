import mongoose, { Document, Schema, Types } from "mongoose";

export type TournamentMatchStatus =
  | "PENDING"
  | "READY"
  | "LIVE"
  | "COMPLETED"
  | "CANCELLED";

export interface ITournamentMatchParticipant {
  userId: string;
  userName: string;
  seed: number;
}

export interface ITournamentMatch extends Document {
  tournamentId: Types.ObjectId;
  roundNumber: number;
  matchNumber: number;
  label: string;
  participantA?: ITournamentMatchParticipant;
  participantB?: ITournamentMatchParticipant;
  winnerId?: string;
  loserId?: string;
  battleId?: Types.ObjectId;
  status: TournamentMatchStatus;
  nextMatchId?: Types.ObjectId;
  nextMatchSlot?: "A" | "B";
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const tournamentMatchSchema = new Schema<ITournamentMatch>(
  {
    tournamentId: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    roundNumber: { type: Number, required: true, index: true },
    matchNumber: { type: Number, required: true, index: true },
    label: { type: String, required: true },
    participantA: {
      userId: { type: String },
      userName: { type: String },
      seed: { type: Number },
    },
    participantB: {
      userId: { type: String },
      userName: { type: String },
      seed: { type: Number },
    },
    winnerId: { type: String, index: true },
    loserId: { type: String },
    battleId: { type: Schema.Types.ObjectId, ref: "Battle", index: true },
    status: {
      type: String,
      enum: ["PENDING", "READY", "LIVE", "COMPLETED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    nextMatchId: { type: Schema.Types.ObjectId, ref: "TournamentMatch" },
    nextMatchSlot: { type: String, enum: ["A", "B"] },
    scheduledAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
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

tournamentMatchSchema.index(
  { tournamentId: 1, roundNumber: 1, matchNumber: 1 },
  { unique: true }
);

export const TournamentMatch = mongoose.model<ITournamentMatch>(
  "TournamentMatch",
  tournamentMatchSchema
);
