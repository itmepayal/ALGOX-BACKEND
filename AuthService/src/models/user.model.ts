import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import type { AccountStatus, UserRole } from "../rbac/permissions";

export type { AccountStatus, UserRole };

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  avatar?: string;

  role: UserRole;
  status: AccountStatus;

  isEmailVerified: boolean;

  twoFactorEnabled: boolean;
  twoFactorSecret?: string;

  loginAttempts: number;
  lockUntil?: Date;

  passwordChangedAt?: Date;

  lastActiveAt?: Date;

  comparePassword(candidatePassword: string): Promise<boolean>;
  isLocked(): boolean;
  isAccountActive(): boolean;
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },

    avatar: {
      type: String,
      default: "",
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email"],
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    role: {
      type: String,
      enum: ["user", "moderator", "content_manager", "admin", "super_admin"],
      default: "user",
      index: true,
    },

    status: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active",
      index: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },

    twoFactorSecret: {
      type: String,
      select: false,
    },

    loginAttempts: {
      type: Number,
      default: 0,
    },

    lockUntil: {
      type: Date,
      default: null,
    },

    passwordChangedAt: Date,

    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 });
userSchema.index({ role: 1, status: 1 });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  this.passwordChangedAt = new Date();
});

userSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

userSchema.methods.isAccountActive = function () {
  return this.status === "active" && !this.isLocked();
};

export const User = mongoose.model<IUser>("User", userSchema);
