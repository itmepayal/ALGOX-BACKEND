import mongoose, { Document, Schema, Types } from "mongoose";

export type ConnectionStatus = "CONNECTED" | "DISCONNECTED" | "RECONNECTING";

export interface IBattleParticipant extends Document {
  battleId: Types.ObjectId;
  userId: Types.ObjectId;
  score: number;
  solvedCount: number;
  wrongAttempts: number;
  isReady: boolean;
  connectionStatus: ConnectionStatus;
  joinedAt?: Date | null;
  finishedAt?: Date | null;
  lastSeenAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const battleParticipantSchema = new Schema<IBattleParticipant>(
  {
    battleId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    score: { type: Number, default: 0 },
    solvedCount: { type: Number, default: 0 },
    wrongAttempts: { type: Number, default: 0 },
    isReady: { type: Boolean, default: false },
    connectionStatus: {
      type: String,
      enum: ["CONNECTED", "DISCONNECTED", "RECONNECTING"],
      default: "CONNECTED",
    },
    joinedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: Date.now },
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

battleParticipantSchema.index({ battleId: 1, userId: 1 }, { unique: true });

export const BattleParticipant = mongoose.model<IBattleParticipant>(
  "BattleParticipant",
  battleParticipantSchema
);
