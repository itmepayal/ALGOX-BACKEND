import { User, IUser } from "../models/user.model";

export const userRepository = {
  create: (data: Partial<IUser>) => {
    return User.create(data);
  },

  findByEmail: (email: string) => {
    return User.findOne({ email }).select("+password");
  },

  findById: (id: string) => {
    return User.findById(id);
  },

  updateById: (id: string, data: Partial<IUser>) => {
    return User.findByIdAndUpdate(id, data, { new: true });
  },

  incrementLoginAttempts: async (id: string) => {
    return User.findByIdAndUpdate(id, {
      $inc: { loginAttempts: 1 },
    });
  },

  resetLoginAttempts: async (id: string) => {
    return User.findByIdAndUpdate(id, {
      loginAttempts: 0,
      lockUntil: null,
    });
  },
};
