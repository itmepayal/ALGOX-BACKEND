import mongoose, { Document, Schema } from "mongoose";

export type CampaignStatus = "scheduled" | "sent" | "cancelled";
export type CampaignTarget = "user" | "role" | "broadcast";

export interface INotificationCampaign extends Document {
  title: string;
  message: string;
  type: string;
  target: CampaignTarget;
  userId?: string | null;
  roles: string[];
  status: CampaignStatus;
  scheduledAt: Date;
  sentAt?: Date | null;
  cancelledAt?: Date | null;
  recipientCount: number;
  createdBy: string;
  createdByEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const campaignSchema = new Schema<INotificationCampaign>(
  {
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 2000 },
    type: { type: String, default: "admin", maxlength: 64, index: true },
    target: {
      type: String,
      enum: ["user", "role", "broadcast"],
      required: true,
    },
    userId: { type: String, default: null },
    roles: [{ type: String }],
    status: {
      type: String,
      enum: ["scheduled", "sent", "cancelled"],
      default: "scheduled",
      index: true,
    },
    scheduledAt: { type: Date, required: true, index: true },
    sentAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    recipientCount: { type: Number, default: 0 },
    createdBy: { type: String, required: true, index: true },
    createdByEmail: { type: String },
  },
  { timestamps: true }
);

campaignSchema.index({ status: 1, scheduledAt: 1 });

export const NotificationCampaign = mongoose.model<INotificationCampaign>(
  "NotificationCampaign",
  campaignSchema
);
