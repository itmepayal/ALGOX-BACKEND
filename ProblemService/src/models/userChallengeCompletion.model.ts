import mongoose, { Document, Schema } from "mongoose";

/**
 * Server-authoritative daily challenge completion.
 * dateKey is assigned by the server from clock + user timezone — never trusted from client.
 */
export interface IUserChallengeCompletion extends Document {
  userId: string;
  dateKey: string;
  problemId: string;
  completedAt: Date;
  submissionId?: string;
  /** How the day was credited */
  kind: "completed" | "frozen";
  createdAt: Date;
  updatedAt: Date;
}

const userChallengeCompletionSchema = new Schema<IUserChallengeCompletion>(
  {
    userId: { type: String, required: true, index: true },
    dateKey: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    problemId: { type: String, required: true },
    completedAt: { type: Date, required: true },
    submissionId: { type: String },
    kind: {
      type: String,
      enum: ["completed", "frozen"],
      default: "completed",
    },
  },
  { timestamps: true }
);

userChallengeCompletionSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export const UserChallengeCompletion = mongoose.model<IUserChallengeCompletion>(
  "UserChallengeCompletion",
  userChallengeCompletionSchema
);
