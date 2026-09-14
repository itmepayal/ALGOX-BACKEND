import mongoose from "mongoose";
import { Notification } from "../models/notification.model";
import { NotificationCampaign } from "../models/notificationCampaign.model";
import { User } from "../models/user.model";
import { BadRequestError, NotFoundError } from "../utils/errors/app.error";
import { writeAdminAudit } from "../utils/helpers/audit.helper";
import { normalizeRole } from "../rbac/permissions";

function publicShape(doc: Record<string, any>) {
  return {
    id: doc._id?.toString?.() || doc.id,
    userId: doc.userId?.toString?.() || doc.userId,
    type: doc.type,
    title: doc.title,
    message: doc.message,
    data: doc.data || {},
    read: Boolean(doc.read),
    readAt: doc.readAt || null,
    expiresAt: doc.expiresAt || null,
    createdAt: doc.createdAt,
  };
}

type CreateInput = {
  title: string;
  message: string;
  type?: string;
  target: "user" | "role" | "broadcast";
  userId?: string;
  roles?: string[];
  expiresAt?: string | null;
  scheduledAt?: string | null;
};

export class AdminNotificationService {
  async list(query: {
    page?: number;
    limit?: number;
    userId?: string;
    type?: string;
    read?: string;
    search?: string;
  }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const filter: Record<string, unknown> = {};

    if (query.userId && mongoose.Types.ObjectId.isValid(query.userId)) {
      filter.userId = new mongoose.Types.ObjectId(query.userId);
    }
    if (query.type) filter.type = query.type;
    if (query.read === "true") filter.read = true;
    if (query.read === "false") filter.read = false;
    if (query.search?.trim()) {
      const q = query.search.trim();
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { message: { $regex: q, $options: "i" } },
      ];
    }

    const [total, rows] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return {
      notifications: rows.map(publicShape),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  private async resolveRecipients(input: CreateInput): Promise<string[]> {
    let userIds: string[] = [];
    if (input.target === "user") {
      if (!input.userId || !mongoose.Types.ObjectId.isValid(input.userId)) {
        throw new BadRequestError("Valid userId required for user target");
      }
      const u = await User.findById(input.userId).select("_id status deletedAt");
      if (!u || (u as any).deletedAt) throw new NotFoundError("User not found");
      userIds = [u._id.toString()];
    } else if (input.target === "role") {
      const roles = (input.roles || []).map((r) => normalizeRole(r));
      if (!roles.length) throw new BadRequestError("roles required");
      const users = await User.find({
        role: { $in: roles },
        status: "active",
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      })
        .select("_id")
        .lean();
      userIds = users.map((u) => u._id.toString());
    } else {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const users = await User.find({
        status: "active",
        lastActiveAt: { $gte: since },
        $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
      })
        .select("_id")
        .limit(5000)
        .lean();
      userIds = users.map((u) => u._id.toString());
    }
    return userIds;
  }

  private async fanOut(
    actor: { userId: string },
    input: CreateInput,
    userIds: string[]
  ) {
    const type = String(input.type || "admin").slice(0, 64);
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    const docs = userIds.map((uid) => ({
      userId: new mongoose.Types.ObjectId(uid),
      type,
      title: input.title,
      message: input.message,
      data: {
        source: "admin",
        target: input.target,
        actorId: actor.userId,
      },
      expiresAt,
      read: false,
    }));
    await Notification.insertMany(docs, { ordered: false });
    return { recipientCount: userIds.length, type, title: input.title };
  }

  async create(
    actor: { userId: string; email?: string },
    input: CreateInput,
    meta?: { ip?: string; userAgent?: string }
  ) {
    const title = String(input.title || "").trim();
    const message = String(input.message || "").trim();
    if (!title || !message) {
      throw new BadRequestError("title and message are required");
    }
    const payload = { ...input, title, message };

    if (input.scheduledAt) {
      const when = new Date(input.scheduledAt);
      if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        throw new BadRequestError("scheduledAt must be a future datetime");
      }
      // Validate target early (user exists / roles present) without requiring recipients for broadcast
      if (payload.target === "user") {
        await this.resolveRecipients(payload);
      } else if (payload.target === "role" && !(payload.roles || []).length) {
        throw new BadRequestError("roles required");
      }

      const campaign = await NotificationCampaign.create({
        title,
        message,
        type: String(payload.type || "admin").slice(0, 64),
        target: payload.target,
        userId: payload.userId || null,
        roles: payload.roles || [],
        status: "scheduled",
        scheduledAt: when,
        createdBy: actor.userId,
        createdByEmail: actor.email,
        recipientCount: 0,
      });

      await writeAdminAudit({
        actorId: actor.userId,
        actorEmail: actor.email,
        action: "notification.schedule",
        resource: "notification_campaign",
        resourceId: campaign._id.toString(),
        after: {
          target: payload.target,
          scheduledAt: when.toISOString(),
          title,
        },
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      });

      return {
        scheduled: true,
        campaignId: campaign._id.toString(),
        scheduledAt: when.toISOString(),
        title,
      };
    }

    const userIds = await this.resolveRecipients(payload);
    if (!userIds.length) {
      throw new BadRequestError("No recipients matched the target");
    }
    const result = await this.fanOut(actor, payload, userIds);

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "notification.create",
      resource: "notification",
      after: {
        target: payload.target,
        recipientCount: result.recipientCount,
        type: result.type,
        title,
      },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return { ...result, scheduled: false };
  }

  async remove(
    actor: { userId: string; email?: string },
    id: string,
    meta?: { ip?: string; userAgent?: string }
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Notification not found");
    }
    const doc = await Notification.findByIdAndDelete(id);
    if (!doc) throw new NotFoundError("Notification not found");

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "notification.delete",
      resource: "notification",
      resourceId: id,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return { deleted: true };
  }

  async listCampaigns(query: { page?: number; limit?: number; status?: string }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;

    const [total, rows] = await Promise.all([
      NotificationCampaign.countDocuments(filter),
      NotificationCampaign.find(filter)
        .sort({ scheduledAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return {
      campaigns: rows.map((c: any) => ({
        id: c._id.toString(),
        title: c.title,
        message: c.message,
        type: c.type,
        target: c.target,
        userId: c.userId,
        roles: c.roles,
        status: c.status,
        scheduledAt: c.scheduledAt,
        sentAt: c.sentAt,
        cancelledAt: c.cancelledAt,
        recipientCount: c.recipientCount,
        createdBy: c.createdBy,
        createdAt: c.createdAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async cancelCampaign(
    actor: { userId: string; email?: string },
    id: string,
    meta?: { ip?: string; userAgent?: string }
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Campaign not found");
    }
    const doc = await NotificationCampaign.findById(id);
    if (!doc) throw new NotFoundError("Campaign not found");
    if (doc.status !== "scheduled") {
      throw new BadRequestError("Only scheduled campaigns can be cancelled");
    }
    doc.status = "cancelled";
    doc.cancelledAt = new Date();
    await doc.save();

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "notification.cancel_schedule",
      resource: "notification_campaign",
      resourceId: id,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return { id, status: "cancelled" };
  }

  /** Process due scheduled campaigns (called by interval). */
  async processDueCampaigns(): Promise<number> {
    const due = await NotificationCampaign.find({
      status: "scheduled",
      scheduledAt: { $lte: new Date() },
    }).limit(20);

    let processed = 0;
    for (const campaign of due) {
      try {
        const input: CreateInput = {
          title: campaign.title,
          message: campaign.message,
          type: campaign.type,
          target: campaign.target,
          userId: campaign.userId || undefined,
          roles: campaign.roles,
        };
        const userIds = await this.resolveRecipients(input);
        if (userIds.length) {
          await this.fanOut(
            { userId: campaign.createdBy },
            input,
            userIds
          );
        }
        campaign.status = "sent";
        campaign.sentAt = new Date();
        campaign.recipientCount = userIds.length;
        await campaign.save();
        processed += 1;
      } catch (err) {
        console.error("[NotificationCampaign] failed", campaign._id, err);
      }
    }
    return processed;
  }
}

export const adminNotificationService = new AdminNotificationService();
