import mongoose, { Document, Schema } from "mongoose";

export interface IUserSnapshot extends Document {
  name: string;
  email: string;
  avatar?: string;
  role: string;
  status: string;
  rating?: number;
  peakRating?: number;
  deletedAt?: Date | null;
}

const userSnapshotSchema = new Schema<IUserSnapshot>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    avatar: { type: String, default: "" },
    role: { type: String, default: "user" },
    status: { type: String, default: "active" },
    rating: { type: Number, default: 1000, index: true },
    peakRating: { type: Number, default: 1000 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

userSnapshotSchema.index({ status: 1, deletedAt: 1, rating: -1, peakRating: -1, _id: 1 });

export const UserSnapshot =
  mongoose.models.User ||
  mongoose.model<IUserSnapshot>("User", userSnapshotSchema);
