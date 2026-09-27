import mongoose, { Document, Schema, Types } from "mongoose";

export type TeamStatus = "ACTIVE" | "SUSPENDED" | "DISBANDED";

export interface ITeam extends Document {
  name: string;
  slug: string;
  description: string;
  ownerId: Types.ObjectId;
  status: TeamStatus;
  maxMembers: number;
  rating: number;
  peakRating: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  createdAt: Date;
  updatedAt: Date;
}

const teamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    description: { type: String, default: "", trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED", "DISBANDED"],
      default: "ACTIVE",
      index: true,
    },
    maxMembers: { type: Number, default: 10 },
    rating: { type: Number, default: 1200, index: true },
    peakRating: { type: Number, default: 1200 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    matches: { type: Number, default: 0 },
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

teamSchema.index({ rating: -1, createdAt: -1 });

export const Team = mongoose.model<ITeam>("Team", teamSchema);
