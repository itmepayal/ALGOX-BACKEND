import mongoose, { Document, Schema, Types } from "mongoose";

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELLED";

export interface ITeamInvitation extends Document {
  teamId: Types.ObjectId;
  invitedUserId: Types.ObjectId;
  invitedBy: Types.ObjectId;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const teamInvitationSchema = new Schema<ITeamInvitation>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    invitedUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    expiresAt: { type: Date, required: true },
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

teamInvitationSchema.index({ teamId: 1, invitedUserId: 1, status: 1 });

export const TeamInvitation = mongoose.model<ITeamInvitation>("TeamInvitation", teamInvitationSchema);
