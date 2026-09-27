import mongoose, { Document, Schema, Types } from "mongoose";

export interface ITournamentParticipant extends Document {
  tournamentId: Types.ObjectId;
  userId: string;
  userName: string;
  userAvatar?: string;
  seed: number;
  status: "REGISTERED" | "ACTIVE" | "ELIMINATED" | "CHAMPION";
  wins: number;
  losses: number;
  currentRound: number;
  eliminatedRound?: number;
  currentMatchId?: Types.ObjectId;
  registeredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const tournamentParticipantSchema = new Schema<ITournamentParticipant>(
  {
    tournamentId: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
      index: true,
    },
    userId: { type: String, required: true, index: true },
    userName: { type: String, required: true },
    userAvatar: { type: String, default: "" },
    seed: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["REGISTERED", "ACTIVE", "ELIMINATED", "CHAMPION"],
      default: "REGISTERED",
    },
    wins: { type: Number, default: 0, min: 0 },
    losses: { type: Number, default: 0, min: 0 },
    currentRound: { type: Number, default: 0 },
    eliminatedRound: { type: Number },
    currentMatchId: { type: Schema.Types.ObjectId, ref: "TournamentMatch" },
    registeredAt: { type: Date, default: Date.now },
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

tournamentParticipantSchema.index(
  { tournamentId: 1, userId: 1 },
  { unique: true }
);
tournamentParticipantSchema.index({ tournamentId: 1, seed: 1 });

export const TournamentParticipant = mongoose.model<ITournamentParticipant>(
  "TournamentParticipant",
  tournamentParticipantSchema
);
