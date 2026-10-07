import { Types } from "mongoose";
import { User } from "../models/user.model";
import { SocialActivity, SocialFollow, SocialFriendRequest } from "../models/social.model";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors/app.error";

function id(value: string) {
  if (!Types.ObjectId.isValid(value)) throw new BadRequestError("Invalid user id");
  return new Types.ObjectId(value);
}
function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

async function activeUser(userId: Types.ObjectId) {
  const user = await User.findOne({ _id: userId, status: "active", deletedAt: null }).select("_id name avatar").lean();
  if (!user) throw new NotFoundError("User not found or inactive");
  return user;
}

async function createActivity(actorId: Types.ObjectId, type: "friend_added" | "user_followed", targetId: Types.ObjectId) {
  await SocialActivity.create({ actorId, type, targetId });
}

export const socialService = {
  async discover(userId: string, query: string) {
    const self = id(userId);
    const q = String(query || "").trim();
    if (q.length < 2 || q.length > 50) return [];
    const regex = new RegExp(escapeRegex(q), "i");
    const users = await User.find({ _id: { $ne: self }, status: "active", deletedAt: null, $or: [{ name: regex }, { email: regex }] })
      .select("_id name avatar").sort({ name: 1 }).limit(20).lean();
    return users.map((user: any) => ({ id: user._id.toString(), name: user.name, avatar: user.avatar || "" }));
  },

  async sendFriendRequest(userId: string, targetId: string) {
    const fromUserId = id(userId), toUserId = id(targetId);
    if (fromUserId.equals(toUserId)) throw new BadRequestError("You cannot send a friend request to yourself");
    await activeUser(toUserId);
    const friendship = await SocialFriendRequest.findOne({ status: "accepted", $or: [{ fromUserId, toUserId }, { fromUserId: toUserId, toUserId: fromUserId }] }).lean();
    if (friendship) throw new ConflictError("You are already friends");
    const reverse = await SocialFriendRequest.findOne({ fromUserId: toUserId, toUserId: fromUserId, status: "pending" }).lean();
    if (reverse) throw new ConflictError("This user already sent you a request; accept the incoming request");
    const prior = await SocialFriendRequest.findOne({ fromUserId, toUserId });
    if (prior?.status === "pending") throw new ConflictError("Friend request already pending");
    if (prior) {
      prior.status = "pending";
      await prior.save();
      return { id: prior._id.toString(), status: prior.status };
    }
    try {
      const request = await SocialFriendRequest.create({ fromUserId, toUserId, status: "pending" });
      return { id: request._id.toString(), status: request.status };
    } catch (err: any) {
      if (err?.code === 11000) throw new ConflictError("Friend request already exists");
      throw err;
    }
  },

  async listRequests(userId: string, direction: "incoming" | "outgoing") {
    const self = id(userId);
    const filter = direction === "incoming" ? { toUserId: self, status: "pending" } : { fromUserId: self, status: "pending" };
    const rows = await SocialFriendRequest.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    const otherIds = rows.map((row: any) => (direction === "incoming" ? row.fromUserId : row.toUserId));
    const users = await User.find({ _id: { $in: otherIds }, status: "active", deletedAt: null }).select("_id name avatar").lean();
    const byId = new Map(users.map((u: any) => [u._id.toString(), u]));
    return rows.map((row: any) => {
      const otherId = (direction === "incoming" ? row.fromUserId : row.toUserId).toString();
      const user = byId.get(otherId) as any;
      return { requestId: row._id.toString(), user: user ? { id: otherId, name: user.name, avatar: user.avatar || "" } : null, createdAt: row.createdAt };
    }).filter((row: any) => row.user);
  },

  async respondToRequest(userId: string, requestId: string, action: "accept" | "reject" | "cancel") {
    const self = id(userId), rid = id(requestId);
    const filter: any = { _id: rid, status: "pending" };
    if (action === "cancel") filter.fromUserId = self; else filter.toUserId = self;
    const request = await SocialFriendRequest.findOneAndUpdate(filter, { $set: { status: action === "accept" ? "accepted" : action === "reject" ? "rejected" : "cancelled" } }, { new: true });
    if (!request) throw new NotFoundError("Pending friend request not found");
    if (action === "accept") await createActivity(self, "friend_added", request.fromUserId);
    return { id: request._id.toString(), status: request.status };
  },

  async friends(userId: string) {
    const self = id(userId);
    const rows = await SocialFriendRequest.find({ status: "accepted", $or: [{ fromUserId: self }, { toUserId: self }] }).sort({ updatedAt: -1 }).limit(500).lean();
    const otherIds = rows.map((row: any) => row.fromUserId.equals(self) ? row.toUserId : row.fromUserId);
    const users = await User.find({ _id: { $in: otherIds }, status: "active", deletedAt: null }).select("_id name avatar").sort({ name: 1 }).lean();
    return users.map((user: any) => ({ id: user._id.toString(), name: user.name, avatar: user.avatar || "" }));
  },

  async removeFriend(userId: string, targetId: string) {
    const self = id(userId), other = id(targetId);
    if (self.equals(other)) throw new BadRequestError("Invalid friend id");
    const result = await SocialFriendRequest.updateMany({ status: "accepted", $or: [{ fromUserId: self, toUserId: other }, { fromUserId: other, toUserId: self }] }, { $set: { status: "cancelled" } });
    if (!result.modifiedCount) throw new NotFoundError("Friendship not found");
    return { removed: true };
  },

  async follow(userId: string, targetId: string) {
    const followerId = id(userId), followeeId = id(targetId);
    if (followerId.equals(followeeId)) throw new BadRequestError("You cannot follow yourself");
    await activeUser(followeeId);
    try {
      await SocialFollow.create({ followerId, followeeId });
    } catch (err: any) {
      if (err?.code === 11000) throw new ConflictError("You already follow this user");
      throw err;
    }
    await createActivity(followerId, "user_followed", followeeId);
    return { following: true };
  },

  async unfollow(userId: string, targetId: string) {
    const result = await SocialFollow.deleteOne({ followerId: id(userId), followeeId: id(targetId) });
    if (!result.deletedCount) throw new NotFoundError("Follow relationship not found");
    return { following: false };
  },

  async listFollowUsers(userId: string, direction: "followers" | "following") {
    const self = id(userId);
    const rows = await SocialFollow.find(direction === "followers" ? { followeeId: self } : { followerId: self }).sort({ createdAt: -1 }).limit(500).lean();
    const ids = rows.map((row: any) => (direction === "followers" ? row.followerId : row.followeeId));
    const users = await User.find({ _id: { $in: ids }, status: "active", deletedAt: null }).select("_id name avatar").lean();
    const byId = new Map(users.map((u: any) => [u._id.toString(), u]));
    return ids.map((value: Types.ObjectId) => {
      const user = byId.get(value.toString()) as any;
      return user ? { id: user._id.toString(), name: user.name, avatar: user.avatar || "" } : null;
    }).filter(Boolean);
  },

  async activity(userId: string, limit = 30, before?: string) {
    const self = id(userId);
    const friends = await SocialFriendRequest.find({ status: "accepted", $or: [{ fromUserId: self }, { toUserId: self }] }).select("fromUserId toUserId").lean();
    const friendIds = friends.map((row: any) => row.fromUserId.equals(self) ? row.toUserId : row.fromUserId);
    const following = await SocialFollow.find({ followerId: self }).select("followeeId").lean();
    const actorIds = [...new Map([[self.toString(), self], ...friendIds.map((x: Types.ObjectId) => [x.toString(), x] as [string, Types.ObjectId]), ...following.map((x: any) => [x.followeeId.toString(), x.followeeId] as [string, Types.ObjectId])]).values()];
    const filter: any = { actorId: { $in: actorIds } };
    if (before) {
      let cursorDate: string, cursorId: string;
      try {
        [cursorDate, cursorId] = Buffer.from(before, "base64url").toString("utf8").split("|");
      } catch { throw new BadRequestError("Invalid activity cursor"); }
      const date = new Date(cursorDate);
      if (Number.isNaN(date.getTime()) || !Types.ObjectId.isValid(cursorId)) throw new BadRequestError("Invalid activity cursor");
      filter.$or = [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: new Types.ObjectId(cursorId) } }];
    }
    const rows = await SocialActivity.find(filter).sort({ createdAt: -1, _id: -1 }).limit(Math.min(50, Math.max(1, limit))).lean();
    const ids = [...new Map(rows.flatMap((row: any) => [[row.actorId.toString(), row.actorId], [row.targetId.toString(), row.targetId]]) as [string, Types.ObjectId][]).values()];
    const users = await User.find({ _id: { $in: ids }, status: "active", deletedAt: null }).select("_id name avatar").lean();
    const byId = new Map(users.map((u: any) => [u._id.toString(), u]));
    const last = rows.at(-1);
    return { items: rows.map((row: any) => ({ id: row._id.toString(), type: row.type, sourceId: row.sourceId, actor: byId.get(row.actorId.toString()), target: byId.get(row.targetId.toString()), createdAt: row.createdAt })).filter((row: any) => row.actor && row.target), nextCursor: last ? Buffer.from(`${last.createdAt.toISOString()}|${last._id.toString()}`).toString("base64url") : null };
  },
};
