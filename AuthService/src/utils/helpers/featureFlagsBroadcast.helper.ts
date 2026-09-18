/**
 * After maintenance (or related settings) change, clear remote feature-flag
 * caches so product services do not wait for the ~15s TTL.
 */
import axios from "axios";
import { serverConfig } from "../../config";

function normalizeBase(url: string): string {
  return String(url || "")
    .trim()
    .replace(/\/$/, "");
}

function invalidatePath(base: string): string {
  // Bases may be origin or already include /api/v1
  if (base.includes("/api/")) {
    return `${base}/internal/feature-flags/invalidate`;
  }
  return `${base}/api/v1/internal/feature-flags/invalidate`;
}

/** Known product service bases (env first, then local defaults). */
function featureFlagCacheTargets(): string[] {
  const fromEnv = [
    serverConfig.PROBLEM_SERVICE,
    serverConfig.SUBMISSION_SERVICE,
    process.env.LEADERBOARD_SERVICE,
    process.env.EVALUATION_SERVICE,
    process.env.ANALYTICS_SERVICE,
    process.env.DISCUSSION_SERVICE,
    process.env.CONTENT_SERVICE,
    process.env.REALTIME_SERVICE,
    process.env.FEATURE_FLAG_INVALIDATE_URLS, // comma-separated extra bases
  ]
    .flatMap((v) => String(v || "").split(","))
    .map(normalizeBase)
    .filter(Boolean);

  const defaults = [
    "http://localhost:3003/api/v1",
    "http://localhost:3004/api/v1",
    "http://localhost:3005/api/v1",
    "http://localhost:3006/api/v1",
    "http://localhost:3007/api/v1",
    "http://localhost:3008/api/v1",
    "http://localhost:3009/api/v1",
    "http://localhost:3010/api/v1",
  ];

  return [...new Set([...fromEnv, ...defaults])];
}

/**
 * Fire-and-forget: ask product services to drop their feature-flag cache.
 * Failures are ignored so settings updates never fail due to a down peer.
 * Never logs secret values.
 */
export function broadcastFeatureFlagsInvalidation(): void {
  const secret = (serverConfig.INTERNAL_SERVICE_SECRET || "").trim();
  if (!secret) {
    console.warn(
      "[feature-flags] skip invalidate broadcast: INTERNAL_SERVICE_SECRET not configured"
    );
    return;
  }

  for (const base of featureFlagCacheTargets()) {
    const url = invalidatePath(base);
    void axios
      .post(
        url,
        {},
        {
          timeout: 2500,
          headers: {
            "x-internal-secret": secret,
            "Content-Type": "application/json",
          },
          validateStatus: () => true,
        }
      )
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          console.warn(
            `[feature-flags] invalidate rejected by peer (${res.status}) — check INTERNAL_SERVICE_SECRET parity`,
            { url }
          );
        }
      })
      .catch(() => {
        /* peer down / old binary — TTL will eventually refresh */
      });
  }
}
