import mongoose, { Document, Schema } from "mongoose";

export interface ISession extends Document {
  userId: mongoose.Types.ObjectId;
  refreshToken: string; // hashed
  ip?: string;
  userAgent?: string;
  expiresAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    refreshToken: {
      type: String,
      required: true,
      select: false, // 🔥 never expose
    },

    ip: String,
    userAgent: String,

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

// TTL index
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Performance index
sessionSchema.index({ userId: 1, createdAt: -1 });

export const Session = mongoose.model<ISession>("Session", sessionSchema);
