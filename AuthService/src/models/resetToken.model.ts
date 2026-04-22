import mongoose, { Document, Schema } from "mongoose";

export interface IResetToken extends Document {
  userId: mongoose.Types.ObjectId;
  token: string; // hashed
  expiresAt: Date;
}

const resetTokenSchema = new Schema<IResetToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    token: {
      type: String,
      required: true,
      select: false, // 🔥 security
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

// TTL
resetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ResetToken = mongoose.model<IResetToken>(
  "ResetToken",
  resetTokenSchema,
);
