import {
  DEFAULT_PLATFORM_SETTINGS,
  PlatformSettings,
  type IPlatformSettings,
  type JudgeLanguage,
} from "../models/platformSettings.model";
import { writeAdminAudit } from "../utils/helpers/audit.helper";
import { BadRequestError, ForbiddenError } from "../utils/errors/app.error";

const LANGS: JudgeLanguage[] = ["cpp", "python", "javascript", "java"];

/** Keys only super_admin may change. */
export const SENSITIVE_SETTING_KEYS = new Set([
  "maintenanceMode",
  "maintenanceMessage",
  "allowAdminBypass",
  "registrationEnabled",
  "requireEmailVerification",
  "maxSubmissionsPerHour",
  "maxRunPerHour",
  "maxCodeLength",
  "concurrentSubmissionCap",
  "defaultTimeoutMs",
  "defaultMemoryMb",
  "featureFlags",
]);

export type PlatformSettingsDto = ReturnType<typeof toDto>;

function toDto(doc: IPlatformSettings) {
  return {
    platformName: doc.platformName,
    logoUrl: doc.logoUrl,
    faviconUrl: doc.faviconUrl,
    supportEmail: doc.supportEmail,
    tagline: doc.tagline,
    defaultLanguage: doc.defaultLanguage,
    supportedLanguages: [...(doc.supportedLanguages || [])],
    defaultPageSize: doc.defaultPageSize,
    maxPageSize: doc.maxPageSize,
    maxSubmissionsPerHour: doc.maxSubmissionsPerHour,
    maxRunPerHour: doc.maxRunPerHour,
    maxCodeLength: doc.maxCodeLength,
    concurrentSubmissionCap: doc.concurrentSubmissionCap,
    defaultTimeoutMs: doc.defaultTimeoutMs,
    defaultMemoryMb: doc.defaultMemoryMb,
    maintenanceMode: doc.maintenanceMode,
    maintenanceMessage: doc.maintenanceMessage,
    allowAdminBypass: doc.allowAdminBypass,
    registrationEnabled: doc.registrationEnabled,
    requireEmailVerification: doc.requireEmailVerification,
    discussionsEnabled: doc.discussionsEnabled,
    requireAuthToPost: doc.requireAuthToPost,
    emailNotificationsEnabled: doc.emailNotificationsEnabled,
    announceNewSheets: doc.announceNewSheets,
    announceMaintenance: doc.announceMaintenance,
    featureFlags: {
      contests: doc.featureFlags?.contests ?? true,
      discussions: doc.featureFlags?.discussions ?? true,
      submissions: doc.featureFlags?.submissions ?? true,
      registration: doc.featureFlags?.registration ?? true,
      maintenance: doc.featureFlags?.maintenance ?? false,
      newEditor: doc.featureFlags?.newEditor ?? true,
      notifications: doc.featureFlags?.notifications ?? true,
    },
    updatedBy: doc.updatedBy || null,
    updatedAt: doc.updatedAt?.toISOString?.() || null,
  };
}

/** Public product settings — includes submission ceilings for service enforcement. */
export function toPublicDto(doc: IPlatformSettings) {
  return {
    platformName: doc.platformName,
    logoUrl: doc.logoUrl,
    faviconUrl: doc.faviconUrl,
    tagline: doc.tagline,
    supportEmail: doc.supportEmail,
    defaultLanguage: doc.defaultLanguage,
    supportedLanguages: [...(doc.supportedLanguages || [])],
    maxSubmissionsPerHour: doc.maxSubmissionsPerHour,
    maxRunPerHour: doc.maxRunPerHour,
    maxCodeLength: doc.maxCodeLength,
    concurrentSubmissionCap: doc.concurrentSubmissionCap,
    maintenanceMode: doc.maintenanceMode,
    maintenanceMessage: doc.maintenanceMessage,
    allowAdminBypass: doc.allowAdminBypass,
    registrationEnabled: doc.registrationEnabled,
    requireEmailVerification: doc.requireEmailVerification,
    discussionsEnabled: doc.discussionsEnabled,
    requireAuthToPost: doc.requireAuthToPost,
    featureFlags: {
      contests: doc.featureFlags?.contests ?? true,
      discussions: doc.featureFlags?.discussions ?? doc.discussionsEnabled ?? true,
      submissions: doc.featureFlags?.submissions ?? true,
      registration:
        doc.featureFlags?.registration ?? doc.registrationEnabled ?? true,
      maintenance: doc.featureFlags?.maintenance ?? doc.maintenanceMode ?? false,
      newEditor: doc.featureFlags?.newEditor ?? true,
      notifications: doc.featureFlags?.notifications ?? true,
    },
  };
}

async function getOrCreateDoc(): Promise<IPlatformSettings> {
  let doc = await PlatformSettings.findOne({ key: "default" });
  if (!doc) {
    doc = await PlatformSettings.create({ ...DEFAULT_PLATFORM_SETTINGS });
  }
  return doc;
}

export class PlatformSettingsService {
  async getAdminSettings() {
    const doc = await getOrCreateDoc();
    return toDto(doc);
  }

  async getPublicSettings() {
    const doc = await getOrCreateDoc();
    return toPublicDto(doc);
  }

  async updateSettings(input: {
    patch: Record<string, unknown>;
    actor: { userId: string; email?: string; role: string };
    ip?: string;
    userAgent?: string;
  }) {
    const { patch, actor } = input;
    if (!patch || typeof patch !== "object") {
      throw new BadRequestError("Settings payload required");
    }

    const isSuper = actor.role === "super_admin";
    for (const key of Object.keys(patch)) {
      if (SENSITIVE_SETTING_KEYS.has(key) && !isSuper) {
        throw new ForbiddenError(
          `Only super_admin can update sensitive setting: ${key}`
        );
      }
    }

    const doc = await getOrCreateDoc();
    const before = toDto(doc);

    if (typeof patch.platformName === "string") {
      doc.platformName = patch.platformName.trim() || "AlgoPath";
    }
    if (typeof patch.logoUrl === "string") doc.logoUrl = patch.logoUrl.trim();
    if (typeof patch.faviconUrl === "string") {
      doc.faviconUrl = patch.faviconUrl.trim();
    }
    if (typeof patch.supportEmail === "string") {
      doc.supportEmail = patch.supportEmail.trim();
    }
    if (typeof patch.tagline === "string") doc.tagline = patch.tagline.trim();

    if (typeof patch.defaultLanguage === "string") {
      if (!LANGS.includes(patch.defaultLanguage as JudgeLanguage)) {
        throw new BadRequestError("Invalid defaultLanguage");
      }
      doc.defaultLanguage = patch.defaultLanguage as JudgeLanguage;
    }
    if (Array.isArray(patch.supportedLanguages)) {
      const langs = patch.supportedLanguages.filter((l): l is JudgeLanguage =>
        LANGS.includes(l as JudgeLanguage)
      );
      if (!langs.length) {
        throw new BadRequestError("At least one supported language required");
      }
      doc.supportedLanguages = langs;
      if (!langs.includes(doc.defaultLanguage)) {
        doc.defaultLanguage = langs[0];
      }
    }

    const num = (k: string, min: number, max: number) => {
      if (patch[k] === undefined) return;
      const n = Number(patch[k]);
      if (!Number.isFinite(n) || n < min || n > max) {
        throw new BadRequestError(`${k} must be between ${min} and ${max}`);
      }
      (doc as any)[k] = Math.floor(n);
    };

    num("defaultPageSize", 5, 100);
    num("maxPageSize", 10, 500);
    num("maxSubmissionsPerHour", 1, 10_000);
    num("maxRunPerHour", 1, 20_000);
    num("maxCodeLength", 1000, 500_000);
    num("concurrentSubmissionCap", 1, 50);
    num("defaultTimeoutMs", 500, 60_000);
    num("defaultMemoryMb", 64, 2048);

    const bool = (k: string) => {
      if (patch[k] === undefined) return;
      (doc as any)[k] = Boolean(patch[k]);
    };
    bool("maintenanceMode");
    bool("allowAdminBypass");
    bool("registrationEnabled");
    bool("requireEmailVerification");
    bool("discussionsEnabled");
    bool("requireAuthToPost");
    bool("emailNotificationsEnabled");
    bool("announceNewSheets");
    bool("announceMaintenance");

    // Sync legacy → featureFlags when legacy was patched without an explicit flag override
    const ffPatch =
      patch.featureFlags && typeof patch.featureFlags === "object"
        ? (patch.featureFlags as Record<string, unknown>)
        : null;

    if (!doc.featureFlags) {
      (doc as any).featureFlags = {
        ...DEFAULT_PLATFORM_SETTINGS.featureFlags,
      };
    }

    if (patch.maintenanceMode !== undefined && ffPatch?.maintenance === undefined) {
      doc.featureFlags.maintenance = Boolean(patch.maintenanceMode);
    }
    if (
      patch.registrationEnabled !== undefined &&
      ffPatch?.registration === undefined
    ) {
      doc.featureFlags.registration = Boolean(patch.registrationEnabled);
    }
    if (
      patch.discussionsEnabled !== undefined &&
      ffPatch?.discussions === undefined
    ) {
      doc.featureFlags.discussions = Boolean(patch.discussionsEnabled);
    }

    if (ffPatch) {
      const keys = [
        "contests",
        "discussions",
        "submissions",
        "registration",
        "maintenance",
        "newEditor",
        "notifications",
      ] as const;
      for (const k of keys) {
        if (ffPatch[k] !== undefined) {
          (doc.featureFlags as any)[k] = Boolean(ffPatch[k]);
        }
      }
      // Keep legacy booleans in sync where they overlap
      if (ffPatch.discussions !== undefined) {
        doc.discussionsEnabled = Boolean(ffPatch.discussions);
      }
      if (ffPatch.registration !== undefined) {
        doc.registrationEnabled = Boolean(ffPatch.registration);
      }
      if (ffPatch.maintenance !== undefined) {
        doc.maintenanceMode = Boolean(ffPatch.maintenance);
      }
    }

    if (typeof patch.maintenanceMessage === "string") {
      doc.maintenanceMessage = patch.maintenanceMessage.trim();
    }

    doc.updatedBy = actor.userId;
    const maintenanceJustEnabled =
      Boolean(doc.maintenanceMode) && !Boolean(before.maintenanceMode);

    await doc.save();
    const after = toDto(doc);

    if (maintenanceJustEnabled) {
      const { maybeAnnounceMaintenance } = await import(
        "../utils/helpers/systemAnnounce"
      );
      void maybeAnnounceMaintenance(doc.maintenanceMessage || "");
    }

    await writeAdminAudit({
      actorId: actor.userId,
      actorEmail: actor.email,
      action: "settings.update",
      resource: "settings",
      resourceId: "default",
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
      ip: input.ip,
      userAgent: input.userAgent,
    });

    return after;
  }

  async resetToDefaults(input: {
    actor: { userId: string; email?: string; role: string };
    ip?: string;
    userAgent?: string;
  }) {
    if (input.actor.role !== "super_admin") {
      throw new ForbiddenError("Only super_admin can reset platform settings");
    }
    const doc = await getOrCreateDoc();
    const before = toDto(doc);
    Object.assign(doc, {
      ...DEFAULT_PLATFORM_SETTINGS,
      key: "default",
      updatedBy: input.actor.userId,
    });
    await doc.save();
    const after = toDto(doc);
    await writeAdminAudit({
      actorId: input.actor.userId,
      actorEmail: input.actor.email,
      action: "settings.reset",
      resource: "settings",
      resourceId: "default",
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
      ip: input.ip,
      userAgent: input.userAgent,
    });
    return after;
  }
}

export const platformSettingsService = new PlatformSettingsService();
