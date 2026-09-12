import { Router } from "express";
import { AuthController } from "../../controllers/auth.controller";
import { authenticateJwt } from "../../middlewares/auth.middleware";
import { platformSettingsController } from "../../controllers/platformSettings.controller";
import { announcementController } from "../../controllers/announcement.controller";
import { notificationController } from "../../controllers/notification.controller";

const authRouter = Router();
const authController = new AuthController();

// Public Routes
authRouter.post("/signup", authController.register);
authRouter.post("/login", authController.login);
authRouter.post("/login/2fa", authController.verify2FALogin);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/forgot-password", authController.requestPasswordReset);
authRouter.post("/reset-password", authController.resetPassword);
authRouter.get(
  "/public/settings",
  platformSettingsController.getPublic.bind(platformSettingsController)
);

// Authenticated Routes (Requires Bearer Access Token)
authRouter.post("/logout", authenticateJwt, authController.logout);
authRouter.post("/logout-all", authenticateJwt, authController.logoutAllSessions);
authRouter.get("/me", authenticateJwt, authController.getCurrentUser);
authRouter.put("/profile", authenticateJwt, authController.updateProfile);
authRouter.post("/change-password", authenticateJwt, authController.changePassword);

// Email Verification
authRouter.post("/email/send-verification", authenticateJwt, authController.sendEmailVerification);
authRouter.post("/email/verify", authenticateJwt, authController.verifyEmailOtp);

// 2FA Security
authRouter.post("/2fa/toggle", authenticateJwt, authController.toggle2FA);

// Session Management & Security Audit Logs
authRouter.get("/sessions", authenticateJwt, authController.getActiveSessions);
authRouter.delete("/sessions/:sessionId", authenticateJwt, authController.revokeSession);
authRouter.get("/security-logs", authenticateJwt, authController.getSecurityLogs);

// User-facing announcements (PUBLISHED only, audience-filtered)
authRouter.get(
  "/announcements",
  authenticateJwt,
  announcementController.listForUser.bind(announcementController)
);

// User notifications (authenticated; notifications:view is staff-facing only)
authRouter.get(
  "/notifications",
  authenticateJwt,
  notificationController.list.bind(notificationController)
);
authRouter.get(
  "/notifications/unread-count",
  authenticateJwt,
  notificationController.unreadCount.bind(notificationController)
);
authRouter.post(
  "/notifications/read-all",
  authenticateJwt,
  notificationController.markAllRead.bind(notificationController)
);
authRouter.post(
  "/notifications/:id/read",
  authenticateJwt,
  notificationController.markRead.bind(notificationController)
);

export default authRouter;
