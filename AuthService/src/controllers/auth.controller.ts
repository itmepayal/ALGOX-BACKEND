import { Request, Response, NextFunction } from "express";
import {
  signupSchema,
  loginSchema,
  resetPasswordRequestSchema,
  resetPasswordConfirmSchema,
  changePasswordSchema,
  verifyEmailOtpSchema,
  verify2FASchema,
} from "../validators/auth.validator";
import { AuthService } from "../services/auth.service";
import { AuthenticatedRequest } from "../middlewares/auth.middleware";
import { sendResponse } from "../utils/helpers/response.helper";
import {
  HTTP_STATUS,
  AUTH_MESSAGES,
  COOKIE_NAME,
  TIME_CONSTANTS,
} from "../utils/constants";

const authService = new AuthService();

export class AuthController {
  async register(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const validated = signupSchema.parse(req.body);
      const user = await authService.register(validated, {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.CREATED,
        message: AUTH_MESSAGES.USER_REGISTERED,
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = loginSchema.parse(req.body);
      const result = await authService.login(validated, {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      if (result.require2FA) {
        sendResponse({
          res,
          statusCode: HTTP_STATUS.OK,
          message: AUTH_MESSAGES.TWO_FACTOR_REQUIRED,
          data: {
            require2FA: true,
            userId: result.userId,
            ...(result.otp && { otp: result.otp }),
          },
        });
        return;
      }

      const { user, accessToken, refreshToken } = result;

      res.cookie(COOKIE_NAME, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: TIME_CONSTANTS.REFRESH_TOKEN_EXPIRY_MS,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.LOGIN_SUCCESS,
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user?._id,
            name: user?.name,
            email: user?.email,
            role: user?.role,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async verify2FALogin(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { userId } = req.body;
      const validated = verify2FASchema.parse(req.body);
      const { user, accessToken, refreshToken } =
        await authService.verify2FALogin(userId, validated, {
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        });

      res.cookie(COOKIE_NAME, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: TIME_CONSTANTS.REFRESH_TOKEN_EXPIRY_MS,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.TWO_FACTOR_LOGIN_SUCCESS,
        data: {
          accessToken,
          refreshToken,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
        },
      });
    } catch (error) {
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

      res.cookie(COOKIE_NAME, result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: TIME_CONSTANTS.REFRESH_TOKEN_EXPIRY_MS,
      });

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: AUTH_MESSAGES.TOKENS_REFRESHED,
        data: result,
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

      res.clearCookie(COOKIE_NAME);
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
      res.clearCookie(COOKIE_NAME);
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
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          twoFactorEnabled: user.twoFactorEnabled,
        },
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

      res.clearCookie(COOKIE_NAME);
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
        ...(process.env.NODE_ENV !== "production" && {
          data: { otp: result.otp },
        }),
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

      sendResponse({
        res,
        statusCode: HTTP_STATUS.OK,
        message: result.message,
        ...(process.env.NODE_ENV !== "production" && {
          data: { otp: result.otp },
        }),
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
}
