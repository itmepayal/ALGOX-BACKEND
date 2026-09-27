import mongoose, { Document, Schema, Types } from "mongoose";

export type TeamRole = "OWNER" | "CAPTAIN" | "MEMBER";

export interface ITeamMember extends Document {
  teamId: Types.ObjectId;
  userId: Types.ObjectId;
  role: TeamRole;
  joinedAt: Date;
  updatedAt: Date;
}

const teamMemberSchema = new Schema<ITeamMember>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: {
      type: String,
      enum: ["OWNER", "CAPTAIN", "MEMBER"],
      default: "MEMBER",
    },
    joinedAt: { type: Date, default: Date.now },
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

teamMemberSchema.index({ teamId: 1, userId: 1 }, { unique: true });

export const TeamMember = mongoose.model<ITeamMember>("TeamMember", teamMemberSchema);
