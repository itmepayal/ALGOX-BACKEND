import mongoose, { Document, Schema } from "mongoose";

export type JudgeLanguage = "cpp" | "python" | "javascript" | "java";

export interface IPlatformSettings extends Document {
  key: string;
  platformName: string;
  logoUrl: string;
  faviconUrl: string;
  supportEmail: string;
  tagline: string;
  defaultLanguage: JudgeLanguage;
  supportedLanguages: JudgeLanguage[];
  defaultPageSize: number;
  maxPageSize: number;
  maxSubmissionsPerHour: number;
  maxRunPerHour: number;
  maxCodeLength: number;
  concurrentSubmissionCap: number;
  defaultTimeoutMs: number;
  defaultMemoryMb: number;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  allowAdminBypass: boolean;
  registrationEnabled: boolean;
  requireEmailVerification: boolean;
  discussionsEnabled: boolean;
  requireAuthToPost: boolean;
  emailNotificationsEnabled: boolean;
  announceNewSheets: boolean;
  announceMaintenance: boolean;
  updatedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_PLATFORM_SETTINGS: Omit<
  IPlatformSettings,
  keyof Document | "createdAt" | "updatedAt"
> = {
  key: "default",
  platformName: "AlgoPath",
  logoUrl: "",
  faviconUrl: "",
  supportEmail: "",
  tagline: "Master Coding & System Design",
  defaultLanguage: "javascript",
  supportedLanguages: ["cpp", "python", "javascript", "java"],
  defaultPageSize: 20,
  maxPageSize: 100,
  maxSubmissionsPerHour: 60,
  maxRunPerHour: 120,
  maxCodeLength: 64_000,
  concurrentSubmissionCap: 3,
  defaultTimeoutMs: 5000,
  defaultMemoryMb: 256,
  maintenanceMode: false,
  maintenanceMessage: "AlgoPath is under maintenance. Please check back soon.",
  allowAdminBypass: true,
  registrationEnabled: true,
  requireEmailVerification: false,
  discussionsEnabled: true,
  requireAuthToPost: true,
  emailNotificationsEnabled: false,
  announceNewSheets: true,
  announceMaintenance: true,
  updatedBy: null,
};

const platformSettingsSchema = new Schema<IPlatformSettings>(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    platformName: { type: String, default: DEFAULT_PLATFORM_SETTINGS.platformName },
    logoUrl: { type: String, default: "" },
    faviconUrl: { type: String, default: "" },
    supportEmail: { type: String, default: "" },
    tagline: { type: String, default: DEFAULT_PLATFORM_SETTINGS.tagline },
    defaultLanguage: {
      type: String,
      enum: ["cpp", "python", "javascript", "java"],
      default: "javascript",
    },
    supportedLanguages: {
      type: [String],
      default: ["cpp", "python", "javascript", "java"],
    },
    defaultPageSize: { type: Number, default: 20 },
    maxPageSize: { type: Number, default: 100 },
    maxSubmissionsPerHour: { type: Number, default: 60 },
    maxRunPerHour: { type: Number, default: 120 },
    maxCodeLength: { type: Number, default: 64000 },
    concurrentSubmissionCap: { type: Number, default: 3 },
    defaultTimeoutMs: { type: Number, default: 5000 },
    defaultMemoryMb: { type: Number, default: 256 },
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: {
      type: String,
      default: DEFAULT_PLATFORM_SETTINGS.maintenanceMessage,
    },
    allowAdminBypass: { type: Boolean, default: true },
    registrationEnabled: { type: Boolean, default: true },
    requireEmailVerification: { type: Boolean, default: false },
    discussionsEnabled: { type: Boolean, default: true },
    requireAuthToPost: { type: Boolean, default: true },
    emailNotificationsEnabled: { type: Boolean, default: false },
    announceNewSheets: { type: Boolean, default: true },
    announceMaintenance: { type: Boolean, default: true },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true }
);

export const PlatformSettings = mongoose.model<IPlatformSettings>(
  "PlatformSettings",
  platformSettingsSchema
);
