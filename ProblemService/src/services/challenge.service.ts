import axios from "axios";
import { DailyChallenge } from "../models/dailyChallenge.model";
import { UserChallengeCompletion } from "../models/userChallengeCompletion.model";
import { UserStreakState } from "../models/userStreakState.model";
import { Problem } from "../models/problem.model";
import { serverConfig } from "../config";
import {
  resolveEntitlements,
  hasFeature,
  type EntitlementSnapshot,
} from "../utils/entitlementClient";
import {
  applyQualifiedDay,
  BADGE_DEFS,
  badgesForStreak,
  computeCurrentStreakFromDays,
  computeLongestStreakFromDays,
  dateKeyInTimeZone,
  FREE_HISTORY_DAYS,
  hashDateKey,
  isValidDateKey,
  isValidIanaTimeZone,
  shiftDateKey,
} from "../utils/streakRules";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../utils/errors/app.error";

const DEFAULT_TZ = "UTC";
const DEFAULT_FREEZE_GRANT = 2;

function publicChallenge(doc: any, locked: boolean) {
  const base = {
    dateKey: doc.dateKey,
    tier: doc.tier || "standard",
    isPublished: doc.isPublished !== false,
    accessLocked: locked,
  };
  if (locked) {
    return {
      ...base,
      problemId: null,
      problemSlug: null,
      title: "Premium challenge",
      difficulty: doc.difficulty || null,
      category: doc.category || null,
    };
  }
  return {
    ...base,
    problemId: String(doc.problemId),
    problemSlug: doc.problemSlug || null,
    title: doc.title || null,
    difficulty: doc.difficulty || null,
    category: doc.category || null,
  };
}

export class ChallengeService {
  async getOrCreateStreakState(userId: string) {
    let state = await UserStreakState.findOne({ userId });
    if (!state) {
      state = await UserStreakState.create({
        userId,
        timezone: DEFAULT_TZ,
        currentStreak: 0,
        longestStreak: 0,
        lastQualifiedDateKey: null,
        freezeBalance: 0,
        weeklyGoalTarget: 5,
        monthlyGoalTarget: 20,
        badges: [],
      });
    }
    return state;
  }

  todayKeyFor(state: { timezone?: string }, now = new Date()): string {
    return dateKeyInTimeZone(now, state.timezone || DEFAULT_TZ);
  }

  /**
   * Ensure a canonical challenge exists for dateKey.
   * Deterministic pick from published FREE problems — identical for all users.
   */
  async ensureChallengeForDate(dateKey: string) {
    if (!isValidDateKey(dateKey)) {
      throw new BadRequestError("Invalid dateKey");
    }
    let existing = await DailyChallenge.findOne({ dateKey });
    if (existing) return existing;

    const problems = await Problem.find({
      status: "published",
      isPremium: { $ne: true },
    })
      .select("_id slug title difficulty category")
      .lean();

    if (!problems.length) {
      throw new NotFoundError("No published problems available for daily challenge");
    }

    const idx = hashDateKey(dateKey) % problems.length;
    const p = problems[idx];
    try {
      existing = await DailyChallenge.create({
        dateKey,
        problemId: String(p._id),
        problemSlug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        category: p.category,
        tier: "standard",
        isPublished: true,
      });
    } catch (err: any) {
      // Race: another request created it
      if (err?.code === 11000) {
        existing = await DailyChallenge.findOne({ dateKey });
        if (existing) return existing;
      }
      throw err;
    }
    return existing!;
  }

  private async lockCheck(
    challenge: { tier?: string },
    snap: EntitlementSnapshot
  ): Promise<boolean> {
    if (challenge.tier === "advanced") {
      return !hasFeature(snap, "premium.daily_challenge_advanced");
    }
    return false;
  }

  async getTodayForUser(userId: string | null, authorization?: string | null) {
    const snap = await resolveEntitlements(authorization);
    let timezone = DEFAULT_TZ;
    let completed = false;
    if (userId) {
      const state = await this.getOrCreateStreakState(userId);
      timezone = state.timezone || DEFAULT_TZ;
    }
    const dateKey = dateKeyInTimeZone(new Date(), timezone);
    const challenge = await this.ensureChallengeForDate(dateKey);
    const locked = await this.lockCheck(challenge, snap);
    if (userId) {
      const done = await UserChallengeCompletion.findOne({
        userId,
        dateKey,
        kind: "completed",
      }).lean();
      completed = Boolean(done);
    }
    return {
      dateKey,
      timezone,
      completed,
      challenge: publicChallenge(challenge, locked),
      rules: {
        qualifyingActivity:
          "Accepted official submission on the canonical daily challenge problem for your timezone's calendar day",
        timezone: "User IANA timezone on streak profile (default UTC)",
        reset: "Missed calendar day without freeze resets current streak",
        freeze: "premium.streak_freeze may preserve one missed day",
        clientTimestamps: "Ignored — server clock only",
      },
    };
  }

  async getByDateKey(
    dateKey: string,
    userId: string | null,
    authorization?: string | null
  ) {
    if (!isValidDateKey(dateKey)) throw new BadRequestError("Invalid dateKey");
    const snap = await resolveEntitlements(authorization);
    await this.assertHistoryAccess(dateKey, userId, snap);

    let challenge = await DailyChallenge.findOne({ dateKey, isPublished: true });
    if (!challenge) {
      // Only auto-ensure today (or within free window) for missing catalog rows
      const tz = userId
        ? (await this.getOrCreateStreakState(userId)).timezone
        : DEFAULT_TZ;
      const today = dateKeyInTimeZone(new Date(), tz || DEFAULT_TZ);
      if (dateKey === today) {
        challenge = await this.ensureChallengeForDate(dateKey);
      }
    }
    if (!challenge) throw new NotFoundError("No challenge for this date");

    const locked = await this.lockCheck(challenge, snap);
    let completed = false;
    if (userId) {
      completed = Boolean(
        await UserChallengeCompletion.findOne({
          userId,
          dateKey,
          kind: "completed",
        }).lean()
      );
    }
    return {
      dateKey,
      completed,
      challenge: publicChallenge(challenge, locked),
    };
  }

  private async assertHistoryAccess(
    dateKey: string,
    userId: string | null,
    snap: EntitlementSnapshot
  ) {
    if (hasFeature(snap, "premium.challenge_history")) return;
    const tz = userId
      ? (await this.getOrCreateStreakState(userId)).timezone || DEFAULT_TZ
      : DEFAULT_TZ;
    const today = dateKeyInTimeZone(new Date(), tz);
    const oldest = shiftDateKey(today, -(FREE_HISTORY_DAYS - 1));
    if (dateKey < oldest || dateKey > today) {
      throw new ForbiddenError(
        "Historical challenge access requires premium.challenge_history"
      );
    }
  }

  async listHistory(
    from: string,
    to: string,
    userId: string | null,
    authorization?: string | null
  ) {
    if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) {
      throw new BadRequestError("Invalid from/to range");
    }
    const snap = await resolveEntitlements(authorization);
    const hasHist = hasFeature(snap, "premium.challenge_history");
    const tz = userId
      ? (await this.getOrCreateStreakState(userId)).timezone || DEFAULT_TZ
      : DEFAULT_TZ;
    const today = dateKeyInTimeZone(new Date(), tz);
    let rangeFrom = from;
    let rangeTo = to > today ? today : to;
    if (!hasHist) {
      const oldest = shiftDateKey(today, -(FREE_HISTORY_DAYS - 1));
      if (rangeFrom < oldest) rangeFrom = oldest;
      if (rangeTo > today) rangeTo = today;
    }

    const rows = await DailyChallenge.find({
      dateKey: { $gte: rangeFrom, $lte: rangeTo },
      isPublished: true,
    })
      .sort({ dateKey: -1 })
      .lean();

    const completedSet = new Set<string>();
    if (userId) {
      const comps = await UserChallengeCompletion.find({
        userId,
        dateKey: { $gte: rangeFrom, $lte: rangeTo },
        kind: "completed",
      })
        .select("dateKey")
        .lean();
      for (const c of comps) completedSet.add(c.dateKey);
    }

    return {
      from: rangeFrom,
      to: rangeTo,
      historyLocked: !hasHist,
      freeWindowDays: FREE_HISTORY_DAYS,
      items: await Promise.all(
        rows.map(async (r) => {
          const locked = await this.lockCheck(r, snap);
          return {
            ...publicChallenge(r, locked),
            completed: completedSet.has(r.dateKey),
          };
        })
      ),
    };
  }

  /**
   * Verify ACCEPTED official submission for problem via SubmissionService.
   * Client cannot forge this without a real accept.
   */
  async verifyAcceptedSubmission(
    userId: string,
    problemId: string,
    authorization?: string | null,
    submissionId?: string
  ): Promise<{ ok: boolean; submissionId?: string }> {
    const base = String(serverConfig.SUBMISSION_SERVICE_URL || "").replace(
      /\/$/,
      ""
    );
    if (!base) return { ok: false };

    try {
      if (submissionId) {
        const res = await axios.get(`${base}/api/v1/submissions/${submissionId}`, {
          headers: authorization ? { Authorization: authorization } : {},
          timeout: 8000,
          validateStatus: () => true,
        });
        const s = res.data?.data || res.data;
        if (
          res.status === 200 &&
          s &&
          String(s.userId) === userId &&
          String(s.problemId) === String(problemId) &&
          String(s.status).toUpperCase() === "ACCEPTED" &&
          s.source !== "run"
        ) {
          return { ok: true, submissionId: String(s.id || s._id || submissionId) };
        }
        return { ok: false };
      }

      const res = await axios.get(
        `${base}/api/v1/submissions/problem/${problemId}`,
        {
          headers: authorization ? { Authorization: authorization } : {},
          timeout: 15000,
          validateStatus: () => true,
        }
      );
      const list = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
          ? res.data
          : [];
      const hit = list.find(
        (s: any) =>
          String(s.userId) === userId &&
          String(s.status).toUpperCase() === "ACCEPTED" &&
          s.source !== "run"
      );
      if (hit) {
        return {
          ok: true,
          submissionId: String(hit.id || hit._id || ""),
        };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Complete today's daily challenge.
   * Ignores any client-supplied dateKey / completedAt (anti-spoof).
   */
  async completeToday(
    userId: string,
    authorization?: string | null,
    opts?: { submissionId?: string; /** internal only */ skipVerify?: boolean }
  ) {
    // Reject spoof attempts that might arrive in body — callers must not pass dateKey
    const state = await this.getOrCreateStreakState(userId);
    const todayKey = this.todayKeyFor(state);
    const challenge = await this.ensureChallengeForDate(todayKey);

    const snap = await resolveEntitlements(authorization);
    if (await this.lockCheck(challenge, snap)) {
      throw new ForbiddenError(
        "Advanced daily challenge requires premium.daily_challenge_advanced"
      );
    }

    const existing = await UserChallengeCompletion.findOne({
      userId,
      dateKey: todayKey,
    });
    if (existing?.kind === "completed") {
      const streak = await this.getStreakView(userId);
      return {
        duplicate: true,
        dateKey: todayKey,
        completion: this.publicCompletion(existing),
        streak,
      };
    }

    if (!opts?.skipVerify) {
      const verified = await this.verifyAcceptedSubmission(
        userId,
        String(challenge.problemId),
        authorization,
        opts?.submissionId
      );
      if (!verified.ok) {
        throw new BadRequestError(
          "No accepted submission found for today's challenge problem"
        );
      }
      opts = { ...opts, submissionId: verified.submissionId || opts?.submissionId };
    }

    const now = new Date();
    let completion = existing;
    if (existing?.kind === "frozen") {
      existing.kind = "completed";
      existing.completedAt = now;
      existing.problemId = String(challenge.problemId);
      existing.submissionId = opts?.submissionId;
      await existing.save();
      completion = existing;
    } else {
      try {
        completion = await UserChallengeCompletion.create({
          userId,
          dateKey: todayKey,
          problemId: String(challenge.problemId),
          completedAt: now,
          submissionId: opts?.submissionId,
          kind: "completed",
        });
      } catch (err: any) {
        if (err?.code === 11000) {
          const again = await UserChallengeCompletion.findOne({
            userId,
            dateKey: todayKey,
          });
          const streak = await this.getStreakView(userId);
          return {
            duplicate: true,
            dateKey: todayKey,
            completion: again ? this.publicCompletion(again) : null,
            streak,
          };
        }
        throw err;
      }
    }

    await this.refreshStreakAfterQualify(userId, todayKey);
    await this.maybeAwardGoalBadges(userId, todayKey);

    return {
      duplicate: false,
      dateKey: todayKey,
      completion: this.publicCompletion(completion!),
      streak: await this.getStreakView(userId),
    };
  }

  /**
   * Internal qualify (Evaluation/selftest) — still uses server clock for dateKey.
   */
  async qualifyInternal(
    userId: string,
    problemId: string,
    submissionId?: string
  ) {
    const state = await this.getOrCreateStreakState(userId);
    const todayKey = this.todayKeyFor(state);
    const challenge = await this.ensureChallengeForDate(todayKey);
    if (String(challenge.problemId) !== String(problemId)) {
      throw new BadRequestError(
        "Submission problem does not match today's canonical challenge"
      );
    }
    return this.completeToday(userId, null, {
      submissionId,
      skipVerify: true,
    });
  }

  async useFreeze(userId: string, authorization?: string | null) {
    const snap = await resolveEntitlements(authorization);
    if (!hasFeature(snap, "premium.streak_freeze")) {
      throw new ForbiddenError("Streak freeze requires premium.streak_freeze");
    }
    const state = await this.getOrCreateStreakState(userId);
    // Grant freeze balance once when entitled and empty
    if (state.freezeBalance <= 0) {
      state.freezeBalance = DEFAULT_FREEZE_GRANT;
      await state.save();
    }

    const todayKey = this.todayKeyFor(state);
    const yesterday = shiftDateKey(todayKey, -1);
    const dayBefore = shiftDateKey(todayKey, -2);

    const already = await UserChallengeCompletion.findOne({
      userId,
      dateKey: yesterday,
    });
    if (already) {
      throw new ConflictError("Yesterday is already qualified");
    }

    // Freeze only fills a single missed day: last qualify must be day-before-yesterday
    if (state.lastQualifiedDateKey !== dayBefore) {
      throw new BadRequestError(
        "Streak freeze only covers a single missed day after an active streak"
      );
    }

    if (state.freezeBalance <= 0) {
      throw new BadRequestError("No streak freezes remaining");
    }

    // Ensure a challenge row exists for calendar continuity
    await this.ensureChallengeForDate(yesterday).catch(() => null);

    const challenge = await DailyChallenge.findOne({ dateKey: yesterday });
    await UserChallengeCompletion.create({
      userId,
      dateKey: yesterday,
      problemId: challenge ? String(challenge.problemId) : "freeze",
      completedAt: new Date(),
      kind: "frozen",
    });

    state.freezeBalance -= 1;
    await state.save();
    await this.refreshStreakAfterQualify(userId, yesterday);

    return this.getStreakView(userId);
  }

  async setTimezone(userId: string, timezone: string) {
    if (!isValidIanaTimeZone(timezone)) {
      throw new BadRequestError("Invalid IANA timezone");
    }
    const state = await this.getOrCreateStreakState(userId);
    state.timezone = timezone;
    state.timezoneUpdatedAt = new Date();
    await state.save();
    // Recompute current streak against new "today" without inventing days
    await this.recomputeStreakCounters(userId);
    return this.getStreakView(userId);
  }

  async setGoals(
    userId: string,
    goals: { weeklyGoalTarget?: number; monthlyGoalTarget?: number }
  ) {
    const state = await this.getOrCreateStreakState(userId);
    if (goals.weeklyGoalTarget != null) {
      state.weeklyGoalTarget = Math.min(7, Math.max(1, goals.weeklyGoalTarget));
    }
    if (goals.monthlyGoalTarget != null) {
      state.monthlyGoalTarget = Math.min(
        31,
        Math.max(1, goals.monthlyGoalTarget)
      );
    }
    await state.save();
    return this.getStreakView(userId);
  }

  async getStreakView(userId: string) {
    const state = await this.getOrCreateStreakState(userId);
    const todayKey = this.todayKeyFor(state);
    const weekStart = shiftDateKey(todayKey, -((this.weekdayIndex(todayKey) + 6) % 7));
    const monthStart = `${todayKey.slice(0, 7)}-01`;

    const [weekCount, monthCount, calendarDays] = await Promise.all([
      UserChallengeCompletion.countDocuments({
        userId,
        dateKey: { $gte: weekStart, $lte: todayKey },
        kind: "completed",
      }),
      UserChallengeCompletion.countDocuments({
        userId,
        dateKey: { $gte: monthStart, $lte: todayKey },
        kind: "completed",
      }),
      UserChallengeCompletion.find({
        userId,
        dateKey: {
          $gte: shiftDateKey(todayKey, -40),
          $lte: todayKey,
        },
      })
        .select("dateKey kind")
        .lean(),
    ]);

    // Soft-refresh current streak from ledger (handles missed days without complete)
    const qualified = calendarDays.map((d) => d.dateKey);
    const liveCurrent = computeCurrentStreakFromDays(qualified, todayKey);
    if (liveCurrent !== state.currentStreak) {
      state.currentStreak = liveCurrent;
      if (liveCurrent > state.longestStreak) state.longestStreak = liveCurrent;
      await state.save();
    }

    return {
      timezone: state.timezone,
      todayKey,
      currentStreak: state.currentStreak,
      longestStreak: state.longestStreak,
      lastQualifiedDateKey: state.lastQualifiedDateKey,
      freezeBalance: state.freezeBalance,
      weeklyGoal: {
        target: state.weeklyGoalTarget,
        completed: weekCount,
        met: weekCount >= state.weeklyGoalTarget,
      },
      monthlyGoal: {
        target: state.monthlyGoalTarget,
        completed: monthCount,
        met: monthCount >= state.monthlyGoalTarget,
      },
      badges: (state.badges || []).map((b) => ({
        id: b.id,
        label: b.label || BADGE_DEFS[b.id] || b.id,
        earnedAt: b.earnedAt,
      })),
    };
  }

  async getCalendar(userId: string, from: string, to: string) {
    if (!isValidDateKey(from) || !isValidDateKey(to) || from > to) {
      throw new BadRequestError("Invalid from/to range");
    }
    const rows = await UserChallengeCompletion.find({
      userId,
      dateKey: { $gte: from, $lte: to },
    })
      .select("dateKey kind problemId completedAt")
      .sort({ dateKey: 1 })
      .lean();

    const challenges = await DailyChallenge.find({
      dateKey: { $gte: from, $lte: to },
      isPublished: true,
    })
      .select("dateKey title difficulty tier")
      .lean();
    const byDate = new Map(challenges.map((c) => [c.dateKey, c]));

    return {
      from,
      to,
      days: rows.map((r) => ({
        dateKey: r.dateKey,
        kind: r.kind,
        problemId: r.problemId,
        completedAt: r.completedAt,
        challengeTitle: byDate.get(r.dateKey)?.title || null,
        tier: byDate.get(r.dateKey)?.tier || "standard",
      })),
    };
  }

  async getBadges(userId: string) {
    const streak = await this.getStreakView(userId);
    return { badges: streak.badges };
  }

  async upsertAdminChallenge(
    dateKey: string,
    payload: {
      problemId: string;
      tier?: "standard" | "advanced";
      isPublished?: boolean;
    }
  ) {
    if (!isValidDateKey(dateKey)) throw new BadRequestError("Invalid dateKey");
    const problem = await Problem.findById(payload.problemId);
    if (!problem) throw new NotFoundError("Problem not found");
    const doc = await DailyChallenge.findOneAndUpdate(
      { dateKey },
      {
        dateKey,
        problemId: String(problem._id),
        problemSlug: problem.slug,
        title: problem.title,
        difficulty: problem.difficulty,
        category: problem.category,
        tier: payload.tier || "standard",
        isPublished: payload.isPublished !== false,
      },
      { upsert: true, returnDocument: "after" }
    );
    return publicChallenge(doc, false);
  }

  /**
   * Admin CMS read — includes unpublished drafts (not the public entitlement path).
   */
  async adminGetByDate(dateKey: string) {
    if (!isValidDateKey(dateKey)) throw new BadRequestError("Invalid dateKey");
    const doc = await DailyChallenge.findOne({ dateKey });
    if (!doc) throw new NotFoundError("No challenge for this date");
    return publicChallenge(doc, false);
  }

  private weekdayIndex(dateKey: string): number {
    const [y, m, d] = dateKey.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun
  }

  private publicCompletion(doc: any) {
    return {
      dateKey: doc.dateKey,
      problemId: doc.problemId,
      completedAt: doc.completedAt,
      kind: doc.kind,
      submissionId: doc.submissionId || null,
    };
  }

  private async refreshStreakAfterQualify(userId: string, qualifiedDateKey: string) {
    const state = await this.getOrCreateStreakState(userId);
    const applied = applyQualifiedDay({
      todayKey: qualifiedDateKey,
      lastQualifiedDateKey: state.lastQualifiedDateKey,
      currentStreak: state.currentStreak,
      longestStreak: state.longestStreak,
    });
    state.currentStreak = applied.currentStreak;
    state.longestStreak = applied.longestStreak;
    state.lastQualifiedDateKey = qualifiedDateKey;
    await this.mergeBadges(state, badgesForStreak(state.currentStreak));
    await state.save();
  }

  private async recomputeStreakCounters(userId: string) {
    const state = await this.getOrCreateStreakState(userId);
    const todayKey = this.todayKeyFor(state);
    const rows = await UserChallengeCompletion.find({ userId })
      .select("dateKey")
      .lean();
    const keys = rows.map((r) => r.dateKey);
    state.currentStreak = computeCurrentStreakFromDays(keys, todayKey);
    state.longestStreak = Math.max(
      state.longestStreak,
      computeLongestStreakFromDays(keys)
    );
    await state.save();
  }

  private async mergeBadges(
    state: InstanceType<typeof UserStreakState>,
    ids: string[]
  ) {
    const have = new Set((state.badges || []).map((b) => b.id));
    const now = new Date();
    for (const id of ids) {
      if (have.has(id)) continue;
      state.badges.push({
        id,
        earnedAt: now,
        label: BADGE_DEFS[id] || id,
      });
    }
  }

  private async maybeAwardGoalBadges(userId: string, todayKey: string) {
    const view = await this.getStreakView(userId);
    const state = await this.getOrCreateStreakState(userId);
    const ids: string[] = [];
    if (view.weeklyGoal.met) ids.push("weekly_goal");
    if (view.monthlyGoal.met) ids.push("monthly_goal");
    if (ids.length) {
      await this.mergeBadges(state, ids);
      await state.save();
    }
    void todayKey;
  }
}

export const challengeService = new ChallengeService();
