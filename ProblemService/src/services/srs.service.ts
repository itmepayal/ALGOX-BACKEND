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
import { UserProblemProgress } from "../models/userProblemProgress.model";
import { PROBLEM_PROGRESS_STATUS } from "../constants/progressStatus";
import { serverConfig } from "../config";
import axios from "axios";
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

type ProblemMeta = {
  title?: string;
  slug?: string;
  tags?: string[];
  difficulty?: string;
};

type SerializedCard = {
  id: string;
  userId: string;
  problemId: string;
  title: string;
  slug: string | null;
  tags: string[];
  difficulty: string;
  lastSolvedAt: Date | string | null;
  lastReviewedAt: Date | string | null;
  confidence: SrsFeedback | null;
  confidenceScore: number;
  attempts: number;
  reviewCount: number;
  intervalDays: number;
  nextReviewAt: Date | string;
  status: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  feedbackPreview?: {
    hard: { intervalDays: number; nextReviewAt: string };
    okay: { intervalDays: number; nextReviewAt: string };
    easy: { intervalDays: number; nextReviewAt: string };
  };
};

function serialize(
  card: IUserSpacedRepetition | Record<string, any>,
  meta?: ProblemMeta | null,
  opts?: { advanced?: boolean; previewFrom?: Date }
): SerializedCard {
  const o =
    typeof (card as any).toObject === "function"
      ? (card as any).toObject()
      : { ...card };
  const difficulty = String(
    meta?.difficulty || o.difficulty || "medium"
  ).toLowerCase();
  const intervalDays = Number(o.intervalDays) || 1;
  const base: SerializedCard = {
    id: String(o._id || o.id),
    userId: String(o.userId),
    problemId: String(o.problemId),
    title: String(meta?.title || "").trim() || "Untitled problem",
    slug: meta?.slug ? String(meta.slug) : null,
    tags: Array.isArray(meta?.tags)
      ? meta!.tags.map((t) => String(t)).filter(Boolean).slice(0, 8)
      : [],
    difficulty,
    lastSolvedAt: o.lastSolvedAt || null,
    lastReviewedAt: o.lastReviewedAt || null,
    confidence: o.confidence || null,
    confidenceScore: Number(o.confidenceScore) || 0,
    attempts: Number(o.attempts) || 0,
    reviewCount: Number(o.reviewCount) || 0,
    intervalDays,
    nextReviewAt: o.nextReviewAt,
    status: o.status || "active",
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };

  if (opts?.previewFrom) {
    const advanced = Boolean(opts.advanced);
    const from = opts.previewFrom;
    const mk = (feedback: SrsFeedback) => {
      const s = computeNextReviewAt(from, intervalDays, feedback, advanced);
      return {
        intervalDays: s.intervalDays,
        nextReviewAt: s.nextReviewAt.toISOString(),
      };
    };
    base.feedbackPreview = {
      hard: mk("hard"),
      okay: mk("okay"),
      easy: mk("easy"),
    };
  }

  return base;
}

async function loadProblemMeta(
  problemIds: string[]
): Promise<Map<string, ProblemMeta>> {
  const map = new Map<string, ProblemMeta>();
  const ids = [
    ...new Set(
      problemIds.filter((id) => id && Types.ObjectId.isValid(id))
    ),
  ].map((id) => new Types.ObjectId(id));
  if (ids.length === 0) return map;
  const rows = await Problem.find({ _id: { $in: ids } })
    .select("title slug tags difficulty")
    .lean();
  for (const row of rows) {
    map.set(String(row._id), {
      title: row.title,
      slug: row.slug,
      tags: Array.isArray(row.tags) ? row.tags : [],
      difficulty: row.difficulty,
    });
  }
  return map;
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
   *
   * @param opts.backfill — schedule due immediately (today) so historical ACCEPTEDs
   *   appear in the queue instead of waiting another +1 day from sync time.
   */
  async seedOnSolve(input: {
    userId: string;
    problemId: string;
    difficulty?: string;
    backfill?: boolean;
    solvedAt?: Date | null;
  }) {
    const userId = String(input.userId || "").trim();
    const problemId = oid(String(input.problemId), "problemId");
    if (!userId) throw new BadRequestError("userId is required");

    const now = new Date();
    const existing = await UserSpacedRepetition.findOne({ userId, problemId });
    if (existing) {
      existing.lastSolvedAt = input.solvedAt || now;
      existing.attempts = (existing.attempts || 0) + 1;
      if (input.difficulty) {
        existing.difficulty = String(input.difficulty).toLowerCase();
      }
      if (existing.status === "graduated") {
        // Re-solve after graduation reactivates with first interval
        existing.status = "active";
        existing.intervalDays = FIRST_INTERVAL_DAYS;
        existing.nextReviewAt = input.backfill
          ? now
          : addDaysUtc(now, FIRST_INTERVAL_DAYS);
      }
      await existing.save();
      const metaMap = await loadProblemMeta([String(problemId)]);
      return {
        created: false,
        duplicate: true,
        card: serialize(existing, metaMap.get(String(problemId))),
      };
    }

    let difficulty = (input.difficulty || "medium").toLowerCase();
    let problemMeta: ProblemMeta | null = null;
    try {
      const problem = await Problem.findById(problemId)
        .select("difficulty title slug tags")
        .lean();
      if (problem) {
        problemMeta = {
          title: problem.title,
          slug: problem.slug,
          tags: Array.isArray(problem.tags) ? problem.tags : [],
          difficulty: problem.difficulty,
        };
        if (problem.difficulty) {
          difficulty = String(problem.difficulty).toLowerCase();
        }
      }
    } catch {
      /* keep provided */
    }

    const solvedAt = input.solvedAt || now;
    // Live ACCEPTED: first review = +1 day. Backfill: due today so the queue is usable.
    const nextReviewAt = input.backfill
      ? now
      : addDaysUtc(solvedAt, FIRST_INTERVAL_DAYS);

    const card = await UserSpacedRepetition.create({
      userId,
      problemId,
      difficulty,
      lastSolvedAt: solvedAt,
      lastReviewedAt: null,
      confidence: undefined,
      confidenceScore: 0,
      attempts: 1,
      reviewCount: 0,
      intervalDays: FIRST_INTERVAL_DAYS,
      nextReviewAt,
      status: "active",
    });

    return {
      created: true,
      duplicate: false,
      card: serialize(card, problemMeta),
    };
  }

  /**
   * Collect solved problem IDs from progress + ACCEPTED submissions.
   * Shared by import-candidates and sync-from-solved.
   */
  private async collectSolvedProblemMeta(
    userId: string,
    authorization: string | null | undefined,
    limit: number
  ) {
    const problemMeta = new Map<
      string,
      { solvedAt?: Date | null; difficulty?: string }
    >();

    const progressRows = await UserProblemProgress.find({
      userId: String(userId),
      status: PROBLEM_PROGRESS_STATUS.SOLVED,
    })
      .select("problemId solvedAt")
      .limit(limit * 2)
      .lean();

    for (const row of progressRows) {
      const pid = String(row.problemId || "");
      if (!pid || !Types.ObjectId.isValid(pid)) continue;
      problemMeta.set(pid, { solvedAt: row.solvedAt || null });
    }

    let submissionHits = 0;
    if (authorization) {
      try {
        const base = String(serverConfig.SUBMISSION_SERVICE_URL || "").replace(
          /\/$/,
          ""
        );
        if (base) {
          const res = await axios.get(
            `${base}/api/v1/submissions/me/analytics`,
            {
              headers: { Authorization: authorization },
              params: {
                status: "ACCEPTED",
                range: "1y",
                limit: 50,
                page: 1,
              },
              timeout: 10000,
              validateStatus: () => true,
            }
          );
          const items = Array.isArray(res.data?.data?.items)
            ? res.data.data.items
            : [];
          for (const item of items) {
            const pid = String(item.problemId || "");
            if (!pid || !Types.ObjectId.isValid(pid)) continue;
            submissionHits += 1;
            if (!problemMeta.has(pid)) {
              problemMeta.set(pid, {
                solvedAt: item.createdAt ? new Date(item.createdAt) : null,
              });
            }
          }
        }
      } catch {
        /* progress-only fallback */
      }
    }

    return {
      problemMeta,
      sources: {
        progress: progressRows.length,
        submissions: submissionHits,
      },
    };
  }

  /** List solved problems eligible for import (not yet enrolled or already in queue). */
  async listImportCandidates(
    userId: string,
    authorization?: string | null
  ): Promise<{
    items: Array<{
      problemId: string;
      title: string;
      difficulty: string;
      tags: string[];
      solvedAt: string | null;
      enrolled: boolean;
    }>;
    sources: { progress: number; submissions: number };
  }> {
    const premium = await this.isPremium(authorization);
    const limit = premium ? PREMIUM_QUEUE_LIMIT : FREE_QUEUE_LIMIT;
    const { problemMeta, sources } = await this.collectSolvedProblemMeta(
      userId,
      authorization,
      limit
    );

    const ids = [...problemMeta.keys()].slice(0, limit);
    const metaMap = await loadProblemMeta(ids);
    const enrolledRows = await UserSpacedRepetition.find({
      userId: String(userId),
      problemId: { $in: ids.map((id) => oid(id, "problemId")) },
    })
      .select("problemId")
      .lean();
    const enrolledSet = new Set(
      enrolledRows.map((r) => String(r.problemId))
    );

    const items = ids.map((problemId) => {
      const meta = problemMeta.get(problemId);
      const p = metaMap.get(problemId);
      return {
        problemId,
        title: String(p?.title || "").trim() || "Untitled problem",
        difficulty: String(
          p?.difficulty || meta?.difficulty || "medium"
        ).toLowerCase(),
        tags: Array.isArray(p?.tags)
          ? p!.tags.map((t) => String(t)).filter(Boolean).slice(0, 8)
          : [],
        solvedAt: meta?.solvedAt
          ? new Date(meta.solvedAt).toISOString()
          : null,
        enrolled: enrolledSet.has(problemId),
      };
    });

    return { items, sources };
  }

  /**
   * Import revision cards from known ACCEPTED / SOLVED progress.
   * Idempotent. Used when Evaluation seed missed historical solves.
   */
  async syncFromSolved(
    userId: string,
    authorization?: string | null,
    opts?: { problemIds?: string[] }
  ): Promise<{
    scanned: number;
    created: number;
    existing: number;
    sources: { progress: number; submissions: number };
  }> {
    const premium = await this.isPremium(authorization);
    const limit = premium ? PREMIUM_QUEUE_LIMIT : FREE_QUEUE_LIMIT;

    const { problemMeta, sources } = await this.collectSolvedProblemMeta(
      userId,
      authorization,
      limit
    );

    const selected = Array.isArray(opts?.problemIds)
      ? opts!.problemIds
          .map((id) => String(id || "").trim())
          .filter(
            (id) => id && Types.ObjectId.isValid(id) && problemMeta.has(id)
          )
      : null;

    const entries = selected
      ? selected.map((id) => [id, problemMeta.get(id)!] as const)
      : [...problemMeta.entries()];

    let created = 0;
    let existing = 0;
    let scanned = 0;
    for (const [problemId, meta] of entries) {
      if (scanned >= limit) break;
      scanned += 1;
      const already = await UserSpacedRepetition.findOne({
        userId: String(userId),
        problemId: oid(problemId, "problemId"),
      })
        .select("_id")
        .lean();
      if (already) {
        existing += 1;
        continue;
      }
      const result = await this.seedOnSolve({
        userId,
        problemId,
        backfill: true,
        solvedAt: meta.solvedAt || undefined,
        difficulty: meta.difficulty,
      });
      if (result.created) created += 1;
      else existing += 1;
    }

    return {
      scanned,
      created,
      existing,
      sources,
    };
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
    this.assertCardOwner(card, userId);
    if (card.status === "paused") {
      throw new BadRequestError("Card is paused; resume before reviewing");
    }

    const now = new Date();
    // Double-submit guard: same feedback within 2s returns current schedule.
    if (
      card.lastReviewedAt &&
      card.confidence === feedback &&
      now.getTime() - new Date(card.lastReviewedAt).getTime() < 2000
    ) {
      const metaMap = await loadProblemMeta([String(pid)]);
      return {
        card: serialize(card, metaMap.get(String(pid)), {
          advanced,
          previewFrom: now,
        }),
        schedule: {
          previousIntervalDays: card.intervalDays || FIRST_INTERVAL_DAYS,
          intervalDays: card.intervalDays || FIRST_INTERVAL_DAYS,
          nextReviewAt: card.nextReviewAt,
          feedback,
          advanced,
          duplicate: true,
        },
      };
    }

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
    const metaMap = await loadProblemMeta([String(pid)]);
    return {
      card: serialize(card, metaMap.get(String(pid)), {
        advanced,
        previewFrom: now,
      }),
      schedule: {
        previousIntervalDays: prevInterval,
        intervalDays: scheduled.intervalDays,
        nextReviewAt: scheduled.nextReviewAt,
        feedback,
        advanced,
        duplicate: false,
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
    const metaMap = await loadProblemMeta([String(pid)]);
    return { card: serialize(card, metaMap.get(String(pid))) };
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
    this.assertCardOwner(card, userId);
    card.status = status;
    await card.save();
    const metaMap = await loadProblemMeta([String(pid)]);
    return { card: serialize(card, metaMap.get(String(pid))) };
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
    const tomorrowKey = dateKeyForSrs(addDaysUtc(now, 1), tz);
    const weekEndKey = dateKeyForSrs(addDaysUtc(now, 7), tz);

    const cards = await UserSpacedRepetition.find({ userId })
      .sort({ nextReviewAt: 1 })
      .limit(limit)
      .lean();

    const metaMap = await loadProblemMeta(
      cards.map((c) => String(c.problemId))
    );

    const buckets = {
      overdue: [] as SerializedCard[],
      dueToday: [] as SerializedCard[],
      upcoming: [] as SerializedCard[],
      completed: [] as SerializedCard[],
    };

    for (const raw of cards) {
      const pid = String(raw.problemId);
      const card = serialize(raw, metaMap.get(pid), {
        advanced: premium,
        previewFrom: now,
      });
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

    const upcomingByDayMap = new Map<string, number>();
    for (const card of buckets.upcoming) {
      const key = dateKeyForSrs(new Date(card.nextReviewAt), tz);
      upcomingByDayMap.set(key, (upcomingByDayMap.get(key) || 0) + 1);
    }
    const upcomingByDay = [...upcomingByDayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 14)
      .map(([dateKey, count]) => ({ dateKey, count }));

    let thisWeek = buckets.dueToday.length + buckets.overdue.length;
    for (const card of buckets.upcoming) {
      const key = dateKeyForSrs(new Date(card.nextReviewAt), tz);
      if (key > todayKey && key <= weekEndKey) thisWeek += 1;
    }

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
      reviewLoad: {
        today: buckets.dueToday.length + buckets.overdue.length,
        tomorrow: upcomingByDay.find((d) => d.dateKey === tomorrowKey)?.count || 0,
        thisWeek,
      },
      upcomingByDay,
      buckets,
      items,
      recommendations,
      algorithm: {
        standard: "Hard→1d · Okay→×3(cap30) · Easy→×5(cap90)",
        advanced: premium
          ? "Hard→½prev(min1) · Okay→×3(cap60) · Easy→×7(cap180) + reschedule"
          : null,
        rules: {
          free: {
            hard: "Review in 1 day",
            okay: "×3 previous interval (cap 30 days)",
            easy: "×5 previous interval (cap 90 days)",
          },
          premium: {
            hard: "Half previous interval when ≥4 days, else 1 day (min 1)",
            okay: "×3 previous interval (cap 60 days)",
            easy: "×7 previous interval (cap 180 days)",
            reschedule: "Manual delayDays 0–365",
          },
        },
      },
    };
  }

  private buildRecommendations(buckets: {
    overdue: SerializedCard[];
    dueToday: SerializedCard[];
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
        evidence: `${buckets.overdue.length} card(s) past due; oldest next review ${top.nextReviewAt}`,
        problemId: top.problemId,
      });
    } else if (buckets.dueToday.length > 0) {
      recs.push({
        type: "due_today",
        title: "Finish today's reviews",
        evidence: `${buckets.dueToday.length} card(s) due today`,
        problemId: buckets.dueToday[0].problemId,
      });
    } else {
      recs.push({
        type: "caught_up",
        title: "You're caught up on overdue reviews",
        evidence: "No overdue or due-today cards in the current queue window",
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
