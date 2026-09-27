import mongoose, { Document, Schema } from "mongoose";

export type TournamentStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "REGISTRATION_OPEN"
  | "REGISTRATION_CLOSED"
  | "SEEDED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "ARCHIVED";

export interface ITournament extends Document {
  title: string;
  slug: string;
  description: string;
  status: TournamentStatus;
  format: "SINGLE_ELIMINATION";
  maxParticipants: number;
  minParticipants: number;
  currentRound: number;
  totalRounds: number;
  participantCount: number;
  championId?: string;
  championName?: string;
  startTime: Date;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const tournamentSchema = new Schema<ITournament>(
  {
    title: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: [
        "DRAFT",
        "PUBLISHED",
        "REGISTRATION_OPEN",
        "REGISTRATION_CLOSED",
        "SEEDED",
        "IN_PROGRESS",
        "COMPLETED",
        "ARCHIVED",
      ],
      default: "DRAFT",
      index: true,
    },
    format: { type: String, default: "SINGLE_ELIMINATION" },
    maxParticipants: { type: Number, default: 8, enum: [8, 16, 32] },
    minParticipants: { type: Number, default: 8 },
    currentRound: { type: Number, default: 0 },
    totalRounds: { type: Number, default: 3 },
    participantCount: { type: Number, default: 0 },
    championId: { type: String },
    championName: { type: String },
    startTime: { type: Date, required: true, index: true },
    createdBy: { type: String },
    updatedBy: { type: String },
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

tournamentSchema.index({ status: 1, startTime: 1 });

export const Tournament = mongoose.model<ITournament>(
  "Tournament",
  tournamentSchema
);
