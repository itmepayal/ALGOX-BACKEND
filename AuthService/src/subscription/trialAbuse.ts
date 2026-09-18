/**
 * Trial abuse controls — one trial per user identity.
 * Checked at checkout and when applying TRIALING webhooks.
 */

import { Subscription } from "../models/subscription.model";
import { SubscriptionEvent } from "../models/subscriptionEvent.model";
import { BadRequestError } from "../utils/errors/app.error";

/**
 * True if this user already consumed a trial (ledger row or event).
 */
export async function hasConsumedTrial(userId: string): Promise<boolean> {
  const uid = String(userId || "").trim();
  if (!uid) return false;

  const [trialRow, trialEvent] = await Promise.all([
    Subscription.findOne({
      userId: uid,
      $or: [
        { status: "TRIALING" },
        { trialStart: { $ne: null } },
        { trialEnd: { $ne: null } },
      ],
    })
      .select("_id")
      .lean(),
    SubscriptionEvent.findOne({
      userId: uid,
      $or: [
        { toStatus: "TRIALING" },
        { fromStatus: "TRIALING" },
        { type: /trial/i },
      ],
    })
      .select("_id")
      .lean(),
  ]);

  return Boolean(trialRow || trialEvent);
}

export async function assertTrialAllowed(userId: string): Promise<void> {
  if (await hasConsumedTrial(userId)) {
    throw new BadRequestError("Trial already used for this account", {
      code: "TRIAL_ALREADY_USED",
    });
  }
}
