import { Router } from "express";
import {
  authenticateJwt,
  requirePermission,
  requireStaff,
} from "../../middlewares/auth.middleware";
import { adminUserController } from "../../controllers/adminUser.controller";
import { platformSettingsController } from "../../controllers/platformSettings.controller";
import { announcementController } from "../../controllers/announcement.controller";
import { auditIngestController } from "../../controllers/auditIngest.controller";

const adminRouter = Router();

adminRouter.use(authenticateJwt);

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

adminRouter.get(
  "/users/:id",
  requirePermission("users:view"),
  adminUserController.getUser.bind(adminUserController)
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

/** Cross-service audit intake (Realtime, Discussion, Sheets, etc.). Staff JWT required. */
adminRouter.post(
  "/audit",
  requireStaff,
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

export default adminRouter;
