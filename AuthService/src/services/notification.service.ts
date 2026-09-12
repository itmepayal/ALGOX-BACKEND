import mongoose from "mongoose";
import { Notification } from "../models/notification.model";
import { NotFoundError } from "../utils/errors/app.error";
import type { ListNotificationsQuery } from "../validators/notification.validator";

function publicShape(doc: Record<string, any>) {
  return {
    id: doc._id?.toString?.() || doc.id,
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

export class NotificationService {
  async listForUser(userId: string, query: ListNotificationsQuery) {
    const page = query.page;
    const limit = query.limit;
    const now = new Date();

    const filter: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    };
    if (query.unreadOnly) {
      filter.read = false;
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

  async unreadCount(userId: string) {
    const now = new Date();
    const count = await Notification.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      read: false,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    });
    return { count };
  }

  async markRead(userId: string, notificationId: string) {
    if (!mongoose.Types.ObjectId.isValid(notificationId)) {
      throw new NotFoundError("Notification not found");
    }
    const doc = await Notification.findOne({
      _id: notificationId,
      userId: new mongoose.Types.ObjectId(userId),
    });
    if (!doc) throw new NotFoundError("Notification not found");

    if (!doc.read) {
      doc.read = true;
      doc.readAt = new Date();
      await doc.save();
    }

    return publicShape(doc.toObject());
  }

  async markAllRead(userId: string) {
    const now = new Date();
    const result = await Notification.updateMany(
      {
        userId: new mongoose.Types.ObjectId(userId),
        read: false,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      },
      { $set: { read: true, readAt: now } }
    );
    return { updated: result.modifiedCount };
  }
}

export const notificationService = new NotificationService();
