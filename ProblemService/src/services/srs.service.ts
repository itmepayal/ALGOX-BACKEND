/**
 * Server-authoritative spaced repetition. No client timestamps for scheduling.
 */
import { Types } from "mongoose";
import {
  UserSpacedRepetition,
  UserSrsPrefs,
  type IUserSpacedRepetition,
} from "../models/userSpacedRepetition.model";
import { Problem } from "../models/problem.model";
import {
  resolveEntitlements,
  hasFeature,
} from "../utils/entitlementClient";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors/app.error";
import { isValidIanaTimeZone } from "../utils/streakRules";
import {
  FIRST_INTERVAL_DAYS,
  addDaysUtc,
  computeNextReviewAt,
  dateKeyForSrs,
  isSrsFeedback,
  type SrsFeedback,
} from "../utils/srsSchedule";

const FEATURE = "premium.spaced_repetition";
const FREE_QUEUE_LIMIT = 50;
const PREMIUM_QUEUE_LIMIT = 200;

function oid(id: string, label = "id") {
  if (!Types.ObjectId.isValid(id)) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return new Types.ObjectId(id);
}

function serialize(card: IUserSpacedRepetition | Record<string, any>) {
  const o =
    typeof (card as any).toObject === "function"
      ? (card as any).toObject()
      : { ...card };
  return {
    id: String(o._id || o.id),
    userId: String(o.userId),
    problemId: String(o.problemId),
    difficulty: o.difficulty || "medium",
    lastSolvedAt: o.lastSolvedAt || null,
    lastReviewedAt: o.lastReviewedAt || null,
    confidence: o.confidence || null,
    confidenceScore: Number(o.confidenceScore) || 0,
    attempts: Number(o.attempts) || 0,
    reviewCount: Number(o.reviewCount) || 0,
    intervalDays: Number(o.intervalDays) || 1,
    nextReviewAt: o.nextReviewAt,
    status: o.status || "active",
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export class SrsService {
  private async isPremium(authorization?: string | null) {
    const snap = await resolveEntitlements(authorization);
    return hasFeature(snap, FEATURE);
  }

  private async requirePremium(authorization?: string | null) {
    if (!(await this.isPremium(authorization))) {
      throw new ForbiddenError(
        "Advanced spaced repetition requires premium.spaced_repetition"
      );
    }
  }

  private assertCardOwner(card: { userId?: string }, userId: string) {
    if (String(card.userId) !== String(userId)) {
      throw new ForbiddenError("Unauthorized revision card access", {
        code: "HORIZONTAL_AUTHZ_DENIED",
      });
    }
  }

  async getOrCreatePrefs(userId: string) {
    let prefs = await UserSrsPrefs.findOne({ userId });
    if (!prefs) {
      prefs = await UserSrsPrefs.create({ userId, timezone: "UTC" });
    }
    return prefs;
  }

  async setTimezone(userId: string, timezone: string) {
    if (!isValidIanaTimeZone(timezone)) {
      throw new BadRequestError("Invalid IANA timezone");
    }
    const prefs = await this.getOrCreatePrefs(userId);
    prefs.timezone = timezone;
    await prefs.save();
    return { timezone: prefs.timezone };
  }

  async getTimezone(userId: string) {
    const prefs = await this.getOrCreatePrefs(userId);
    return prefs.timezone || "UTC";
  }

  /**
   * First solve / re-solve seed. Idempotent — duplicates bump attempts + lastSolvedAt
   * without resetting the review schedule.
   */
  async seedOnSolve(input: {
    userId: string;
    problemId: string;
    difficulty?: string;
  }) {
    const userId = String(input.userId || "").trim();
    const problemId = oid(String(input.problemId), "problemId");
    if (!userId) throw new BadRequestError("userId is required");

    const now = new Date();
    const existing = await UserSpacedRepetition.findOne({ userId, problemId });
    if (existing) {
      existing.lastSolvedAt = now;
      existing.attempts = (existing.attempts || 0) + 1;
      if (input.difficulty) {
        existing.difficulty = String(input.difficulty).toLowerCase();
      }
      if (existing.status === "graduated") {
        // Re-solve after graduation reactivates with first interval
        existing.status = "active";
        existing.intervalDays = FIRST_INTERVAL_DAYS;
        existing.nextReviewAt = addDaysUtc(now, FIRST_INTERVAL_DAYS);
      }
      await existing.save();
      return { created: false, duplicate: true, card: serialize(existing) };
    }

    let difficulty = (input.difficulty || "medium").toLowerCase();
    try {
      const problem = await Problem.findById(problemId).select("difficulty").lean();
      if (problem?.difficulty) difficulty = String(problem.difficulty).toLowerCase();
    } catch {
      /* keep provided */
    }

    const card = await UserSpacedRepetition.create({
      userId,
      problemId,
      difficulty,
      lastSolvedAt: now,
      lastReviewedAt: null,
      confidence: undefined,
      confidenceScore: 0,
      attempts: 1,
      reviewCount: 0,
      intervalDays: FIRST_INTERVAL_DAYS,
      nextReviewAt: addDaysUtc(now, FIRST_INTERVAL_DAYS),
      status: "active",
    });

    return { created: true, duplicate: false, card: serialize(card) };
  }

  /** Manual enroll (authenticated) — same as first-solve seed. */
  async enroll(
    userId: string,
    problemId: string,
    authorization?: string | null
  ) {
    void authorization;
    return this.seedOnSolve({ userId, problemId });
  }

  async review(
    userId: string,
    problemId: string,
    feedbackRaw: unknown,
    authorization?: string | null
  ) {
    if (!isSrsFeedback(feedbackRaw)) {
      throw new BadRequestError("feedback must be hard, okay, or easy");
    }
    const feedback: SrsFeedback = feedbackRaw;
    const advanced = await this.isPremium(authorization);
    const pid = oid(problemId, "problemId");
    const card = await UserSpacedRepetition.findOne({ userId, problemId: pid });
    if (!card) {
      throw new NotFoundError("Revision card not found — solve or enroll first");
    }
    if (card.status === "paused") {
      throw new BadRequestError("Card is paused; resume before reviewing");
    }

    const now = new Date();
    const prevInterval = card.intervalDays || FIRST_INTERVAL_DAYS;
    const scheduled = computeNextReviewAt(
      now,
      prevInterval,
      feedback,
      advanced
    );

    card.lastReviewedAt = now;
    card.confidence = feedback;
    card.confidenceScore = scheduled.confidenceScore;
    card.reviewCount = (card.reviewCount || 0) + 1;
    card.intervalDays = scheduled.intervalDays;
    card.nextReviewAt = scheduled.nextReviewAt;

    const maxCap = advanced ? 180 : 90;
    if (feedback === "easy" && scheduled.intervalDays >= maxCap) {
      card.status = "graduated";
    } else if (card.status === "graduated") {
      card.status = "active";
    }

    await card.save();
    return {
      card: serialize(card),
      schedule: {
        previousIntervalDays: prevInterval,
        intervalDays: scheduled.intervalDays,
        nextReviewAt: scheduled.nextReviewAt,
        feedback,
        advanced,
      },
    };
  }

  /** Premium: manually set next review (bounded). */
  async reschedule(
    userId: string,
    problemId: string,
    body: { nextReviewAt?: string; delayDays?: number },
    authorization?: string | null
  ) {
    await this.requirePremium(authorization);
    const pid = oid(problemId, "problemId");
    const card = await UserSpacedRepetition.findOne({ userId, problemId: pid });
    if (!card) throw new NotFoundError("Revision card not found");
    this.assertCardOwner(card, userId);

    // Anti-abuse: never trust absolute client clocks — only relative delayDays.
    if (body.nextReviewAt != null) {
      throw new BadRequestError(
        "Client nextReviewAt is not accepted; use delayDays",
        { code: "CLIENT_TIMESTAMP_REJECTED" }
      );
    }
    if (body.delayDays == null) {
      throw new BadRequestError("delayDays is required");
    }
    const days = Math.floor(Number(body.delayDays));
    if (!Number.isFinite(days) || days < 0 || days > 365) {
      throw new BadRequestError("delayDays must be 0–365");
    }
    const now = new Date();
    const next = addDaysUtc(now, days);

    card.nextReviewAt = next;
    if (card.status === "graduated") card.status = "active";
    card.intervalDays = Math.max(1, days || 1);
    await card.save();
    return { card: serialize(card) };
  }

  async setStatus(
    userId: string,
    problemId: string,
    status: "active" | "paused" | "graduated",
    authorization?: string | null
  ) {
    void authorization;
    if (!["active", "paused", "graduated"].includes(status)) {
      throw new BadRequestError("Invalid status");
    }
    const pid = oid(problemId, "problemId");
    const card = await UserSpacedRepetition.findOne({ userId, problemId: pid });
    if (!card) throw new NotFoundError("Revision card not found");
    card.status = status;
    await card.save();
    return { card: serialize(card) };
  }

  async getQueue(
    userId: string,
    authorization?: string | null,
    query: { bucket?: string } = {}
  ) {
    const premium = await this.isPremium(authorization);
    const limit = premium ? PREMIUM_QUEUE_LIMIT : FREE_QUEUE_LIMIT;
    const tz = await this.getTimezone(userId);
    const now = new Date();
    const todayKey = dateKeyForSrs(now, tz);

    const cards = await UserSpacedRepetition.find({ userId })
      .sort({ nextReviewAt: 1 })
      .limit(limit)
      .lean();

    const buckets = {
      overdue: [] as ReturnType<typeof serialize>[],
      dueToday: [] as ReturnType<typeof serialize>[],
      upcoming: [] as ReturnType<typeof serialize>[],
      completed: [] as ReturnType<typeof serialize>[],
    };

    for (const raw of cards) {
      const card = serialize(raw);
      if (card.status === "graduated" || card.status === "paused") {
        buckets.completed.push(card);
        continue;
      }
      const dueKey = dateKeyForSrs(new Date(card.nextReviewAt), tz);
      if (dueKey < todayKey) buckets.overdue.push(card);
      else if (dueKey === todayKey) buckets.dueToday.push(card);
      else buckets.upcoming.push(card);
    }

    const filter = String(query.bucket || "all").toLowerCase();
    let items = [
      ...buckets.overdue,
      ...buckets.dueToday,
      ...buckets.upcoming,
    ];
    if (filter === "overdue") items = buckets.overdue;
    else if (filter === "due" || filter === "due_today") items = buckets.dueToday;
    else if (filter === "upcoming") items = buckets.upcoming;
    else if (filter === "completed") items = buckets.completed;

    const recommendations = premium
      ? this.buildRecommendations(buckets)
      : [];

    return {
      timezone: tz,
      todayKey,
      premium,
      limits: { maxCards: limit },
      counts: {
        overdue: buckets.overdue.length,
        dueToday: buckets.dueToday.length,
        upcoming: buckets.upcoming.length,
        completed: buckets.completed.length,
        active:
          buckets.overdue.length +
          buckets.dueToday.length +
          buckets.upcoming.length,
      },
      buckets,
      items,
      recommendations,
      algorithm: {
        standard: "Hard→1d · Okay→×3(cap30) · Easy→×5(cap90)",
        advanced: premium
          ? "Hard→½prev(min1) · Okay→×3(cap60) · Easy→×7(cap180) + reschedule"
          : null,
      },
    };
  }

  private buildRecommendations(buckets: {
    overdue: ReturnType<typeof serialize>[];
    dueToday: ReturnType<typeof serialize>[];
  }) {
    const recs: Array<{
      type: string;
      title: string;
      evidence: string;
      problemId?: string;
    }> = [];

    if (buckets.overdue.length > 0) {
      const top = buckets.overdue[0];
      recs.push({
        type: "overdue",
        title: "Clear overdue revision first",
        evidence: `${buckets.overdue.length} card(s) past due; oldest nextReviewAt=${new Date(top.nextReviewAt).toISOString()}`,
        problemId: top.problemId,
      });
    }

    const hardCards = [...buckets.overdue, ...buckets.dueToday].filter(
      (c) => c.confidence === "hard" || c.confidenceScore === 1
    );
    if (hardCards.length > 0) {
      recs.push({
        type: "confidence",
        title: "Revisit hard-confidence problems",
        evidence: `${hardCards.length} due/overdue card(s) last rated Hard`,
        problemId: hardCards[0].problemId,
      });
    }

    const byDiff: Record<string, number> = {};
    for (const c of [...buckets.overdue, ...buckets.dueToday]) {
      byDiff[c.difficulty] = (byDiff[c.difficulty] || 0) + 1;
    }
    const weakDiff = Object.entries(byDiff).sort((a, b) => b[1] - a[1])[0];
    if (weakDiff && weakDiff[1] >= 2) {
      recs.push({
        type: "difficulty",
        title: `Focus ${weakDiff[0]} difficulty reviews`,
        evidence: `${weakDiff[1]} due/overdue cards are difficulty=${weakDiff[0]}`,
      });
    }

    return recs;
  }
}

export const srsService = new SrsService();
