import mongoose, { Document, Schema } from "mongoose";

export interface ISecurityLog extends Document {
  userId: mongoose.Types.ObjectId;
  action: string;
  ip?: string;
  userAgent?: string;
}

const securityLogSchema = new Schema<ISecurityLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    action: {
      type: String,
      required: true,
    },

    ip: String,
    userAgent: String,
  },
  { timestamps: true },
);

securityLogSchema.index({ userId: 1, createdAt: -1 });

export const SecurityLog = mongoose.model<ISecurityLog>(
  "SecurityLog",
  securityLogSchema,
);
