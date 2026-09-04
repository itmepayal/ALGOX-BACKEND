import { Router } from "express";
import { AuthController } from "../../controllers/auth.controller";
import { authenticateJwt } from "../../middlewares/auth.middleware";

const authRouter = Router();
const authController = new AuthController();

// Public Routes
authRouter.post("/signup", authController.register);
authRouter.post("/login", authController.login);
authRouter.post("/login/2fa", authController.verify2FALogin);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/forgot-password", authController.requestPasswordReset);
authRouter.post("/reset-password", authController.resetPassword);

// Authenticated Routes (Requires Bearer Access Token)
authRouter.post("/logout", authenticateJwt, authController.logout);
authRouter.post("/logout-all", authenticateJwt, authController.logoutAllSessions);
authRouter.get("/me", authenticateJwt, authController.getCurrentUser);
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

export default authRouter;
