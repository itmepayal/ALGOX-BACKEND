import { z } from "zod";

const objectIdRegex = /^[a-fA-F0-9]{24}$/;

export const announcementTypeEnum = z.enum([
  "INFO",
  "SUCCESS",
  "WARNING",
  "MAINTENANCE",
  "CONTEST",
  "PLATFORM_UPDATE",
]);

export const announcementAudienceEnum = z.enum([
  "ALL_USERS",
  "ONLINE_USERS",
  "SPECIFIC_USERS",
  "SPECIFIC_ROLES",
]);

export const announcementStatusEnum = z.enum([
  "DRAFT",
  "SCHEDULED",
  "PUBLISHED",
  "EXPIRED",
  "ARCHIVED",
]);

export const roleEnum = z.enum([
  "user",
  "moderator",
  "content_manager",
  "admin",
  "super_admin",
]);

export const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  type: announcementTypeEnum.optional().default("INFO"),
  priority: z.number().int().min(0).max(100).optional().default(0),
  audience: announcementAudienceEnum.optional().default("ALL_USERS"),
  targetUsers: z.array(z.string().regex(objectIdRegex)).optional().default([]),
  targetRoles: z.array(roleEnum).optional().default([]),
  actionUrl: z.string().max(500).optional().default(""),
  scheduledAt: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const updateAnnouncementSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    message: z.string().min(1).max(5000).optional(),
    type: announcementTypeEnum.optional(),
    priority: z.number().int().min(0).max(100).optional(),
    audience: announcementAudienceEnum.optional(),
    targetUsers: z.array(z.string().regex(objectIdRegex)).optional(),
    targetRoles: z.array(roleEnum).optional(),
    actionUrl: z.string().max(500).optional(),
    scheduledAt: z.coerce.date().optional().nullable(),
    expiresAt: z.coerce.date().optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const scheduleAnnouncementSchema = z.object({
  scheduledAt: z.coerce.date(),
});

export const listAnnouncementsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional().default(""),
  status: z.union([announcementStatusEnum, z.literal("all")]).optional().default("all"),
  type: z.union([announcementTypeEnum, z.literal("all")]).optional().default("all"),
});

export const ingestAuditSchema = z.object({
  action: z.string().min(1).max(128),
  resource: z.string().min(1).max(128),
  resourceId: z.string().max(128).optional(),
  before: z.record(z.unknown()).optional(),
  after: z.record(z.unknown()).optional(),
});

export type CreateAnnouncementDto = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementDto = z.infer<typeof updateAnnouncementSchema>;
export type ScheduleAnnouncementDto = z.infer<typeof scheduleAnnouncementSchema>;
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;
export type IngestAuditDto = z.infer<typeof ingestAuditSchema>;
