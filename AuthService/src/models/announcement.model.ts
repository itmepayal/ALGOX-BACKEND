import mongoose, { Document, Schema, Types } from "mongoose";

export type AnnouncementType =
  | "INFO"
  | "SUCCESS"
  | "WARNING"
  | "MAINTENANCE"
  | "CONTEST"
  | "PLATFORM_UPDATE";

export type AnnouncementStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHED"
  | "EXPIRED"
  | "ARCHIVED";

export type AnnouncementAudience =
  | "ALL_USERS"
  | "ONLINE_USERS"
  | "SPECIFIC_USERS"
  | "SPECIFIC_ROLES";

export interface IAnnouncement extends Document {
  title: string;
  message: string;
  type: AnnouncementType;
  priority: number;
  status: AnnouncementStatus;
  audience: AnnouncementAudience;
  targetUsers: Types.ObjectId[];
  targetRoles: string[];
  actionUrl?: string;
  scheduledAt?: Date | null;
  publishedAt?: Date | null;
  expiresAt?: Date | null;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: [
        "INFO",
        "SUCCESS",
        "WARNING",
        "MAINTENANCE",
        "CONTEST",
        "PLATFORM_UPDATE",
      ],
      default: "INFO",
      index: true,
    },
    priority: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ["DRAFT", "SCHEDULED", "PUBLISHED", "EXPIRED", "ARCHIVED"],
      default: "DRAFT",
      index: true,
    },
    audience: {
      type: String,
      enum: ["ALL_USERS", "ONLINE_USERS", "SPECIFIC_USERS", "SPECIFIC_ROLES"],
      default: "ALL_USERS",
      index: true,
    },
    targetUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    targetRoles: [
      {
        type: String,
        enum: ["user", "moderator", "content_manager", "admin", "super_admin"],
      },
    ],
    actionUrl: {
      type: String,
      default: "",
      maxlength: 500,
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

announcementSchema.index({ status: 1, publishedAt: -1 });
announcementSchema.index({ status: 1, type: 1, createdAt: -1 });
announcementSchema.index({ expiresAt: 1 });
announcementSchema.index({ status: 1, scheduledAt: 1 });

export const Announcement = mongoose.model<IAnnouncement>(
  "Announcement",
  announcementSchema
);
