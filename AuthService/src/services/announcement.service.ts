import mongoose from "mongoose";
import {
  Announcement,
  type AnnouncementAudience,
  type IAnnouncement,
} from "../models/announcement.model";
import { Notification } from "../models/notification.model";
import { User } from "../models/user.model";
import {
  BadRequestError,
  NotFoundError,
} from "../utils/errors/app.error";
import { writeAdminAudit } from "../utils/helpers/audit.helper";
import { emitRealtimeEvent } from "../utils/helpers/realtimeEmit";
import { normalizeRole } from "../rbac/permissions";
import type {
  CreateAnnouncementDto,
  ListAnnouncementsQuery,
  UpdateAnnouncementDto,
} from "../validators/announcement.validator";

type Actor = { userId: string; email?: string; role: string };
type RequestMeta = { ip?: string; userAgent?: string };

/** Marker stored on audit `after.via` for timestamp-driven publishes. */
export const ANNOUNCEMENT_PUBLISH_VIA_SCHEDULER = "scheduler" as const;

const ALL_USERS_FANOUT_CAP = 5000;
const ALL_USERS_ACTIVE_DAYS = 30;
const NOTIFY_BATCH_SIZE = 500;

function toObjectIds(ids: string[]) {
  return ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function adminShape(doc: IAnnouncement | Record<string, any>) {
  const a = doc as any;
  return {
    id: a._id?.toString?.() || a.id,
    title: a.title,
    message: a.message,
    type: a.type,
    priority: a.priority,
    status: a.status,
    audience: a.audience,
    targetUsers: (a.targetUsers || []).map((u: any) =>
      typeof u === "string" ? u : u?.toString?.()
    ),
    targetRoles: a.targetRoles || [],
    actionUrl: a.actionUrl || "",
    scheduledAt: a.scheduledAt || null,
    publishedAt: a.publishedAt || null,
    expiresAt: a.expiresAt || null,
    createdBy: a.createdBy?.toString?.() || a.createdBy,
    updatedBy: a.updatedBy?.toString?.() || a.updatedBy || null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

/** Public user-facing shape — no drafts/admin metadata beyond what's needed. */
function publicShape(doc: IAnnouncement | Record<string, any>) {
  const a = doc as any;
  return {
    id: a._id?.toString?.() || a.id,
    title: a.title,
    message: a.message,
    type: a.type,
    priority: a.priority,
    actionUrl: a.actionUrl || "",
    publishedAt: a.publishedAt || null,
    expiresAt: a.expiresAt || null,
  };
}

function audienceMatchesUser(
  audience: AnnouncementAudience,
  targetUsers: string[],
  targetRoles: string[],
  userId: string,
  userRole: string
): boolean {
  if (audience === "ALL_USERS" || audience === "ONLINE_USERS") return true;
  if (audience === "SPECIFIC_USERS") {
    return targetUsers.includes(userId);
  }
  if (audience === "SPECIFIC_ROLES") {
    return targetRoles.includes(normalizeRole(userRole));
  }
  return false;
}

export class AnnouncementService {
  async listAdmin(query: ListAnnouncementsQuery) {
    const page = query.page;
    const limit = query.limit;
    const filter: Record<string, unknown> = {};

    if (query.search?.trim()) {
      const q = query.search.trim();
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { message: { $regex: q, $options: "i" } },
      ];
    }
    if (query.status && query.status !== "all") {
      filter.status = query.status;
    }
    if (query.type && query.type !== "all") {
      filter.type = query.type;
    }

    const [total, rows] = await Promise.all([
      Announcement.countDocuments(filter),
      Announcement.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return {
      announcements: rows.map(adminShape),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Announcement not found");
    }
    const doc = await Announcement.findById(id).lean();
    if (!doc) throw new NotFoundError("Announcement not found");
    return adminShape(doc);
  }

  async create(
    actor: Actor,
    dto: CreateAnnouncementDto,
    meta?: RequestMeta
  ) {
    if (
      dto.audience === "SPECIFIC_USERS" &&
      (!dto.targetUsers || dto.targetUsers.length === 0)
    ) {
      throw new BadRequestError(
        "targetUsers is required when audience is SPECIFIC_USERS"
      );
    }
    if (
      dto.audience === "SPECIFIC_ROLES" &&
      (!dto.targetRoles || dto.targetRoles.length === 0)
    ) {
      throw new BadRequestError(
        "targetRoles is required when audience is SPECIFIC_ROLES"
      );
    }

    const doc = await Announcement.create({
      title: dto.title,
      message: dto.message,
      type: dto.type,
      priority: dto.priority,
      status: "DRAFT",
      audience: dto.audience,
      targetUsers: toObjectIds(dto.targetUsers || []),
      targetRoles: dto.targetRoles || [],
      actionUrl: dto.actionUrl || "",
      scheduledAt: dto.scheduledAt || null,
      expiresAt: dto.expiresAt || null,
      createdBy: new mongoose.Types.ObjectId(actor.userId),
      updatedBy: new mongoose.Types.ObjectId(actor.userId),
    });

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "announcement.create",
      resource: "announcement",
      resourceId: doc._id.toString(),
      after: adminShape(doc),
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return adminShape(doc);
  }

  async update(
    actor: Actor,
    id: string,
    dto: UpdateAnnouncementDto,
    meta?: RequestMeta
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Announcement not found");
    }
    const doc = await Announcement.findById(id);
    if (!doc) throw new NotFoundError("Announcement not found");
    if (doc.status === "ARCHIVED") {
      throw new BadRequestError("Cannot update an archived announcement");
    }

    const before = adminShape(doc);

    if (dto.title !== undefined) doc.title = dto.title;
    if (dto.message !== undefined) doc.message = dto.message;
    if (dto.type !== undefined) doc.type = dto.type;
    if (dto.priority !== undefined) doc.priority = dto.priority;
    if (dto.audience !== undefined) doc.audience = dto.audience;
    if (dto.targetUsers !== undefined) {
      doc.targetUsers = toObjectIds(dto.targetUsers) as any;
    }
    if (dto.targetRoles !== undefined) doc.targetRoles = dto.targetRoles;
    if (dto.actionUrl !== undefined) doc.actionUrl = dto.actionUrl;
    if (dto.scheduledAt !== undefined) doc.scheduledAt = dto.scheduledAt;
    if (dto.expiresAt !== undefined) doc.expiresAt = dto.expiresAt;
    doc.updatedBy = new mongoose.Types.ObjectId(actor.userId);

    await doc.save();

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "announcement.update",
      resource: "announcement",
      resourceId: id,
      before,
      after: adminShape(doc),
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return adminShape(doc);
  }

  async schedule(
    actor: Actor,
    id: string,
    scheduledAt: Date,
    meta?: RequestMeta
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Announcement not found");
    }
    const doc = await Announcement.findById(id);
    if (!doc) throw new NotFoundError("Announcement not found");
    if (doc.status === "ARCHIVED" || doc.status === "EXPIRED") {
      throw new BadRequestError(`Cannot schedule a ${doc.status} announcement`);
    }
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestError("scheduledAt must be in the future");
    }

    const before = adminShape(doc);
    doc.status = "SCHEDULED";
    doc.scheduledAt = scheduledAt;
    doc.updatedBy = new mongoose.Types.ObjectId(actor.userId);
    await doc.save();

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "announcement.schedule",
      resource: "announcement",
      resourceId: id,
      before,
      after: adminShape(doc),
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return adminShape(doc);
  }

  async publish(actor: Actor, id: string, meta?: RequestMeta) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Announcement not found");
    }
    const doc = await Announcement.findById(id);
    if (!doc) throw new NotFoundError("Announcement not found");
    if (doc.status === "ARCHIVED" || doc.status === "EXPIRED") {
      throw new BadRequestError(`Cannot publish a ${doc.status} announcement`);
    }
    if (doc.status === "PUBLISHED") {
      throw new BadRequestError("Announcement is already published");
    }

    const before = adminShape(doc);
    doc.status = "PUBLISHED";
    doc.publishedAt = new Date();
    doc.updatedBy = new mongoose.Types.ObjectId(actor.userId);
    await doc.save();

    await this.afterPublish(doc, before, actor, meta, "admin");
    return adminShape(doc);
  }

  /**
   * Timestamp-driven auto-publish for SCHEDULED announcements.
   * Idempotent via atomic status claim — safe under concurrent ticks.
   * Admin manual publish remains available as an override.
   */
  async processDueScheduledAnnouncements(): Promise<number> {
    const now = new Date();
    const due = await Announcement.find({
      status: "SCHEDULED",
      scheduledAt: { $ne: null, $lte: now },
    })
      .select("_id")
      .limit(20)
      .lean();

    let published = 0;
    for (const row of due) {
      const claimed = await Announcement.findOneAndUpdate(
        {
          _id: row._id,
          status: "SCHEDULED",
          scheduledAt: { $ne: null, $lte: now },
        },
        {
          $set: {
            status: "PUBLISHED",
            publishedAt: now,
          },
        },
        { returnDocument: "after" }
      );
      if (!claimed) continue;

      const before = {
        ...adminShape(claimed),
        status: "SCHEDULED",
        publishedAt: null,
      };
      // Audit actor = original creator (AdminAuditLog.actorId is ObjectId).
      // after.via distinguishes scheduler from manual publish.
      const schedulerActor: Actor = {
        userId: String(claimed.createdBy || claimed.updatedBy),
        email: "system:announcement-scheduler",
        role: "system",
      };
      await this.afterPublish(
        claimed,
        before,
        schedulerActor,
        undefined,
        ANNOUNCEMENT_PUBLISH_VIA_SCHEDULER
      );
      published += 1;
    }
    return published;
  }

  /** Shared post-publish: fan-out, audit, realtime (manual + scheduler). */
  private async afterPublish(
    doc: IAnnouncement,
    before: Record<string, unknown>,
    actor: Actor,
    meta: RequestMeta | undefined,
    via: "admin" | "scheduler"
  ) {
    await this.fanOutNotifications(doc);

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "announcement.publish",
      resource: "announcement",
      resourceId: doc._id.toString(),
      before,
      after: { ...adminShape(doc), via },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    emitRealtimeEvent({
      event: "announcement.published",
      status: "published",
      payload: {
        announcementId: doc._id.toString(),
        title: doc.title,
        type: doc.type,
        audience: doc.audience,
        via,
      },
    });
  }

  async expire(actor: Actor, id: string, meta?: RequestMeta) {
    return this.transitionStatus(actor, id, "EXPIRED", "announcement.expire", meta);
  }

  async archive(actor: Actor, id: string, meta?: RequestMeta) {
    return this.transitionStatus(actor, id, "ARCHIVED", "announcement.archive", meta);
  }

  private async transitionStatus(
    actor: Actor,
    id: string,
    status: "EXPIRED" | "ARCHIVED",
    action: string,
    meta?: RequestMeta
  ) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new NotFoundError("Announcement not found");
    }
    const doc = await Announcement.findById(id);
    if (!doc) throw new NotFoundError("Announcement not found");

    const before = adminShape(doc);
    doc.status = status;
    if (status === "EXPIRED" && !doc.expiresAt) {
      doc.expiresAt = new Date();
    }
    doc.updatedBy = new mongoose.Types.ObjectId(actor.userId);
    await doc.save();

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action,
      resource: "announcement",
      resourceId: id,
      before,
      after: adminShape(doc),
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return adminShape(doc);
  }

  /**
   * Fan-out notification rows on publish.
   *
   * SPECIFIC_USERS / SPECIFIC_ROLES: resolve recipients from User and insert
   * Notification docs in batches.
   *
   * ALL_USERS / ONLINE_USERS: store the announcement (served by GET /announcements)
   * and optionally create Notification rows for users active in the last 30 days,
   * capped at 5000. If the active-user count exceeds the cap we skip fan-out
   * entirely so we do not create a partial / misleading inbox blast — users still
   * see the announcement via the user-facing announcements endpoint.
   */
  private async fanOutNotifications(doc: IAnnouncement) {
    const announcementId = doc._id.toString();
    const payload = {
      type: "announcement",
      title: doc.title,
      message: doc.message,
      data: {
        announcementId,
        announcementType: doc.type,
        actionUrl: doc.actionUrl || "",
        priority: doc.priority,
      },
      expiresAt: doc.expiresAt || null,
    };

    let userIds: string[] = [];

    if (doc.audience === "SPECIFIC_USERS") {
      userIds = (doc.targetUsers || []).map((u) => u.toString());
    } else if (doc.audience === "SPECIFIC_ROLES") {
      const roles = doc.targetRoles || [];
      if (roles.length === 0) return;
      const users = await User.find({ role: { $in: roles }, status: "active" })
        .select("_id")
        .lean();
      userIds = users.map((u) => u._id.toString());
    } else {
      // ALL_USERS / ONLINE_USERS
      const since = new Date(
        Date.now() - ALL_USERS_ACTIVE_DAYS * 24 * 60 * 60 * 1000
      );
      const activeCount = await User.countDocuments({
        status: "active",
        lastActiveAt: { $gte: since },
      });
      if (activeCount > ALL_USERS_FANOUT_CAP) {
        // Skip notification fan-out; announcement remains visible via GET /announcements.
        return;
      }
      const users = await User.find({
        status: "active",
        lastActiveAt: { $gte: since },
      })
        .select("_id")
        .limit(ALL_USERS_FANOUT_CAP)
        .lean();
      userIds = users.map((u) => u._id.toString());
    }

    if (userIds.length === 0) return;

    for (let i = 0; i < userIds.length; i += NOTIFY_BATCH_SIZE) {
      const chunk = userIds.slice(i, i + NOTIFY_BATCH_SIZE);
      await Notification.insertMany(
        chunk.map((userId) => ({
          userId: new mongoose.Types.ObjectId(userId),
          ...payload,
          read: false,
        })),
        { ordered: false }
      );
    }
  }

  async listForUser(userId: string, userRole: string) {
    const now = new Date();
    const rows = await Announcement.find({
      status: "PUBLISHED",
      $and: [
        {
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
        },
      ],
    })
      .sort({ priority: -1, publishedAt: -1 })
      .limit(50)
      .lean();

    const role = normalizeRole(userRole);
    const visible = rows.filter((row) =>
      audienceMatchesUser(
        row.audience,
        (row.targetUsers || []).map((u: any) => u.toString()),
        row.targetRoles || [],
        userId,
        role
      )
    );

    return visible.map(publicShape);
  }
}

export const announcementService = new AnnouncementService();
