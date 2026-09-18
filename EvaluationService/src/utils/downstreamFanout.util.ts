import axios, { AxiosError } from "axios";
import logger from "../config/logger.config";
import { serverConfig } from "../config";

export type DownstreamService =
  | "AnalyticsService"
  | "LeaderboardService"
  | "ProblemService"
  | "SubmissionService";

export type DownstreamErrorClass =
  | "timeout"
  | "network"
  | "http_4xx"
  | "http_5xx"
  | "http_429"
  | "unknown";

const FANOUT_TIMEOUT_MS = 5_000;
/** Initial attempt + one retry for transient failures only. */
const FANOUT_MAX_ATTEMPTS = 2;
const FANOUT_RETRY_BASE_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Safe error fields only — never headers, tokens, or request bodies. */
export function classifyDownstreamError(err: unknown): {
  classification: DownstreamErrorClass;
  message: string;
  statusCode?: number;
  code?: string;
} {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError;
    const statusCode = ax.response?.status;
    const code = ax.code;

    if (code === "ECONNABORTED" || code === "ETIMEDOUT") {
      return {
        classification: "timeout",
        message: ax.message || "Request timed out",
        code,
        statusCode,
      };
    }
    if (
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      code === "ECONNRESET" ||
      code === "EAI_AGAIN" ||
      !ax.response
    ) {
      return {
        classification: "network",
        message: ax.message || "Network error",
        code,
        statusCode,
      };
    }
    if (statusCode === 429) {
      return {
        classification: "http_429",
        message: ax.message || "Rate limited",
        code,
        statusCode,
      };
    }
    if (statusCode !== undefined && statusCode >= 500) {
      return {
        classification: "http_5xx",
        message: ax.message || `HTTP ${statusCode}`,
        code,
        statusCode,
      };
    }
    if (statusCode !== undefined && statusCode >= 400) {
      return {
        classification: "http_4xx",
        message: ax.message || `HTTP ${statusCode}`,
        code,
        statusCode,
      };
    }
    return {
      classification: "unknown",
      message: ax.message || "Axios error",
      code,
      statusCode,
    };
  }

  if (err instanceof Error) {
    return { classification: "unknown", message: err.message };
  }
  return { classification: "unknown", message: String(err) };
}

function shouldRetry(classification: DownstreamErrorClass): boolean {
  return (
    classification === "timeout" ||
    classification === "network" ||
    classification === "http_5xx" ||
    classification === "http_429"
  );
}

export interface DownstreamPostOptions {
  service: DownstreamService;
  operation: string;
  url: string;
  /** Metadata-only payload — never include source code or secrets. */
  body: Record<string, unknown>;
  submissionId?: string;
  jobId?: string;
}

/**
 * Best-effort POST to a downstream internal API.
 * Bounded retries for transient errors; never throws (verdict already persisted).
 */
export async function postDownstreamBestEffort(
  options: DownstreamPostOptions
): Promise<void> {
  const { service, operation, url, body, submissionId, jobId } = options;
  const baseLog = {
    downstreamService: service,
    operation,
    submissionId,
    jobId,
  };

  for (let attempt = 1; attempt <= FANOUT_MAX_ATTEMPTS; attempt++) {
    try {
      await axios.post(url, body, {
        timeout: FANOUT_TIMEOUT_MS,
        headers: {
          "x-internal-secret": serverConfig.INTERNAL_SERVICE_SECRET,
          "Content-Type": "application/json",
        },
      });
      if (attempt > 1) {
        logger.info("Downstream fan-out succeeded after retry", {
          ...baseLog,
          attempt,
        });
      }
      return;
    } catch (err: unknown) {
      const classified = classifyDownstreamError(err);
      const willRetry =
        attempt < FANOUT_MAX_ATTEMPTS && shouldRetry(classified.classification);

      logger.warn("Downstream fan-out call failed", {
        ...baseLog,
        attempt,
        maxAttempts: FANOUT_MAX_ATTEMPTS,
        willRetry,
        errorClassification: classified.classification,
        errorMessage: classified.message,
        statusCode: classified.statusCode,
        errorCode: classified.code,
      });

      if (!willRetry) return;
      await sleep(FANOUT_RETRY_BASE_MS * attempt);
    }
  }
}
