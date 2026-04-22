import { ResetToken } from "../models/resetToken.model";

export const resetTokenRepository = {
  create: (data: any) => {
    return ResetToken.create(data);
  },

  findByToken: (token: string) => {
    return ResetToken.findOne({ token });
  },

  deleteByUser: (userId: string) => {
    return ResetToken.deleteMany({ userId });
  },
};
