/**
 * Application Constants
 */

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const AUTH_MESSAGES = {
  USER_REGISTERED: "User registered successfully",
  LOGIN_SUCCESS: "Login successful",
  LOGOUT_SUCCESS: "Logged out successfully",
  LOGOUT_ALL_SUCCESS: "All sessions logged out successfully",
  TOKENS_REFRESHED: "Tokens refreshed successfully",
  PROFILE_RETRIEVED: "Profile retrieved successfully",
  PASSWORD_CHANGED: "Password updated successfully. Please login again.",
  PASSWORD_RESET_SUCCESS: "Password reset successfully. Please login again.",
  PASSWORD_RESET_OTP_SENT: "Password reset OTP sent to email",
  EMAIL_VERIFICATION_SENT: "Verification OTP sent to email",
  EMAIL_VERIFIED_SUCCESS: "Email verified successfully",
  TWO_FACTOR_REQUIRED: "2FA authentication required",
  TWO_FACTOR_LOGIN_SUCCESS: "2FA Login successful",
  ACTIVE_SESSIONS_RETRIEVED: "Active sessions retrieved successfully",
  SESSION_REVOKED: "Session revoked successfully",
  SECURITY_LOGS_RETRIEVED: "Security logs retrieved successfully",
  INVALID_CREDENTIALS: "Invalid email or password",
  ACCOUNT_LOCKED: "Account is temporarily locked due to multiple failed login attempts",
  USER_ALREADY_EXISTS: "User already exists with this email",
  USER_NOT_FOUND: "User not found",
  USER_NOT_FOUND_EMAIL: "User not found with this email",
  INVALID_OR_EXPIRED_TOKEN: "Invalid or expired token",
  REFRESH_TOKEN_REQUIRED: "Refresh Token required",
  SESSION_EXPIRED: "Session expired or invalid refresh token",
  CURRENT_PASSWORD_INCORRECT: "Current password is incorrect",
  EMAIL_ALREADY_VERIFIED: "Email is already verified",
  INVALID_OTP: "Invalid OTP or OTP expired",
} as const;

export const TIME_CONSTANTS = {
  LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes
  REFRESH_TOKEN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  MAX_LOGIN_ATTEMPTS: 5,
  OTP_EXPIRY_SECONDS: 600, // 10 minutes
} as const;

export const SECURITY_ACTIONS = {
  USER_REGISTERED: "USER_REGISTERED",
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  TWO_FACTOR_LOGIN_SUCCESS: "2FA_LOGIN_SUCCESS",
  LOGOUT: "LOGOUT",
  LOGOUT_ALL_SESSIONS: "LOGOUT_ALL_SESSIONS",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET: "PASSWORD_RESET",
  EMAIL_VERIFIED: "EMAIL_VERIFIED",
  TWO_FACTOR_ENABLED: "2FA_ENABLED",
  TWO_FACTOR_DISABLED: "2FA_DISABLED",
} as const;


export const COOKIE_NAME = "refreshToken";
