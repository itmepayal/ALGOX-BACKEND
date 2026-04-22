import { Session } from "../models/session.model";

export const sessionRepository = {
  create: (data: any) => {
    return Session.create(data);
  },

  findByToken: (refreshToken: string) => {
    return Session.findOne({ refreshToken });
  },

  deleteByToken: (refreshToken: string) => {
    return Session.deleteOne({ refreshToken });
  },

  deleteByUser: (userId: string) => {
    return Session.deleteMany({ userId });
  },
};
