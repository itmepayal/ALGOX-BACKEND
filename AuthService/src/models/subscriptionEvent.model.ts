/**
 * Immutable subscription lifecycle / provider webhook event log.
 * providerEventId uniqueness detects duplicate provider deliveries.
 */

import mongoose, { Document, Schema, Types } from "mongoose";
import type { SubscriptionStatus } from "./subscription.model";

export interface ISubscriptionEvent extends Document {
  subscriptionId?: Types.ObjectId | null;
  userId: Types.ObjectId;
  /** Provider event id (e.g. Stripe evt_…) — unique when set. */
  providerEventId?: string | null;
  provider?: string;
  type: string;
  fromStatus?: SubscriptionStatus | null;
  toStatus?: SubscriptionStatus | null;
  /** Non-secret payload summary — never raw card data. */
  payload?: Record<string, unknown>;
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionEventSchema = new Schema<ISubscriptionEvent>(
  {
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    providerEventId: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    provider: { type: String, maxlength: 40 },
    type: { type: String, required: true, index: true, maxlength: 120 },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    payload: { type: Schema.Types.Mixed, default: {} },
    processedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

subscriptionEventSchema.index({ userId: 1, createdAt: -1 });
subscriptionEventSchema.index({ subscriptionId: 1, createdAt: -1 });

/** Duplicate webhook / provider event detection (omit field when unset). */
subscriptionEventSchema.index(
  { providerEventId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      providerEventId: { $exists: true, $type: "string" },
    },
    name: "uniq_provider_event_id",
  }
);

export const SubscriptionEvent = mongoose.model<ISubscriptionEvent>(
  "SubscriptionEvent",
  subscriptionEventSchema
);
