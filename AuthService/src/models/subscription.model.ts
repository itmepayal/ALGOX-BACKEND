import mongoose, { Document, Schema, Types } from "mongoose";

export type SubscriptionPlan = "FREE" | "PREMIUM";

export const SUBSCRIPTION_STATUSES = [
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
  "PAUSED",
  "REFUNDED",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_PROVIDERS = [
  "none",
  "admin",
  "promo",
  "stripe",
  "cashfree",
  "manual",
] as const;

export type SubscriptionProvider = (typeof SUBSCRIPTION_PROVIDERS)[number];

export const LIVE_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "ACTIVE",
  "TRIALING",
  "PAST_DUE",
  "PAUSED",
] as const;

export interface ISubscription extends Document {
  userId: Types.ObjectId;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;

  provider: SubscriptionProvider;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;

  startDate: Date;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: Date | null;
  endedAt?: Date | null;

  trialStart?: Date | null;
  trialEnd?: Date | null;

  metadata?: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    plan: {
      type: String,
      enum: ["FREE", "PREMIUM"],
      required: true,
      default: "PREMIUM",
    },
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      required: true,
    },
    provider: {
      type: String,
      enum: SUBSCRIPTION_PROVIDERS,
      required: true,
      default: "none",
    },
    providerCustomerId: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    providerSubscriptionId: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    cancelledAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    trialStart: { type: Date, default: null },
    trialEnd: { type: Date, default: null },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

subscriptionSchema.index({ userId: 1, createdAt: -1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1 });
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

subscriptionSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { endedAt: null },
    name: "uniq_live_subscription_per_user",
  },
);

subscriptionSchema.index(
  { providerSubscriptionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      providerSubscriptionId: { $exists: true, $type: "string" },
    },
    name: "uniq_provider_subscription_id",
  },
);

subscriptionSchema.index(
  { provider: 1, providerCustomerId: 1 },
  {
    sparse: true,
    name: "provider_customer_lookup",
  },
);

export const Subscription = mongoose.model<ISubscription>(
  "Subscription",
  subscriptionSchema,
);
