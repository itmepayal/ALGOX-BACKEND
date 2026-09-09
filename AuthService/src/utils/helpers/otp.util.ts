import redis from "../../config/redis.config";
import { BadRequestError } from "../errors/app.error";
import { TIME_CONSTANTS, AUTH_MESSAGES } from "../constants";

const inMemoryOtpStore = new Map<string, { otp: string; expiresAt: number }>();

export const saveOTP = async (userId: string, otp: string) => {
  try {
    await redis.set(`otp:${userId}`, otp, { ex: TIME_CONSTANTS.OTP_EXPIRY_SECONDS });
  } catch (err) {
    console.warn("[OTP Util] Redis set failed, falling back to in-memory store:", err);
    inMemoryOtpStore.set(`otp:${userId}`, {
      otp,
      expiresAt: Date.now() + TIME_CONSTANTS.OTP_EXPIRY_SECONDS * 1000,
    });
  }
};

export const verifyOTP = async (userId: string, otp: string) => {
  let stored: string | null = null;
  try {
    stored = await redis.get<string>(`otp:${userId}`);
  } catch (err) {
    console.warn("[OTP Util] Redis get failed, using in-memory fallback:", err);
    const item = inMemoryOtpStore.get(`otp:${userId}`);
    if (item && item.expiresAt > Date.now()) {
      stored = item.otp;
    }
  }

  if (!stored || String(stored).trim() !== String(otp).trim()) {
    throw new BadRequestError(AUTH_MESSAGES.INVALID_OTP);
  }

  try {
    await redis.del(`otp:${userId}`);
  } catch {
    inMemoryOtpStore.delete(`otp:${userId}`);
  }
};

export const sendOTPEmail = async (toEmail: string, otp: string, subject = "Your 2FA Verification Code") => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[Dev Mailer] RESEND_API_KEY missing. OTP for ${toEmail}: ${otp}`);
    return;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "LeetCode Auth <onboarding@resend.dev>",
        to: [toEmail],
        subject: subject,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #0f172a; color: #f8fafc; border-radius: 10px;">
            <h2 style="color: #6366f1;">LeetCode 2FA Security Code</h2>
            <p style="font-size: 14px; color: #94a3b8;">Your one-time authentication code is:</p>
            <div style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #22c55e; padding: 10px 0;">${otp}</div>
            <p style="font-size: 12px; color: #64748b;">This code will expire in 5 minutes. If you did not request this code, please ignore this email.</p>
          </div>
        `,
      }),
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const errText = await res.text();
      console.warn("[Resend Email] Failed to send email via Resend:", errText);
    } else {
      console.log(`[Resend Email] OTP email successfully sent to ${toEmail}`);
    }
  } catch (err) {
    console.error("[Resend Email Error]:", err);
  }
};
