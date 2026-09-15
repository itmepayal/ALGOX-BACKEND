import { Announcement } from "../../models/announcement.model";
import { PlatformSettings } from "../../models/platformSettings.model";
import mongoose from "mongoose";

/**
 * System-generated published announcements (settings-driven).
 * Fire-and-forget safe — never throws to callers.
 */
export async function maybeAnnounceMaintenance(message: string): Promise<void> {
  try {
    const doc = await PlatformSettings.findOne({ key: "default" }).lean();
    if (!doc?.announceMaintenance) return;
    const systemId = new mongoose.Types.ObjectId();
    await Announcement.create({
      title: "Platform maintenance",
      message:
        message?.trim() ||
        "AlgoPath is entering maintenance mode. Some features may be unavailable.",
      type: "MAINTENANCE",
      priority: 10,
      status: "PUBLISHED",
      audience: "ALL_USERS",
      targetUsers: [],
      targetRoles: [],
      publishedAt: new Date(),
      createdBy: systemId,
      updatedBy: systemId,
    });
  } catch {
    /* non-blocking */
  }
}

export async function maybeAnnounceNewSheet(input: {
  sheetId: string;
  title: string;
}): Promise<void> {
  try {
    const doc = await PlatformSettings.findOne({ key: "default" }).lean();
    if (!doc?.announceNewSheets) return;
    const systemId = new mongoose.Types.ObjectId();
    await Announcement.create({
      title: `New learning sheet: ${input.title}`,
      message: `A new learning sheet "${input.title}" is now available. Open Learn / Sheets to start practicing.`,
      type: "PLATFORM_UPDATE",
      priority: 5,
      status: "PUBLISHED",
      audience: "ALL_USERS",
      targetUsers: [],
      targetRoles: [],
      actionUrl: `/`,
      publishedAt: new Date(),
      createdBy: systemId,
      updatedBy: systemId,
    });
  } catch {
    /* non-blocking */
  }
}
