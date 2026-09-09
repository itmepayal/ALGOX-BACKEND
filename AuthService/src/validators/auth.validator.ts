import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50),
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().optional(),
});

export const resetPasswordRequestSchema = z.object({
  email: z.string().email("Invalid email format"),
});

export const resetPasswordConfirmSchema = z.object({
  email: z.string().email("Invalid email format"),
  otp: z.string().length(6, "OTP must be 6 digits"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const sendEmailVerificationSchema = z.object({
  email: z.string().email(),
});

export const verifyEmailOtpSchema = z.object({
  otp: z.string().length(6, "OTP must be 6 digits"),
});

export const verify2FASchema = z.object({
  otp: z.string().length(6, "OTP must be 6 digits"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50).optional(),
  avatar: z.string().optional(),
});

export type SignupDto = z.infer<typeof signupSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type ResetPasswordRequestDto = z.infer<typeof resetPasswordRequestSchema>;
export type ResetPasswordConfirmDto = z.infer<typeof resetPasswordConfirmSchema>;
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
export type SendEmailVerificationDto = z.infer<typeof sendEmailVerificationSchema>;
export type VerifyEmailOtpDto = z.infer<typeof verifyEmailOtpSchema>;
export type Verify2FADto = z.infer<typeof verify2FASchema>;
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;


