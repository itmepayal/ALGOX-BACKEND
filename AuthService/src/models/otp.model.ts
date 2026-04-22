import mongoose, { Document, Schema } from "mongoose";

export interface IOTP extends Document {
  userId: mongoose.Types.ObjectId;
  code: string;
  type: "emailVerification" | "passwordReset" | "2fa";
  expiresAt: Date;
}

const otpSchema = new Schema<IOTP>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    code: {
      type: String,
      required: true,
      select: false,
    },

    type: {
      type: String,
      enum: ["emailVerification", "passwordReset", "2fa"],
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ userId: 1, type: 1 });

export const OTP = mongoose.model<IOTP>("OTP", otpSchema);
