/**
 * Safe client-facing subscription DTOs.
 * Never include provider secrets, customer/subscription provider ids, or webhook payloads.
 */

import type { ISubscription } from "../models/subscription.model";
import type { ISubscriptionEvent } from "../models/subscriptionEvent.model";
import {
  toPublicSubscription,
  type PublicSubscription,
} from "./entitlement";
import { projectEntitlementSnapshot } from "./projectSnapshot";

function iso(d: Date | null | undefined): string | null {
  if (!d) return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

/** Ledger row stripped for authenticated owner. */
export type SafeSubscription = {
  id: string;
  plan: string;
  status: string;
  provider: string;
  startDate: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  endedAt: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  /** Entitlement snapshot derived from this ledger row. */
  entitlement: PublicSubscription;
};

export type SafeSubscriptionEvent = {
  id: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  processedAt: string | null;
  createdAt: string | null;
};

export function toSafeSubscription(
  sub: ISubscription | null | undefined
): SafeSubscription | null {
  if (!sub) return null;
  const entitlement = toPublicSubscription(projectEntitlementSnapshot(sub));
  return {
    id: String(sub._id),
    plan: sub.plan,
    status: sub.status,
    provider: sub.provider,
    startDate: iso(sub.startDate),
    currentPeriodStart: iso(sub.currentPeriodStart),
    currentPeriodEnd: iso(sub.currentPeriodEnd),
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
    cancelledAt: iso(sub.cancelledAt),
    endedAt: iso(sub.endedAt),
    trialStart: iso(sub.trialStart),
    trialEnd: iso(sub.trialEnd),
    entitlement,
  };
}

export function toSafeSubscriptionEvent(
  ev: ISubscriptionEvent
): SafeSubscriptionEvent {
  return {
    id: String(ev._id),
    type: ev.type,
    fromStatus: ev.fromStatus ?? null,
    toStatus: ev.toStatus ?? null,
    processedAt: iso(ev.processedAt),
    createdAt: iso(ev.createdAt),
  };
}
