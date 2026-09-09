import { User, IUser } from "../models/user.model";
import { SecurityLog } from "../models/securityLog.model";
import { sessionRepository } from "../repositories/session.repository";
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
} from "../utils/errors/app.error";
import {
  SignupDto,
  LoginDto,
  ResetPasswordConfirmDto,
  ChangePasswordDto,
  VerifyEmailOtpDto,
  Verify2FADto,
  UpdateProfileDto,
} from "../validators/auth.validator";
import { uploadToCloudinary } from "../utils/helpers/cloudinary.util";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/helpers/jwt.util";
import { saveOTP, verifyOTP, sendOTPEmail } from "../utils/helpers/otp.util";
import {
  AUTH_MESSAGES,
  TIME_CONSTANTS,
  SECURITY_ACTIONS,
} from "../utils/constants";

export class AuthService {
  private async logSecurityAction(
    userId: string,
    action: string,
    meta?: { ip?: string; userAgent?: string }
  ) {
    try {
      await SecurityLog.create({
        userId,
        action,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      });
    } catch {
      // Non-blocking log failure
    }
  }

  async register(
    data: SignupDto,
    meta?: { ip?: string; userAgent?: string }
  ): Promise<IUser> {
    console.log(`[AuthService.register] Checking existing user for email: ${data.email}`);
    const existing = await User.findOne({ email: data.email });
    if (existing) {
      console.warn(`[AuthService.register] User already exists: ${data.email}`);
      throw new BadRequestError(AUTH_MESSAGES.USER_ALREADY_EXISTS);
    }

    console.log(`[AuthService.register] Creating new user in MongoDB...`);
    const user = await User.create(data);
    console.log(`[AuthService.register] User saved successfully. User ID: ${user._id}`);
    await this.logSecurityAction(
      user._id.toString(),
      SECURITY_ACTIONS.USER_REGISTERED,
      meta
    );
    return user;
  }

  async login(data: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    console.log(`[AuthService.login] Querying user in MongoDB for email: ${data.email}`);
    const user = await User.findOne({ email: data.email }).select(
      "+password +twoFactorSecret"
    );
    if (!user) {
      console.warn(`[AuthService.login] User not found: ${data.email}`);
      throw new UnauthorizedError(AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    if (user.isLocked()) {
      console.warn(`[AuthService.login] Account is locked for email: ${data.email}`);
      throw new UnauthorizedError(AUTH_MESSAGES.ACCOUNT_LOCKED);
    }

    console.log(`[AuthService.login] Verifying password for email: ${data.email}`);
    const isMatch = await user.comparePassword(data.password);
    if (!isMatch) {
      console.warn(`[AuthService.login] Invalid password attempt for email: ${data.email}`);
      user.loginAttempts += 1;
      if (user.loginAttempts >= TIME_CONSTANTS.MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(
          Date.now() + TIME_CONSTANTS.LOCKOUT_DURATION_MS
        );
      }
      await user.save();
      await this.logSecurityAction(
        user._id.toString(),
        SECURITY_ACTIONS.LOGIN_FAILED,
        meta
      );
      throw new UnauthorizedError(AUTH_MESSAGES.INVALID_CREDENTIALS);
    }

    console.log(`[AuthService.login] Password matched. Resetting login attempts.`);
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    if (user.twoFactorEnabled) {
      console.log(`[AuthService.login] 2FA is ENABLED for User: ${user._id}. Generating OTP code...`);
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      await saveOTP(`2fa:${user._id.toString()}`, otp);
      console.log(`[AuthService.login] 2FA OTP Generated: ${otp}. Dispatching Email via Resend...`);
      sendOTPEmail(user.email, otp, "Your LeetCode 2FA Login Code").catch(err => console.error("Email error:", err));
      return {
        require2FA: true,
        userId: user._id.toString(),
        otp: process.env.NODE_ENV !== "production" ? otp : undefined,
      };
    }

    console.log(`[AuthService.login] 2FA disabled. Generating JWT Access & Refresh Tokens...`);
    const payload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    console.log(`[AuthService.login] Creating session record in DB...`);
    await sessionRepository.create({
      userId: user._id,
      refreshToken,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      expiresAt: new Date(Date.now() + TIME_CONSTANTS.REFRESH_TOKEN_EXPIRY_MS),
    });

    await this.logSecurityAction(
      user._id.toString(),
      SECURITY_ACTIONS.LOGIN_SUCCESS,
      meta
    );
    console.log(`[AuthService.login] Login completed successfully for User: ${user._id}`);
    return { require2FA: false, user, accessToken, refreshToken };
  }

  async verify2FALogin(
    userId: string,
    data: Verify2FADto,
    meta?: { ip?: string; userAgent?: string }
  ) {
    console.log(`[AuthService.verify2FALogin] Looking up user by ID: ${userId}`);
    const user = await User.findById(userId);
    if (!user) {
      console.warn(`[AuthService.verify2FALogin] User not found for ID: ${userId}`);
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    console.log(`[AuthService.verify2FALogin] Verifying OTP: ${data.otp} for User: ${userId}`);
    await verifyOTP(`2fa:${userId}`, data.otp);
    console.log(`[AuthService.verify2FALogin] OTP matched successfully!`);

    const payload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await sessionRepository.create({
      userId: user._id,
      refreshToken,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
      expiresAt: new Date(Date.now() + TIME_CONSTANTS.REFRESH_TOKEN_EXPIRY_MS),
    });

    await this.logSecurityAction(
      user._id.toString(),
      SECURITY_ACTIONS.TWO_FACTOR_LOGIN_SUCCESS,
      meta
    );


    return { user, accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedError(AUTH_MESSAGES.REFRESH_TOKEN_REQUIRED);
    }

    const decoded = verifyRefreshToken(refreshToken);
    const session = await sessionRepository.findByToken(refreshToken);

    if (!session) {
      throw new UnauthorizedError(AUTH_MESSAGES.SESSION_EXPIRED);
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    const payload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    await sessionRepository.deleteByToken(refreshToken);
    await sessionRepository.create({
      userId: user._id,
      refreshToken: newRefreshToken,
      expiresAt: new Date(Date.now() + TIME_CONSTANTS.REFRESH_TOKEN_EXPIRY_MS),
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string, userId?: string) {
    if (refreshToken) {
      await sessionRepository.deleteByToken(refreshToken);
    }
    if (userId) {
      await this.logSecurityAction(userId, SECURITY_ACTIONS.LOGOUT);
    }
  }

  async logoutAllSessions(userId: string) {
    await sessionRepository.deleteByUser(userId);
    await this.logSecurityAction(userId, SECURITY_ACTIONS.LOGOUT_ALL_SESSIONS);
    return { message: AUTH_MESSAGES.LOGOUT_ALL_SUCCESS };
  }

  async getCurrentUser(userId: string): Promise<IUser> {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }
    return user;
  }

  async changePassword(
    userId: string,
    data: ChangePasswordDto,
    meta?: { ip?: string; userAgent?: string }
  ) {
    const user = await User.findById(userId).select("+password");
    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    const isMatch = await user.comparePassword(data.currentPassword);
    if (!isMatch) {
      throw new BadRequestError(AUTH_MESSAGES.CURRENT_PASSWORD_INCORRECT);
    }

    user.password = data.newPassword;
    await user.save();

    await sessionRepository.deleteByUser(userId);
    await this.logSecurityAction(
      userId,
      SECURITY_ACTIONS.PASSWORD_CHANGED,
      meta
    );

    return { message: AUTH_MESSAGES.PASSWORD_CHANGED };
  }

  async sendEmailVerification(userId: string) {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }
    if (user.isEmailVerified) {
      throw new BadRequestError(AUTH_MESSAGES.EMAIL_ALREADY_VERIFIED);
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await saveOTP(`emailVerify:${userId}`, otp);

    return { message: AUTH_MESSAGES.EMAIL_VERIFICATION_SENT, otp };
  }

  async verifyEmailOtp(userId: string, data: VerifyEmailOtpDto) {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    await verifyOTP(`emailVerify:${userId}`, data.otp);

    user.isEmailVerified = true;
    await user.save();

    await this.logSecurityAction(userId, SECURITY_ACTIONS.EMAIL_VERIFIED);

    return { message: AUTH_MESSAGES.EMAIL_VERIFIED_SUCCESS };
  }

  async toggle2FA(userId: string, enable: boolean) {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    user.twoFactorEnabled = enable;
    await user.save();

    await this.logSecurityAction(
      userId,
      enable
        ? SECURITY_ACTIONS.TWO_FACTOR_ENABLED
        : SECURITY_ACTIONS.TWO_FACTOR_DISABLED
    );


    return {
      message: `2FA ${enable ? "enabled" : "disabled"} successfully`,
      twoFactorEnabled: user.twoFactorEnabled,
    };
  }

  async getActiveSessions(userId: string) {
    const sessions = await sessionRepository.findByUser(userId);
    return sessions;
  }

  async revokeSession(userId: string, sessionId: string) {
    await sessionRepository.deleteById(sessionId, userId);
    await this.logSecurityAction(userId, `SESSION_REVOKED_${sessionId}`);
    return { message: AUTH_MESSAGES.SESSION_REVOKED };
  }

  async getSecurityLogs(userId: string) {
    const logs = await SecurityLog.find({ userId })
      .sort({ createdAt: -1 })
      .limit(25);
    return logs;
  }

  async requestPasswordReset(email: string) {
    const user = await User.findOne({ email });
    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND_EMAIL);
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await saveOTP(`reset:${user._id.toString()}`, otp);

    return { message: AUTH_MESSAGES.PASSWORD_RESET_OTP_SENT, otp };
  }

  async resetPassword(data: ResetPasswordConfirmDto) {
    const user = await User.findOne({ email: data.email });
    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    await verifyOTP(`reset:${user._id.toString()}`, data.otp);

    user.password = data.newPassword;
    await user.save();

    await sessionRepository.deleteByUser(user._id.toString());
    await this.logSecurityAction(
      user._id.toString(),
      SECURITY_ACTIONS.PASSWORD_RESET
    );

    return { message: AUTH_MESSAGES.PASSWORD_RESET_SUCCESS };
  }

  async updateUserProfile(userId: string, data: UpdateProfileDto) {
    const user = await User.findById(userId);
    if (!user) {
      throw new NotFoundError(AUTH_MESSAGES.USER_NOT_FOUND);
    }

    if (data.name) {
      user.name = data.name.trim();
    }

    if (data.avatar) {
      if (data.avatar.startsWith("data:image/") || data.avatar.startsWith("http")) {
        let avatarUrl = data.avatar;
        if (data.avatar.startsWith("data:image/")) {
          avatarUrl = await uploadToCloudinary(data.avatar, "leetcode_avatars");
        }
        user.avatar = avatarUrl;
      }
    }

    await user.save();
    await this.logSecurityAction(userId, "PROFILE_UPDATED");

    return {
      message: "Profile updated successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        twoFactorEnabled: user.twoFactorEnabled,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }
}
