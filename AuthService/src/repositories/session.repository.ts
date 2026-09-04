import { Session } from "../models/session.model";

export const sessionRepository = {
  create: (data: any) => {
    return Session.create(data);
  },

  findByToken: (refreshToken: string) => {
    return Session.findOne({ refreshToken });
  },

  findByUser: (userId: string) => {
    return Session.find({ userId }).select("-refreshToken").sort({ createdAt: -1 });
  },

  deleteByToken: (refreshToken: string) => {
    return Session.deleteOne({ refreshToken });
  },

  deleteById: (sessionId: string, userId: string) => {
    return Session.deleteOne({ _id: sessionId, userId });
  },

  deleteByUser: (userId: string) => {
    return Session.deleteMany({ userId });
  },
};

