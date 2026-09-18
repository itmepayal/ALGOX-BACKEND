import { Request, Response, NextFunction } from "express";
import {
  signupSchema,
  loginSchema,
  resetPasswordRequestSchema,
  resetPasswordConfirmSchema,
  changePasswordSchema,
  verifyEmailOtpSchema,
  verify2FASchema,
  updateProfileSchema,
} from "../validators/auth.validator";
import { AuthService } from "../services/auth.service";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { sendResponse } from "../utils/helpers/response.helper";
import {
  HTTP_STATUS,
  AUTH_MESSAGES,
  COOKIE_NAME,
  REFRESH_COOKIE_OPTIONS,
} from "../utils/constants";
import { allowDevOtpExposure } from "../utils/helpers/otp.util";
import { toPublicAuthUser } from "../subscription/publicAuthUser";

const authService = new AuthService();

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(COOKIE_NAME, refreshToken, REFRESH_COOKIE_OPTIONS);
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: REFRESH_COOKIE_OPTIONS.httpOnly,
    secure: REFRESH_COOKIE_OPTIONS.secure,
    sameSite: REFRESH_COOKIE_OPTIONS.sameSite,
    path: REFRESH_COOKIE_OPTIONS.path,
  });
}

export class AuthController {
  async register(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      console.log("=== [REGISTER API START] ===");
      console.log("[Register Request Body]:", req.body);
      const validated = signupSchema.parse(req.body);
      console.log("[Register Schema Validated Successfully]");

      const user = await authService.register(validated, {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
      console.log(`[Register Service Success] New User Created -> ID: ${user._id}, Email: ${user.email}`);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: AUTH_MESSAGES.USER_REGISTERED,
        data: toPublicAuthUser(user),
      });
      console.log("=== [REGISTER API COMPLETED] ===");
    } catch (error) {
      console.error("[REGISTER API ERROR]:", error);
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      console.log("=== [LOGIN API START] ===");
      console.log("[Login Request Body]:", { email: req.body?.email });
      const validated = loginSchema.parse(req.body);
      console.log("[Login Schema Validated Successfully]");

      const result = await authService.login(validated, {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      if (result.require2FA) {
        const twoFa = result as {
          require2FA: true;
          userId: string;
          otp?: string;
        };
        console.log(
          `[Login Step] 2FA is ENABLED for User ID: ${twoFa.userId}. OTP Required.`
        );
        sendResponse({
          res,
          statusCode: HTTP_STATUS.OK,
          message: AUTH_MESSAGES.TWO_FACTOR_REQUIRED,
          data: {
            require2FA: true,
            userId: twoFa.userId,
            ...(allowDevOtpExposure() && twoFa.otp ? { otp: twoFa.otp } : {}),
          },
        });
        console.log("=== [LOGIN API COMPLETED (2FA Required)] ===");
        return;
      }

      console.log("[Login Step] Standard Login Direct Success. Issuing Tokens...");
      const { user, accessToken, refreshToken } = result;
      if (!accessToken || !refreshToken) {
        throw new Error("Login succeeded without tokens");
      }

      setRefreshCookie(res, refreshToken);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.LOGIN_SUCCESS,
        data: {
          accessToken,
          user: toPublicAuthUser(user),
        },
      });
      console.log("=== [LOGIN API COMPLETED (Success)] ===");
    } catch (error) {
      console.error("[LOGIN API ERROR]:", error);
      next(error);
    }
  }

  async verify2FALogin(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      console.log("=== [VERIFY 2FA LOGIN API START] ===");
      const { userId } = req.body;
      const validated = verify2FASchema.parse(req.body);
      console.log("[Verify 2FA Schema Validated Successfully]");

      const { user, accessToken, refreshToken } =
        await authService.verify2FALogin(userId, validated, {
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        });

      console.log(
        `[Verify 2FA Service Success] OTP verified for User ID: ${user._id}`
      );

      setRefreshCookie(res, refreshToken);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.TWO_FACTOR_LOGIN_SUCCESS,
        data: {
          accessToken,
          user: toPublicAuthUser(user),
        },
      });
      console.log("=== [VERIFY 2FA LOGIN API COMPLETED] ===");
    } catch (error) {
      console.error("[VERIFY 2FA LOGIN API ERROR]:", error);
      next(error);
    }
  }

  async refresh(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const tokenFromCookie = req.cookies?.[COOKIE_NAME];
      const tokenFromBody = req.body?.refreshToken;
      const refreshToken = tokenFromCookie || tokenFromBody;

      const result = await authService.refresh(refreshToken);

      setRefreshCookie(res, result.refreshToken);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.TOKENS_REFRESHED,
        data: { accessToken: result.accessToken },
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const refreshToken =
        req.cookies?.[COOKIE_NAME] || req.body?.refreshToken;
      await authService.logout(refreshToken, req.user?.userId);

      clearRefreshCookie(res);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.LOGOUT_SUCCESS,
      });
    } catch (error) {
      next(error);
    }
  }

  async logoutAllSessions(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await authService.logoutAllSessions(userId);
      clearRefreshCookie(res);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async getCurrentUser(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        sendResponse({
          res,
          statusCode: HTTP_STATUS.UNAUTHORIZED,
          message: AUTH_MESSAGES.INVALID_OR_EXPIRED_TOKEN,
        });
        return;
      }

      const user = await authService.getCurrentUser(userId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.PROFILE_RETRIEVED,
        data: toPublicAuthUser(user),
      });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const validated = changePasswordSchema.parse(req.body);
      const result = await authService.changePassword(userId, validated, {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      clearRefreshCookie(res);
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async sendEmailVerification(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const result = await authService.sendEmailVerification(userId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: result.message,
        ...(allowDevOtpExposure() && result.otp
          ? { data: { otp: result.otp } }
          : {}),
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyEmailOtp(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const validated = verifyEmailOtpSchema.parse(req.body);
      const result = await authService.verifyEmailOtp(userId, validated);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async toggle2FA(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { enable } = req.body;
      const result = await authService.toggle2FA(userId, Boolean(enable));

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: result.message,
        data: { twoFactorEnabled: result.twoFactorEnabled },
      });
    } catch (error) {
      next(error);
    }
  }

  async getActiveSessions(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const sessions = await authService.getActiveSessions(userId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.ACTIVE_SESSIONS_RETRIEVED,
        data: sessions,
      });
    } catch (error) {
      next(error);
    }
  }

  async revokeSession(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const { sessionId } = req.params;
      const result = await authService.revokeSession(userId, sessionId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSecurityLogs(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const logs = await authService.getSecurityLogs(userId);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.SECURITY_LOGS_RETRIEVED,
        data: logs,
      });
    } catch (error) {
      next(error);
    }
  }

  async requestPasswordReset(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = resetPasswordRequestSchema.parse(req.body);
      const result = await authService.requestPasswordReset(validated.email);

      // Never include OTP — would reveal account existence even in non-production.
      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = resetPasswordConfirmSchema.parse(req.body);
      const result = await authService.resetPassword(validated);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user!.userId;
      const validated = updateProfileSchema.parse(req.body);
      const result = await authService.updateUserProfile(userId, validated);

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: result.message,
        data: result.user,
      });
    } catch (error) {
      next(error);
    }
  }
}
