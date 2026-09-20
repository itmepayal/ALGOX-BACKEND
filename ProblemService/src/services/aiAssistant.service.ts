import { AiUsageDaily, AiUsageEvent } from "../models/aiUsage.model";
import { Problem } from "../models/problem.model";
import {
  resolveEntitlements,
  hasFeature,
  type EntitlementSnapshot,
} from "../utils/entitlementClient";
import {
  AI_FEATURE_META,
  AI_FEATURES,
  isAiFeature,
  isPremiumOnlyAiFeature,
  type AiFeatureId,
} from "../ai/aiFeatures";
import { checkAiRateLimit } from "../ai/aiRateLimit";
import { getAiProviderConfig, runAiAssist } from "../ai/aiProvider";
import { looksLikeSolutionDumpRequest } from "../ai/aiPolicy";
import type { AiAssistDto } from "../validators/ai.validator";
import {
  BadRequestError,
  ForbiddenError,
  TooManyRequestsError,
  ServiceUnavailableError,
} from "../utils/errors/app.error";
import { PremiumRequiredError } from "../utils/problemAccess";

function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Strip provider/infra leakage from user-facing failure reasons. */
function sanitizeFailureReason(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const s = String(raw);
  if (
    /api.?key|openai|gemini|provider|ECONN|ETIMEDOUT|ENOTFOUND|BLOCKED|stack|mongo|redis/i.test(
      s
    )
  ) {
    return "Request couldn't be completed";
  }
  return s.slice(0, 160);
}

/** Free tier: no AI credits (AlgoPath AI is Premium-only). */
function freeDailyQuota(): number {
  // Product rule — ignore AI_FREE_DAILY_QUOTA so free users never receive a usable credit pool.
  void process.env.AI_FREE_DAILY_QUOTA;
  return 0;
}

function premiumDailyQuota(): number {
  return Math.max(0, Number(process.env.AI_PREMIUM_DAILY_QUOTA) || 100);
}

function rateMax(): number {
  return Math.max(1, Number(process.env.AI_RATE_LIMIT_MAX) || 20);
}

function rateWindowMs(): number {
  return Math.max(1000, Number(process.env.AI_RATE_LIMIT_WINDOW_MS) || 60_000);
}

export class AiAssistantService {
  /**
   * Guest → none.
   * Free / expired / canceled Premium → no AI (quota 0).
   * Active Premium (or premium.ai grant) → premium daily quota.
   *
   * Entitlement is resolved from AuthService DB via resolveEntitlements —
   * never from client body/JWT claims alone.
   */
  resolveQuota(snap: EntitlementSnapshot): {
    accessTier: "FREE" | "PREMIUM";
    quota: number;
    premiumFeatures: boolean;
  } {
    if (snap.accessTier === "GUEST") {
      return { accessTier: "FREE", quota: 0, premiumFeatures: false };
    }
    const premium =
      snap.accessTier === "PREMIUM" || hasFeature(snap, "premium.ai");
    if (premium) {
      return {
        accessTier: "PREMIUM",
        quota: premiumDailyQuota(),
        premiumFeatures: true,
      };
    }
    return {
      accessTier: "FREE",
      quota: freeDailyQuota(),
      premiumFeatures: false,
    };
  }

  /** Reject non-Premium before rate limit, quota burn, or provider call. */
  assertPremiumAi(snap: EntitlementSnapshot, q: ReturnType<AiAssistantService["resolveQuota"]>) {
    if (q.premiumFeatures) return;
    throw new PremiumRequiredError(
      "AlgoPath AI is available to Premium members only.",
      {
        feature: "premium.ai",
        accessTier: snap.accessTier === "GUEST" ? "GUEST" : q.accessTier,
      }
    );
  }

  async getOrCreateDaily(userId: string, snap: EntitlementSnapshot) {
    const dateKey = utcDateKey();
    const q = this.resolveQuota(snap);
    let row = await AiUsageDaily.findOne({ userId, dateKey });
    if (!row) {
      row = await AiUsageDaily.create({
        userId,
        dateKey,
        accessTier: q.accessTier,
        quota: q.quota,
        used: 0,
        failed: 0,
        byFeature: {},
      });
    } else if (row.quota !== q.quota || row.accessTier !== q.accessTier) {
      // Refresh quota/tier if subscription changed (never accept client values)
      row.quota = q.quota;
      row.accessTier = q.accessTier;
      await row.save();
    }
    return row;
  }

  async getUsage(userId: string, authorization?: string | null) {
    const snap = await resolveEntitlements(authorization);
    if (snap.accessTier === "GUEST") {
      throw new ForbiddenError("Sign in to use AlgoPath AI");
    }
    const row = await this.getOrCreateDaily(userId, snap);
    const q = this.resolveQuota(snap);
    return {
      dateKey: row.dateKey,
      accessTier: q.accessTier,
      quota: row.quota,
      used: row.used,
      remaining: Math.max(0, row.quota - row.used),
      failed: row.failed,
      byFeature: row.byFeature || {},
      premiumFeatures: q.premiumFeatures,
      features: AI_FEATURES.map((id) => ({
        id,
        ...AI_FEATURE_META[id],
        premiumOnly: isPremiumOnlyAiFeature(id),
      })),
      providerConfigured: getAiProviderConfig().configured,
      // Never return API keys — only a boolean configured flag above
    };
  }

  async getHistory(
    userId: string,
    authorization?: string | null,
    opts: { limit?: number; status?: "all" | "success" | "failed" } = {}
  ) {
    const snap = await resolveEntitlements(authorization);
    if (snap.accessTier === "GUEST") {
      throw new ForbiddenError("Sign in to view AI history");
    }
    const limit = Math.min(50, Math.max(1, Number(opts.limit) || 30));
    const filter: Record<string, unknown> = { userId };
    if (opts.status === "success") filter.success = true;
    if (opts.status === "failed") filter.success = false;

    const rows = await AiUsageEvent.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select(
        "feature dateKey success failureReason problemId hadCodeSnippet codeLength latencyMs createdAt"
      )
      .lean();

    return {
      items: rows.map((r) => ({
        feature: r.feature,
        dateKey: r.dateKey,
        success: r.success,
        failureReason: sanitizeFailureReason(r.failureReason),
        problemId: r.problemId || undefined,
        hadCodeSnippet: Boolean(r.hadCodeSnippet),
        codeLength: r.codeLength,
        latencyMs: r.latencyMs,
        createdAt: r.createdAt,
      })),
    };
  }

  async assist(
    userId: string,
    body: AiAssistDto,
    authorization?: string | null
  ) {
    const snap = await resolveEntitlements(authorization);
    if (snap.accessTier === "GUEST" || !userId) {
      throw new ForbiddenError("Sign in to use AlgoPath AI");
    }

    if (!isAiFeature(body.feature)) {
      throw new BadRequestError("Unknown AI feature");
    }
    const feature = body.feature as AiFeatureId;
    const q = this.resolveQuota(snap);

    // Premium entitlement FIRST — before rate limit, quota, or provider
    this.assertPremiumAi(snap, q);

    if (isPremiumOnlyAiFeature(feature) && !q.premiumFeatures) {
      // Defense in depth (unreachable when assertPremiumAi holds)
      this.assertPremiumAi(snap, q);
    }

    // Abuse: rate limit (separate from daily quota)
    const rl = await checkAiRateLimit(
      `ai:${userId}`,
      rateMax(),
      rateWindowMs()
    );
    if (!rl.allowed) {
      throw new TooManyRequestsError(
        `AI rate limit exceeded. Retry after ${rl.retryAfterSec}s`,
        { retryAfterSec: rl.retryAfterSec }
      );
    }

    const dateKey = utcDateKey();
    if (q.quota <= 0) {
      throw new ForbiddenError("AI is not available for your plan");
    }

    // Prefer quota exhaustion over provider errors when the user is out of credits.
    const existingDaily = await AiUsageDaily.findOne({ userId, dateKey }).lean();
    if (existingDaily && existingDaily.used >= existingDaily.quota) {
      throw new ForbiddenError(
        `Daily AI quota exhausted (${existingDaily.used}/${existingDaily.quota}). Resets at UTC midnight.`
      );
    }

    // Fail fast when LLM is required but not configured — do not burn quota on stubs.
    // Solution-dump refusals are learning policy and do not need a provider key.
    const precheckBlob = [
      body.userMessage,
      body.errorMessage,
      body.testCase,
      body.codeSnippet,
    ]
      .filter(Boolean)
      .join("\n");
    if (
      !looksLikeSolutionDumpRequest(precheckBlob) &&
      !getAiProviderConfig().configured
    ) {
      throw new ServiceUnavailableError(
        "AlgoPath AI is temporarily unavailable. Please try again later.",
        { code: "AI_NOT_CONFIGURED" }
      );
    }

    // Atomic quota consume — prevents race overuse under concurrent assists
    const claimed = await AiUsageDaily.findOneAndUpdate(
      {
        userId,
        dateKey,
        $expr: { $lt: ["$used", "$quota"] },
      },
      {
        $inc: { used: 1, [`byFeature.${feature}`]: 1 },
        $setOnInsert: {
          accessTier: q.accessTier,
          quota: q.quota,
          failed: 0,
        },
        $set: { accessTier: q.accessTier, quota: q.quota },
      },
      { upsert: true, returnDocument: "after" }
    ).catch(async () => {
      // Upsert race on unique index — retry without upsert
      return AiUsageDaily.findOneAndUpdate(
        {
          userId,
          dateKey,
          $expr: { $lt: ["$used", "$quota"] },
        },
        {
          $inc: { used: 1, [`byFeature.${feature}`]: 1 },
          $set: { accessTier: q.accessTier, quota: q.quota },
        },
        { returnDocument: "after" }
      );
    });

    if (!claimed) {
      const row = await this.getOrCreateDaily(userId, snap);
      throw new ForbiddenError(
        `Daily AI quota exhausted (${row.used}/${row.quota}). Resets at UTC midnight.`
      );
    }

    const daily = claimed;

    let problemTitle: string | undefined;
    let problemDescription: string | undefined;
    if (body.problemId) {
      const p = await Problem.findById(body.problemId)
        .select("title description")
        .lean();
      if (p) {
        problemTitle = p.title;
        problemDescription = p.description
          ? String(p.description).slice(0, 4000)
          : undefined;
      }
    }

    const codeSnippet = body.codeSnippet
      ? String(body.codeSnippet).slice(0, 4000)
      : undefined;
    const started = Date.now();

    try {
      const result = await runAiAssist({
        feature,
        problemTitle,
        problemDescription,
        userMessage: body.userMessage,
        errorMessage: body.errorMessage,
        testCase: body.testCase,
        codeSnippet,
        language: body.language,
      });

      await AiUsageEvent.create({
        userId,
        feature,
        dateKey: daily.dateKey,
        success: true,
        problemId: body.problemId,
        hadCodeSnippet: Boolean(codeSnippet),
        codeLength: codeSnippet ? codeSnippet.length : 0,
        latencyMs: Date.now() - started,
        provider: result.provider,
      });

      return {
        feature,
        reply: result.reply,
        learningMode: true as const,
        refusedDump: result.refusedDump,
        usage: {
          dateKey: daily.dateKey,
          quota: daily.quota,
          used: daily.used,
          remaining: Math.max(0, daily.quota - daily.used),
          failed: daily.failed,
        },
        // provider name only — never keys
        provider: result.provider,
      };
    } catch (err: any) {
      // Refund one quota unit on provider failure (best-effort)
      await AiUsageDaily.updateOne(
        { _id: daily._id, used: { $gt: 0 } },
        { $inc: { used: -1, failed: 1, [`byFeature.${feature}`]: -1 } }
      );
      await AiUsageEvent.create({
        userId,
        feature,
        dateKey: daily.dateKey,
        success: false,
        failureReason: sanitizeFailureReason(
          String(err?.message || "ai_failure")
        ),
        problemId: body.problemId,
        hadCodeSnippet: Boolean(codeSnippet),
        codeLength: codeSnippet ? codeSnippet.length : 0,
        latencyMs: Date.now() - started,
        provider: "none",
      });
      throw err;
    }
  }
}

export const aiAssistantService = new AiAssistantService();
