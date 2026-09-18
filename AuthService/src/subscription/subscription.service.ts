import mongoose from "mongoose";
import {
  Subscription,
  LIVE_SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUSES,
  type ISubscription,
  type SubscriptionPlan,
  type SubscriptionProvider,
  type SubscriptionStatus,
} from "../models/subscription.model";
import { SubscriptionEvent } from "../models/subscriptionEvent.model";
import { User } from "../models/user.model";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../utils/errors/app.error";
import { projectEntitlementSnapshot } from "./projectSnapshot";
import { DEFAULT_SUBSCRIPTION } from "./entitlement";
import { assertAllowedTransition } from "./transitions";
import { writeAdminAudit } from "../utils/helpers/audit.helper";

function assertStatus(status: string): asserts status is SubscriptionStatus {
  if (!(SUBSCRIPTION_STATUSES as readonly string[]).includes(status)) {
    throw new BadRequestError(`Invalid subscription status: ${status}`);
  }
}

export type UpsertSubscriptionInput = {
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  provider: SubscriptionProvider;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  startDate?: Date;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: Date | null;
  endedAt?: Date | null;
  trialStart?: Date | null;
  trialEnd?: Date | null;
  metadata?: Record<string, unknown>;
  /** Lifecycle event type for history (default subscription.upsert). */
  eventType?: string;
  /** Provider webhook event id — duplicate delivery returns existing. */
  providerEventId?: string | null;
};

export class SubscriptionService {
  /**
   * Idempotent provider event recording.
   * @returns { duplicate: true } when providerEventId was already processed.
   */
  async recordProviderEvent(input: {
    userId: string;
    subscriptionId?: string | null;
    providerEventId?: string | null;
    provider?: string;
    type: string;
    fromStatus?: SubscriptionStatus | null;
    toStatus?: SubscriptionStatus | null;
    payload?: Record<string, unknown>;
  }): Promise<{ duplicate: boolean; eventId: string }> {
    if (input.providerEventId) {
      const existing = await SubscriptionEvent.findOne({
        providerEventId: input.providerEventId,
      }).lean();
      if (existing) {
        return { duplicate: true, eventId: String(existing._id) };
      }
    }

    try {
      const created = await SubscriptionEvent.create({
        userId: input.userId,
        subscriptionId: input.subscriptionId || undefined,
        ...(input.providerEventId
          ? { providerEventId: input.providerEventId }
          : {}),
        provider: input.provider,
        type: input.type,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        payload: input.payload || {},
        processedAt: new Date(),
      });
      return { duplicate: false, eventId: String(created._id) };
    } catch (err: any) {
      // Race: unique providerEventId
      if (err?.code === 11000 && input.providerEventId) {
        const existing = await SubscriptionEvent.findOne({
          providerEventId: input.providerEventId,
        }).lean();
        if (existing) {
          return { duplicate: true, eventId: String(existing._id) };
        }
      }
      throw err;
    }
  }

  /** Sync User.subscription snapshot from the live Subscription row (or FREE). */
  async syncUserEntitlementSnapshot(userId: string): Promise<void> {
    const live = await Subscription.findOne({
      userId,
      endedAt: null,
    }).lean();

    // Lazy expiry: period ended + not cancel-at-period-end grace → end live row
    if (live && this.shouldExpireLive(live as ISubscription)) {
      await this.endLiveSubscription(userId, {
        status: "EXPIRED",
        reason: "period_ended_lazy_sync",
      });
      return;
    }

    const snapshot = live
      ? projectEntitlementSnapshot(live as ISubscription)
      : { ...DEFAULT_SUBSCRIPTION, updatedAt: new Date() };

    await User.findByIdAndUpdate(userId, {
      $set: { subscription: snapshot },
    });
  }

  /** True when paid period has ended and status no longer entitles. */
  private shouldExpireLive(live: ISubscription): boolean {
    const end = live.currentPeriodEnd
      ? new Date(live.currentPeriodEnd).getTime()
      : null;
    // Open-ended admin/promo grants (null period end) never auto-expire here.
    if (end == null || !Number.isFinite(end) || end >= Date.now()) return false;
    if (
      live.status === "ACTIVE" ||
      live.status === "TRIALING" ||
      live.status === "PAST_DUE" ||
      live.status === "PAUSED" ||
      (live.status === "CANCELLED" && live.cancelAtPeriodEnd)
    ) {
      return true;
    }
    return false;
  }

  /**
   * Create or update the single live subscription for a user.
   * Ends prior live rows when replacing. Provider/webhook/admin only — never clients.
   */
  async upsertLiveSubscription(
    input: UpsertSubscriptionInput
  ): Promise<{ subscription: ISubscription; duplicateEvent: boolean }> {
    assertStatus(input.status);

    if (!mongoose.isValidObjectId(input.userId)) {
      throw new BadRequestError("Invalid userId");
    }
    const user = await User.findById(input.userId).select("_id");
    if (!user) throw new NotFoundError("User not found");

    // Idempotent webhook short-circuit — duplicate providerEventId = no-op
    if (input.providerEventId) {
      const dup = await this.recordProviderEvent({
        userId: input.userId,
        providerEventId: input.providerEventId,
        provider: input.provider,
        type: input.eventType || "subscription.upsert",
        toStatus: input.status,
        payload: { plan: input.plan },
      });
      if (dup.duplicate) {
        const existing =
          (input.providerSubscriptionId
            ? await Subscription.findOne({
                providerSubscriptionId: input.providerSubscriptionId,
              })
            : await Subscription.findOne({
                userId: input.userId,
                endedAt: null,
              })) || (await this.getLiveForUser(input.userId));
        if (!existing) {
          throw new ConflictError(
            "Duplicate provider event with no matching subscription",
            { code: "DUPLICATE_PROVIDER_EVENT" }
          );
        }
        return { subscription: existing, duplicateEvent: true };
      }
    }

    const endedStatuses: SubscriptionStatus[] = [
      "CANCELLED",
      "EXPIRED",
      "REFUNDED",
    ];
    const shouldEnd =
      endedStatuses.includes(input.status) && !input.cancelAtPeriodEnd;

    // Prefer match by providerSubscriptionId when present
    let doc: ISubscription | null = null;
    if (input.providerSubscriptionId) {
      doc = await Subscription.findOne({
        providerSubscriptionId: input.providerSubscriptionId,
      });
    }
    if (!doc) {
      doc = await Subscription.findOne({
        userId: input.userId,
        endedAt: null,
      });
    }

    const fromStatus = doc?.status ?? null;

    // Reject impossible status jumps (anti-abuse / corrupted webhook payloads)
    assertAllowedTransition(fromStatus, input.status, {
      context: input.eventType || "subscription.upsert",
    });

    if (!doc) {
      try {
        doc = await Subscription.create({
          userId: input.userId,
          plan: input.plan,
          status: input.status,
          provider: input.provider,
          ...(input.providerCustomerId
            ? { providerCustomerId: input.providerCustomerId }
            : {}),
          ...(input.providerSubscriptionId
            ? { providerSubscriptionId: input.providerSubscriptionId }
            : {}),
          startDate: input.startDate || new Date(),
          currentPeriodStart: input.currentPeriodStart ?? new Date(),
          currentPeriodEnd: input.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: Boolean(input.cancelAtPeriodEnd),
          cancelledAt: input.cancelledAt ?? null,
          endedAt: shouldEnd ? input.endedAt || new Date() : input.endedAt ?? null,
          trialStart: input.trialStart ?? null,
          trialEnd: input.trialEnd ?? null,
          metadata: input.metadata || {},
        });
      } catch (err: any) {
        if (err?.code === 11000) {
          throw new ConflictError(
            "A live subscription already exists for this user or provider id",
            { code: "DUPLICATE_LIVE_SUBSCRIPTION" }
          );
        }
        throw err;
      }
    } else {
      // If updating a different user's provider id collision
      if (String(doc.userId) !== String(input.userId)) {
        throw new ConflictError("providerSubscriptionId belongs to another user");
      }

      doc.plan = input.plan;
      doc.status = input.status;
      doc.provider = input.provider;
      if (input.providerCustomerId !== undefined) {
        if (input.providerCustomerId) {
          doc.providerCustomerId = input.providerCustomerId;
        } else {
          doc.set("providerCustomerId", undefined);
        }
      }
      if (input.providerSubscriptionId !== undefined) {
        if (input.providerSubscriptionId) {
          doc.providerSubscriptionId = input.providerSubscriptionId;
        } else {
          doc.set("providerSubscriptionId", undefined);
        }
      }
      if (input.currentPeriodStart !== undefined) {
        doc.currentPeriodStart = input.currentPeriodStart;
      }
      if (input.currentPeriodEnd !== undefined) {
        doc.currentPeriodEnd = input.currentPeriodEnd;
      }
      if (input.cancelAtPeriodEnd !== undefined) {
        doc.cancelAtPeriodEnd = input.cancelAtPeriodEnd;
      }
      if (input.cancelledAt !== undefined) {
        doc.cancelledAt = input.cancelledAt;
      }
      if (input.trialStart !== undefined) doc.trialStart = input.trialStart;
      if (input.trialEnd !== undefined) doc.trialEnd = input.trialEnd;
      if (input.metadata) {
        doc.metadata = { ...(doc.metadata || {}), ...input.metadata };
      }

      if (shouldEnd) {
        doc.endedAt = input.endedAt || new Date();
      } else if (
        LIVE_SUBSCRIPTION_STATUSES.includes(input.status) ||
        (input.status === "CANCELLED" && input.cancelAtPeriodEnd)
      ) {
        doc.endedAt = null;
      }

      try {
        await doc.save();
      } catch (err: any) {
        if (err?.code === 11000) {
          throw new ConflictError(
            "Duplicate live subscription or provider id",
            { code: "DUPLICATE_LIVE_SUBSCRIPTION" }
          );
        }
        throw err;
      }
    }

    if (!input.providerEventId) {
      await this.recordProviderEvent({
        userId: input.userId,
        subscriptionId: String(doc._id),
        provider: input.provider,
        type: input.eventType || "subscription.upsert",
        fromStatus,
        toStatus: input.status,
        payload: {
          plan: input.plan,
          providerSubscriptionId: input.providerSubscriptionId,
        },
      });
    } else {
      // Link subscription id onto event if we short-circuited create above incorrectly
      await SubscriptionEvent.updateOne(
        { providerEventId: input.providerEventId },
        {
          $set: {
            subscriptionId: doc._id,
            fromStatus,
            toStatus: input.status,
          },
        }
      );
    }

    await this.syncUserEntitlementSnapshot(input.userId);
    return { subscription: doc, duplicateEvent: false };
  }

  /**
   * End live subscription and reset user entitlement to FREE.
   * Used for admin revoke / refund completion.
   */
  async endLiveSubscription(
    userId: string,
    opts?: {
      status?: SubscriptionStatus;
      providerEventId?: string | null;
      reason?: string;
    }
  ): Promise<ISubscription | null> {
    const live = await Subscription.findOne({ userId, endedAt: null });
    if (!live) {
      await this.syncUserEntitlementSnapshot(userId);
      return null;
    }

    const fromStatus = live.status;
    live.status = opts?.status || "CANCELLED";
    live.endedAt = new Date();
    live.cancelledAt = live.cancelledAt || new Date();
    live.cancelAtPeriodEnd = false;
    await live.save();

    await this.recordProviderEvent({
      userId,
      subscriptionId: String(live._id),
      providerEventId: opts?.providerEventId,
      provider: live.provider,
      type: "subscription.ended",
      fromStatus,
      toStatus: live.status,
      payload: { reason: opts?.reason },
    });

    // Revoke promotional / admin feature grants when subscription fully ends
    // (expired period, refund, admin revoke). Keeps horizontal promo abuse in check.
    if (
      opts?.reason === "admin_revoke" ||
      opts?.status === "REFUNDED" ||
      opts?.reason === "period_ended_lazy_sync" ||
      opts?.reason === "promo_revoked"
    ) {
      await User.findByIdAndUpdate(userId, {
        $set: { featureGrants: [] },
      });
      try {
        await writeAdminAudit({
          actorId: userId,
          action: "entitlement.feature_grants_cleared",
          resource: "subscription",
          resourceId: userId,
          before: {},
          after: { featureGrants: [], reason: opts?.reason || opts?.status },
        });
      } catch {
        /* never block */
      }
    }

    await this.syncUserEntitlementSnapshot(userId);
    return live;
  }

  async getLiveForUser(userId: string): Promise<ISubscription | null> {
    return Subscription.findOne({ userId, endedAt: null });
  }

  /** All subscription rows for a user (newest first). Owner-scoped only. */
  async listHistoryForUser(
    userId: string,
    limit = 20
  ): Promise<{ subscriptions: ISubscription[]; events: any[] }> {
    const capped = Math.min(Math.max(limit, 1), 50);
    const [subscriptions, events] = await Promise.all([
      Subscription.find({ userId }).sort({ createdAt: -1 }).limit(capped),
      SubscriptionEvent.find({ userId })
        .sort({ createdAt: -1 })
        .limit(capped)
        .select("type fromStatus toStatus processedAt createdAt"),
    ]);
    return { subscriptions, events };
  }

  /**
   * Schedule cancel at period end. Idempotent when already flagged.
   * Does not immediately revoke entitlement (period access preserved).
   */
  async cancelAtPeriodEnd(
    userId: string,
    opts?: { reason?: string }
  ): Promise<{
    subscription: ISubscription | null;
    idempotent: boolean;
    changed: boolean;
  }> {
    const live = await Subscription.findOne({ userId, endedAt: null });
    if (!live || live.plan === "FREE") {
      return { subscription: live, idempotent: true, changed: false };
    }

    if (live.cancelAtPeriodEnd) {
      return { subscription: live, idempotent: true, changed: false };
    }

    const fromStatus = live.status;
    live.cancelAtPeriodEnd = true;
    live.cancelledAt = live.cancelledAt || new Date();
    await live.save();

    await this.recordProviderEvent({
      userId,
      subscriptionId: String(live._id),
      provider: live.provider,
      type: "subscription.cancel_at_period_end",
      fromStatus,
      toStatus: live.status,
      payload: { reason: opts?.reason || "user_cancel" },
    });

    await this.syncUserEntitlementSnapshot(userId);
    return { subscription: live, idempotent: false, changed: true };
  }

  /**
   * Undo cancel-at-period-end while subscription is still live.
   * Idempotent when already not scheduled to cancel.
   */
  async resume(
    userId: string,
    opts?: { reason?: string }
  ): Promise<{
    subscription: ISubscription | null;
    idempotent: boolean;
    changed: boolean;
  }> {
    const live = await Subscription.findOne({ userId, endedAt: null });
    if (!live || live.plan === "FREE") {
      throw new BadRequestError("No resumable subscription", {
        code: "NO_SUBSCRIPTION",
      });
    }

    if (!live.cancelAtPeriodEnd) {
      return { subscription: live, idempotent: true, changed: false };
    }

    // Terminal live statuses that cannot resume
    if (live.status === "EXPIRED" || live.status === "REFUNDED") {
      throw new BadRequestError("Subscription cannot be resumed", {
        code: "NOT_RESUMABLE",
      });
    }

    const fromStatus = live.status;
    live.cancelAtPeriodEnd = false;
    live.cancelledAt = null;
    await live.save();

    await this.recordProviderEvent({
      userId,
      subscriptionId: String(live._id),
      provider: live.provider,
      type: "subscription.resume",
      fromStatus,
      toStatus: live.status,
      payload: { reason: opts?.reason || "user_resume" },
    });

    await this.syncUserEntitlementSnapshot(userId);
    return { subscription: live, idempotent: false, changed: true };
  }
}

export const subscriptionService = new SubscriptionService();
