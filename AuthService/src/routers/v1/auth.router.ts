import { Router } from "express";
import { AuthController } from "../../controllers/auth.controller";
import { authenticateJwt } from "../../middlewares/auth.middleware";
import { requireFeatureFlag } from "../../middlewares/featureFlag.middleware";
import { authSensitiveRateLimit, billingMutationRateLimit } from "../../middlewares/rateLimit.middleware";
import { platformSettingsController } from "../../controllers/platformSettings.controller";
import { announcementController } from "../../controllers/announcement.controller";
import { notificationController } from "../../controllers/notification.controller";
import { entitlementController } from "../../subscription/entitlement.controller";
import { requireEntitlement } from "../../subscription/entitlement.middleware";
import { subscriptionController } from "../../subscription/subscription.controller";
import { billingController } from "../../billing/billing.controller";

const authRouter = Router();
const authController = new AuthController();

authRouter.post(
  "/signup",
  authSensitiveRateLimit("signup"),
  requireFeatureFlag("registration"),
  authController.register
);
authRouter.post("/login", authSensitiveRateLimit("login"), authController.login);
authRouter.post(
  "/login/2fa",
  authSensitiveRateLimit("login-2fa"),
  authController.verify2FALogin
);
authRouter.post(
  "/refresh",
  authSensitiveRateLimit("refresh"),
  authController.refresh
);
authRouter.post(
  "/forgot-password",
  authSensitiveRateLimit("forgot-password"),
  authController.requestPasswordReset
);
authRouter.post(
  "/reset-password",
  authSensitiveRateLimit("reset-password"),
  authController.resetPassword
);
authRouter.get(
  "/public/settings",
  platformSettingsController.getPublic.bind(platformSettingsController)
);

authRouter.post("/logout", authenticateJwt, authController.logout);
authRouter.post("/logout-all", authenticateJwt, authController.logoutAllSessions);
authRouter.get("/me", authenticateJwt, authController.getCurrentUser);
authRouter.put("/profile", authenticateJwt, authController.updateProfile);
authRouter.post("/change-password", authenticateJwt, authController.changePassword);

authRouter.get(
  "/entitlements/me",
  authenticateJwt,
  entitlementController.getMine.bind(entitlementController)
);
authRouter.get(
  "/entitlements/catalog",
  authenticateJwt,
  entitlementController.listCatalog.bind(entitlementController)
);
authRouter.get(
  "/entitlements/probe/:feature",
  authenticateJwt,
  (req, res, next) =>
    requireEntitlement(String(req.params.feature))(req, res, next),
  entitlementController.probeAllowed.bind(entitlementController)
);

/** Subscription APIs — owner-scoped; never client-activated premium. */
authRouter.get(
  "/subscription",
  authenticateJwt,
  billingMutationRateLimit("subscription-read"),
  subscriptionController.getMine.bind(subscriptionController)
);
authRouter.get(
  "/subscription/entitlements",
  authenticateJwt,
  billingMutationRateLimit("subscription-read"),
  subscriptionController.getEntitlements.bind(subscriptionController)
);
authRouter.get(
  "/subscription/history",
  authenticateJwt,
  billingMutationRateLimit("subscription-read"),
  subscriptionController.getHistory.bind(subscriptionController)
);
authRouter.post(
  "/subscription/cancel",
  authenticateJwt,
  billingMutationRateLimit("cancel"),
  subscriptionController.cancel.bind(subscriptionController)
);
authRouter.post(
  "/subscription/resume",
  authenticateJwt,
  billingMutationRateLimit("resume"),
  subscriptionController.resume.bind(subscriptionController)
);
authRouter.post(
  "/subscription",
  authenticateJwt,
  billingMutationRateLimit("checkout"),
  subscriptionController.rejectActivate.bind(subscriptionController)
);

authRouter.get(
  "/subscription/billing",
  authenticateJwt,
  billingMutationRateLimit("subscription-read"),
  billingController.getConfig.bind(billingController)
);
authRouter.post(
  "/subscription/checkout",
  authenticateJwt,
  billingMutationRateLimit("checkout"),
  billingController.createCheckout.bind(billingController)
);

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
