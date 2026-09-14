import { Router } from "express";
import {
  authenticateJwt,
  requirePermission,
  requireInternalSecret,
} from "../../middlewares/auth.middleware";
import { adminMutationRateLimit } from "../../middlewares/rateLimit.middleware";
import { adminUserController } from "../../controllers/adminUser.controller";
import { platformSettingsController } from "../../controllers/platformSettings.controller";
import { announcementController } from "../../controllers/announcement.controller";
import { auditIngestController } from "../../controllers/auditIngest.controller";
import { adminNotificationController } from "../../controllers/adminNotification.controller";
import { rolePermissionController } from "../../controllers/rolePermission.controller";

const adminRouter = Router();

adminRouter.use(authenticateJwt);
adminRouter.use(adminMutationRateLimit());

adminRouter.get(
  "/me/permissions",
  requirePermission("admin:view"),
  adminUserController.myPermissions.bind(adminUserController)
);

adminRouter.get(
  "/settings",
  requirePermission("settings:view"),
  platformSettingsController.getAdmin.bind(platformSettingsController)
);

adminRouter.patch(
  "/settings",
  requirePermission("settings:update"),
  platformSettingsController.update.bind(platformSettingsController)
);

adminRouter.post(
  "/settings/reset",
  requirePermission("settings:update"),
  platformSettingsController.reset.bind(platformSettingsController)
);

adminRouter.get(
  "/users",
  requirePermission("users:view"),
  adminUserController.listUsers.bind(adminUserController)
);

adminRouter.post(
  "/users",
  requirePermission("users:create"),
  adminUserController.createUser.bind(adminUserController)
);

adminRouter.get(
  "/users/:id",
  requirePermission("users:view"),
  adminUserController.getUser.bind(adminUserController)
);

adminRouter.delete(
  "/users/:id",
  requirePermission("users:delete"),
  adminUserController.softDeleteUser.bind(adminUserController)
);

adminRouter.post(
  "/users/:id/reset-password",
  requirePermission("users:update"),
  adminUserController.resetPassword.bind(adminUserController)
);

adminRouter.get(
  "/users/:id/activity",
  requirePermission("users:view"),
  adminUserController.getUserActivity.bind(adminUserController)
);

adminRouter.get(
  "/users/:id/progress",
  requirePermission("users:view"),
  adminUserController.getUserProgress.bind(adminUserController)
);

adminRouter.get(
  "/users/:id/sessions",
  requirePermission("users:view"),
  adminUserController.listUserSessions.bind(adminUserController)
);

adminRouter.delete(
  "/users/:id/sessions/:sessionId",
  requirePermission("users:update"),
  adminUserController.revokeUserSession.bind(adminUserController)
);

adminRouter.delete(
  "/users/:id/sessions",
  requirePermission("users:update"),
  adminUserController.revokeAllUserSessions.bind(adminUserController)
);

adminRouter.patch(
  "/users/:id/role",
  requirePermission("users:update"),
  adminUserController.updateRole.bind(adminUserController)
);

adminRouter.patch(
  "/users/:id/status",
  requirePermission("users:update"),
  adminUserController.updateStatus.bind(adminUserController)
);

adminRouter.get(
  "/audit-logs",
  requirePermission("audit:view"),
  adminUserController.listAuditLogs.bind(adminUserController)
);

/** Cross-service audit intake — JWT (401 without) + internal secret (403 if forged staff). */
adminRouter.post(
  "/audit",
  requireInternalSecret,
  auditIngestController.ingest.bind(auditIngestController)
);

/** Internal KPI fan-in — protected by shared internal secret or staff JWT. */
adminRouter.get(
  "/internal/user-stats",
  requirePermission("analytics:view"),
  adminUserController.internalStats.bind(adminUserController)
);

// ── Announcements (admin) ──────────────────────────────────────────────
adminRouter.get(
  "/announcements",
  requirePermission("announcements:view"),
  announcementController.listAdmin.bind(announcementController)
);

adminRouter.get(
  "/announcements/:id",
  requirePermission("announcements:view"),
  announcementController.getById.bind(announcementController)
);

adminRouter.post(
  "/announcements",
  requirePermission("announcements:create"),
  announcementController.create.bind(announcementController)
);

adminRouter.patch(
  "/announcements/:id",
  requirePermission("announcements:create"),
  announcementController.update.bind(announcementController)
);

adminRouter.post(
  "/announcements/:id/schedule",
  requirePermission("announcements:publish"),
  announcementController.schedule.bind(announcementController)
);

adminRouter.post(
  "/announcements/:id/publish",
  requirePermission("announcements:publish"),
  announcementController.publish.bind(announcementController)
);

adminRouter.post(
  "/announcements/:id/expire",
  requirePermission("announcements:publish"),
  announcementController.expire.bind(announcementController)
);

adminRouter.post(
  "/announcements/:id/archive",
  requirePermission("announcements:publish"),
  announcementController.archive.bind(announcementController)
);

// ── Admin notifications (inbox fan-out) ───────────────────────────────
adminRouter.get(
  "/notifications",
  requirePermission("notifications:view"),
  adminNotificationController.list.bind(adminNotificationController)
);

adminRouter.post(
  "/notifications",
  requirePermission("notifications:create"),
  adminNotificationController.create.bind(adminNotificationController)
);

adminRouter.get(
  "/notifications/campaigns",
  requirePermission("notifications:view"),
  adminNotificationController.listCampaigns.bind(adminNotificationController)
);

adminRouter.post(
  "/notifications/campaigns/:id/cancel",
  requirePermission("notifications:manage"),
  adminNotificationController.cancelCampaign.bind(adminNotificationController)
);

adminRouter.delete(
  "/notifications/:id",
  requirePermission("notifications:manage"),
  adminNotificationController.remove.bind(adminNotificationController)
);

// ── Roles & permissions matrix ───────────────────────────────────────
adminRouter.get(
  "/roles/matrix",
  requirePermission("admin:view"),
  rolePermissionController.getMatrix.bind(rolePermissionController)
);

adminRouter.put(
  "/roles/:role/permissions",
  requirePermission("admin:view"),
  rolePermissionController.updateRole.bind(rolePermissionController)
);

adminRouter.post(
  "/roles/:role/reset",
  requirePermission("admin:view"),
  rolePermissionController.resetRole.bind(rolePermissionController)
);

export default adminRouter;
