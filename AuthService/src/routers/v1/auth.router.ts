import { Router } from "express";
import { AuthController } from "../../controllers/auth.controller";
import { authenticateJwt } from "../../middlewares/auth.middleware";
import { requireFeatureFlag } from "../../middlewares/featureFlag.middleware";
import { platformSettingsController } from "../../controllers/platformSettings.controller";
import { announcementController } from "../../controllers/announcement.controller";
import { notificationController } from "../../controllers/notification.controller";

const authRouter = Router();
const authController = new AuthController();

authRouter.post("/signup", requireFeatureFlag("registration"), authController.register);
authRouter.post("/login", authController.login);
authRouter.post("/login/2fa", authController.verify2FALogin);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/forgot-password", authController.requestPasswordReset);
authRouter.post("/reset-password", authController.resetPassword);
authRouter.get(
  "/public/settings",
  platformSettingsController.getPublic.bind(platformSettingsController)
);

authRouter.post("/logout", authenticateJwt, authController.logout);
authRouter.post("/logout-all", authenticateJwt, authController.logoutAllSessions);
authRouter.get("/me", authenticateJwt, authController.getCurrentUser);
authRouter.put("/profile", authenticateJwt, authController.updateProfile);
authRouter.post("/change-password", authenticateJwt, authController.changePassword);

authRouter.post("/email/send-verification", authenticateJwt, authController.sendEmailVerification);
authRouter.post("/email/verify", authenticateJwt, authController.verifyEmailOtp);

authRouter.post("/2fa/toggle", authenticateJwt, authController.toggle2FA);

authRouter.get("/sessions", authenticateJwt, authController.getActiveSessions);
authRouter.delete("/sessions/:sessionId", authenticateJwt, authController.revokeSession);
authRouter.get("/security-logs", authenticateJwt, authController.getSecurityLogs);

authRouter.get(
  "/announcements",
  authenticateJwt,
  announcementController.listForUser.bind(announcementController)
);

authRouter.get(
  "/notifications",
  authenticateJwt,
  requireFeatureFlag("notifications"),
  notificationController.list.bind(notificationController)
);
authRouter.get(
  "/notifications/unread-count",
  authenticateJwt,
  requireFeatureFlag("notifications"),
  notificationController.unreadCount.bind(notificationController)
);
authRouter.post(
  "/notifications/read-all",
  authenticateJwt,
  requireFeatureFlag("notifications"),
  notificationController.markAllRead.bind(notificationController)
);
authRouter.post(
  "/notifications/:id/read",
  authenticateJwt,
  requireFeatureFlag("notifications"),
  notificationController.markRead.bind(notificationController)
);

export default authRouter;
