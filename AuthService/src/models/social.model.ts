import { model, models, Schema, Types } from "mongoose";

export interface ISocialFriendRequest {
  fromUserId: Types.ObjectId;
  toUserId: Types.ObjectId;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  createdAt: Date;
  updatedAt: Date;
}

const friendRequestSchema = new Schema<ISocialFriendRequest>(
  {
    fromUserId: { type: Schema.Types.ObjectId, required: true },
    toUserId: { type: Schema.Types.ObjectId, required: true },
    status: { type: String, enum: ["pending", "accepted", "rejected", "cancelled"], required: true, default: "pending" },
  },
  { timestamps: true, collection: "social_friend_requests" }
);
friendRequestSchema.index({ fromUserId: 1, toUserId: 1 }, { unique: true });
friendRequestSchema.index({ toUserId: 1, status: 1, createdAt: -1 });
friendRequestSchema.index({ fromUserId: 1, status: 1, createdAt: -1 });

export const SocialFriendRequest = (models.SocialFriendRequest as any) || model<ISocialFriendRequest>("SocialFriendRequest", friendRequestSchema);

export interface ISocialFollow {
  followerId: Types.ObjectId;
  followeeId: Types.ObjectId;
  createdAt: Date;
}
const followSchema = new Schema<ISocialFollow>(
  { followerId: { type: Schema.Types.ObjectId, required: true }, followeeId: { type: Schema.Types.ObjectId, required: true } },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "social_follows" }
);
followSchema.index({ followerId: 1, followeeId: 1 }, { unique: true });
followSchema.index({ followerId: 1, createdAt: -1 });
followSchema.index({ followeeId: 1, createdAt: -1 });
export const SocialFollow = (models.SocialFollow as any) || model<ISocialFollow>("SocialFollow", followSchema);

export interface ISocialActivity {
  actorId: Types.ObjectId;
  type: "friend_added" | "user_followed" | "problem_solved" | "battle_won" | "contest_participated" | "achievement_unlocked";
  targetId: Types.ObjectId;
  sourceId?: string;
  createdAt: Date;
}
const activitySchema = new Schema<ISocialActivity>(
  { actorId: { type: Schema.Types.ObjectId, required: true }, type: { type: String, enum: ["friend_added", "user_followed", "problem_solved", "battle_won", "contest_participated", "achievement_unlocked"], required: true }, targetId: { type: Schema.Types.ObjectId, required: true }, sourceId: { type: String, maxlength: 160 } },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "social_activity" }
);
activitySchema.index({ actorId: 1, createdAt: -1 });
activitySchema.index({ targetId: 1, createdAt: -1 });
activitySchema.index({ actorId: 1, type: 1, sourceId: 1 }, { name: "social_activity_actor_type_source_unique_v2", unique: true, partialFilterExpression: { type: { $in: ["problem_solved", "battle_won", "contest_participated", "achievement_unlocked"] } } });
export const SocialActivity = (models.SocialActivity as any) || model<ISocialActivity>("SocialActivity", activitySchema);
