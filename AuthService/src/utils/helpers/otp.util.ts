import redis from "../../config/redis.config";
import { BadRequestError } from "../errors/app.error";

export const saveOTP = async (userId: string, otp: string) => {
  await redis.set(`otp:${userId}`, otp, { ex: 600 });
};

export const verifyOTP = async (userId: string, otp: string) => {
  const stored = await redis.get(`otp:${userId}`);

  if (!stored || stored !== otp) {
    throw new BadRequestError("Invalid OTP");
  }

  await redis.del(`otp:${userId}`);
};
