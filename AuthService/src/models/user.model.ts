import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import type { AccountStatus, UserRole } from "../rbac/permissions";
import type {
  UserSubscription,
} from "../subscription/entitlement";
import { DEFAULT_SUBSCRIPTION } from "../subscription/entitlement";

export type { AccountStatus, UserRole };
export type { UserSubscription };

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  avatar?: string;

  role: UserRole;
  status: AccountStatus;

  /**
   * Paid/free entitlement — independent of platform role.
   * Missing docs behave as FREE via normalizeSubscription.
   */
  subscription: UserSubscription;

  /** Extra feature ids granted beyond plan (promo / admin). */
  featureGrants?: string[];

  isEmailVerified: boolean;

  twoFactorEnabled: boolean;
  twoFactorSecret?: string;

  loginAttempts: number;
  lockUntil?: Date;

  passwordChangedAt?: Date;

  /** Soft-delete timestamp — excluded from default listings when set. */
  deletedAt?: Date | null;

  /** When true, user should change password on next login. */
  mustChangePassword?: boolean;

  lastActiveAt?: Date;

  comparePassword(candidatePassword: string): Promise<boolean>;
  isLocked(): boolean;
  isAccountActive(): boolean;
}

const subscriptionSchema = new Schema(
  {
    plan: {
      type: String,
      enum: ["FREE", "PREMIUM"],
      default: "FREE",
    },
    status: {
      type: String,
      enum: ["none", "active", "canceled", "past_due", "expired", "grace"],
      default: "none",
    },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    gracePeriodEnd: { type: Date, default: null },
    source: {
      type: String,
      enum: ["default", "admin_grant", "promo", "billing"],
      default: "default",
    },
    /** Billing provider reference — never expose to clients. */
    externalRef: { type: String, default: null, select: false },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
);

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

    subscription: {
      type: subscriptionSchema,
      default: () => ({ ...DEFAULT_SUBSCRIPTION }),
    },

    featureGrants: {
      type: [String],
      default: [],
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

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },

    mustChangePassword: {
      type: Boolean,
      default: false,
    },

    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastActiveAt: -1 });
userSchema.index({ isEmailVerified: 1 });
userSchema.index({ status: 1, lastActiveAt: -1 });
userSchema.index({ "subscription.plan": 1, "subscription.status": 1 });

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
  return (
    this.status === "active" &&
    !this.isLocked() &&
    !this.deletedAt
  );
};

export const User = mongoose.model<IUser>("User", userSchema);
