import { OTP } from "../models/otp.model";

export const otpRepository = {
  create: (data: any) => {
    return OTP.create(data);
  },

  findValidOTP: (userId: string, code: string, type: string) => {
    return OTP.findOne({
      userId,
      code,
      type,
    });
  },

  deleteByUser: (userId: string) => {
    return OTP.deleteMany({ userId });
  },
};
