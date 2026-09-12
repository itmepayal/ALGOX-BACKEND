import { createHash } from "crypto";
import { Types } from "mongoose";
import { Submission, ISubmission } from "../models/submission.model";
import {
  SuspiciousSubmission,
  severityFromScore,
  ISuspiciousSubmission,
} from "../models/suspiciousSubmission.model";
import logger from "../config/logger.config";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Suspicious submission heuristics (transparent, documented thresholds)
 *
 * CRITICAL POLICY: These heuristics ONLY flag for admin review.
 * They NEVER auto-ban, suspend, or otherwise punish accounts.
 *
 * Score contributions (capped at 100). Persist only when score ≥ 30
 * (severity REVIEW / HIGH_RISK / CRITICAL). NORMAL (0–29) is discarded as noise.
 *
 * 1. High submission frequency
 *    Trigger: > FREQUENCY_MAX submissions by the same user within FREQUENCY_WINDOW_MS
 *    Contribution: +FREQUENCY_SCORE
 *
 * 2. Repeated identical code hash
 *    Trigger: same user + same SHA-256(code) appears ≥ IDENTICAL_MIN times in IDENTICAL_WINDOW_MS
 *    Contribution: +IDENTICAL_SCORE
 *
 * 3. Abnormal acceptance-rate spike
 *    Trigger: recent ACCEPTED rate (last RECENT_N submits) ≥ SPIKE_RECENT_MIN_RATE
 *             AND prior historical rate (up to HISTORY_N before that) ≤ SPIKE_HISTORY_MAX_RATE
 *             with enough samples in both windows
 *    Contribution: +SPIKE_SCORE
 *
 * 4. Rapid repeated executions (source=run)
 *    Trigger: > RUN_MAX run attempts by the same user within RUN_WINDOW_MS
 *    Contribution: +RUN_SCORE
 * ─────────────────────────────────────────────────────────────────────────────
 */

const FREQUENCY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const FREQUENCY_MAX = 10;
const FREQUENCY_SCORE = 30;

const IDENTICAL_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const IDENTICAL_MIN = 3;
const IDENTICAL_SCORE = 25;

const RECENT_N = 15;
const HISTORY_N = 40;
const SPIKE_RECENT_MIN_RATE = 0.9;
const SPIKE_HISTORY_MAX_RATE = 0.4;
const SPIKE_MIN_RECENT = 8;
const SPIKE_MIN_HISTORY = 10;
const SPIKE_SCORE = 35;

const RUN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RUN_MAX = 20;
const RUN_SCORE = 20;

/** Minimum score to persist a flag (skip NORMAL noise). */
const PERSIST_MIN_SCORE = 30;

export function hashCode(code: string): string {
  return createHash("sha256").update(code || "").digest("hex");
}

function acceptanceRate(rows: Array<{ status: string }>): number {
  if (!rows.length) return 0;
  const accepted = rows.filter((r) => r.status === "ACCEPTED").length;
  return accepted / rows.length;
}

export interface HeuristicResult {
  signals: string[];
  score: number;
}

/**
 * Evaluate heuristics for a saved submission. Does not ban or mutate user accounts.
 */
export async function evaluateHeuristics(
  submission: ISubmission
): Promise<HeuristicResult> {
  const signals: string[] = [];
  let score = 0;

  const userId = submission.userId?.toString();
  if (!userId) {
    return { signals, score: 0 };
  }

  const now = submission.createdAt
    ? new Date(submission.createdAt).getTime()
    : Date.now();

  // ── 1. High submission frequency ──────────────────────────────────────────
  const freqSince = new Date(now - FREQUENCY_WINDOW_MS);
  const recentCount = await Submission.countDocuments({
    userId: new Types.ObjectId(userId),
    createdAt: { $gte: freqSince },
  });
  if (recentCount > FREQUENCY_MAX) {
    signals.push(
      `high_frequency:${recentCount}_submissions_in_${FREQUENCY_WINDOW_MS / 60000}m(threshold>${FREQUENCY_MAX})`
    );
    score += FREQUENCY_SCORE;
  }

  // ── 2. Repeated identical code hash ───────────────────────────────────────
  const codeDigest = hashCode(submission.code);
  const identicalSince = new Date(now - IDENTICAL_WINDOW_MS);
  const sameHashRows = await Submission.find({
    userId: new Types.ObjectId(userId),
    createdAt: { $gte: identicalSince },
  })
    .select("code")
    .lean();

  const identicalCount = sameHashRows.filter(
    (r) => hashCode(r.code || "") === codeDigest
  ).length;

  if (identicalCount >= IDENTICAL_MIN) {
    signals.push(
      `identical_code_hash:${identicalCount}_times_in_${IDENTICAL_WINDOW_MS / 60000}m(threshold≥${IDENTICAL_MIN})`
    );
    score += IDENTICAL_SCORE;
  }

  // ── 3. Abnormal acceptance-rate spike (submit source preferred) ───────────
  const history = await Submission.find({
    userId: new Types.ObjectId(userId),
    source: { $ne: "run" },
    status: {
      $in: [
        "ACCEPTED",
        "WRONG_ANSWER",
        "TIME_LIMIT_EXCEEDED",
        "MEMORY_LIMIT_EXCEEDED",
        "RUNTIME_ERROR",
        "COMPILATION_ERROR",
      ],
    },
  })
    .select("status")
    .sort({ createdAt: -1 })
    .limit(RECENT_N + HISTORY_N)
    .lean();

  const recent = history.slice(0, RECENT_N);
  const prior = history.slice(RECENT_N, RECENT_N + HISTORY_N);

  if (recent.length >= SPIKE_MIN_RECENT && prior.length >= SPIKE_MIN_HISTORY) {
    const recentRate = acceptanceRate(recent);
    const priorRate = acceptanceRate(prior);
    if (
      recentRate >= SPIKE_RECENT_MIN_RATE &&
      priorRate <= SPIKE_HISTORY_MAX_RATE
    ) {
      signals.push(
        `acceptance_spike:recent_${Math.round(recentRate * 100)}%_vs_history_${Math.round(priorRate * 100)}%`
      );
      score += SPIKE_SCORE;
    }
  }

  // ── 4. Rapid repeated executions (source=run) ─────────────────────────────
  const runSince = new Date(now - RUN_WINDOW_MS);
  const runCount = await Submission.countDocuments({
    userId: new Types.ObjectId(userId),
    source: "run",
    createdAt: { $gte: runSince },
  });
  if (runCount > RUN_MAX) {
    signals.push(
      `rapid_executions:${runCount}_runs_in_${RUN_WINDOW_MS / 60000}m(threshold>${RUN_MAX})`
    );
    score += RUN_SCORE;
  }

  score = Math.min(100, score);
  return { signals, score };
}

/**
 * Analyze a submission after create/complete. Persists only REVIEW+ flags.
 * Failures are logged and never block the submission path. Never auto-bans.
 */
export async function analyzeAndMaybeFlag(
  submission: ISubmission | null | undefined
): Promise<ISuspiciousSubmission | null> {
  try {
    if (!submission?._id || !submission.userId) return null;

    const { signals, score } = await evaluateHeuristics(submission);
    if (score < PERSIST_MIN_SCORE || signals.length === 0) {
      return null;
    }

    const severity = severityFromScore(score);
    if (severity === "NORMAL") return null;

    const submissionId = submission._id;
    const userId = submission.userId;

    // Upsert open flag for this submission — never escalate to ban.
    const existing = await SuspiciousSubmission.findOne({
      submissionId,
      status: { $in: ["FLAGGED", "REVIEWING"] },
    });

    if (existing) {
      existing.signals = Array.from(new Set([...existing.signals, ...signals]));
      existing.score = Math.max(existing.score, score);
      existing.severity = severityFromScore(existing.score);
      await existing.save();
      logger.info("[Suspicious] updated open flag (review only, no auto-ban)", {
        id: existing._id,
        submissionId: submissionId.toString(),
        score: existing.score,
        severity: existing.severity,
      });
      return existing;
    }

    const created = await SuspiciousSubmission.create({
      userId,
      submissionId,
      signals,
      score,
      severity,
      status: "FLAGGED",
    });

    logger.info("[Suspicious] flagged for admin review (no auto-ban)", {
      id: created._id,
      submissionId: submissionId.toString(),
      userId: userId.toString(),
      score,
      severity,
      signals,
    });

    return created;
  } catch (err: any) {
    logger.error("[Suspicious] analyze failed (non-blocking)", {
      error: err?.message,
      submissionId: submission?._id?.toString?.(),
    });
    return null;
  }
}

/** Fire-and-forget wrapper so callers never await slow heuristics. */
export function scheduleSuspiciousAnalysis(
  submission: ISubmission | null | undefined
): void {
  if (!submission) return;
  setImmediate(() => {
    void analyzeAndMaybeFlag(submission);
  });
}
