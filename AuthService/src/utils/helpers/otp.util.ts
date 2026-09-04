import redis from "../../config/redis.config";
import { BadRequestError } from "../errors/app.error";
import { TIME_CONSTANTS, AUTH_MESSAGES } from "../constants";

export const saveOTP = async (userId: string, otp: string) => {
  await redis.set(`otp:${userId}`, otp, { ex: TIME_CONSTANTS.OTP_EXPIRY_SECONDS });
};

export const verifyOTP = async (userId: string, otp: string) => {
  const stored = await redis.get(`otp:${userId}`);

  if (!stored || stored !== otp) {
    throw new BadRequestError(AUTH_MESSAGES.INVALID_OTP);
  }

  await redis.del(`otp:${userId}`);
};

