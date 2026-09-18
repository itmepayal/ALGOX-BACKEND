import dotenv from "dotenv";

type ServerConfig = {
  PORT: number;
  MONGO_URL: string;
  REDIS_URL: string;
  /**
   * Dedicated Redis for BullMQ (must be maxmemory-policy=noeviction).
   * Falls back to REDIS_URL when unset. Keep Upstash cache/REST on REDIS_URL.
   */
  QUEUE_REDIS_URL: string;
  REDIS_TOKEN: string;
  PROBLEM_SERVICE: string;
  SUBMISSION_SERVICE: string;
  ANALYTICS_SERVICE: string;
  LEADERBOARD_SERVICE: string;
  AUTH_SERVICE_URL: string;
  JWT_SECRET: string;
  INTERNAL_SERVICE_SECRET: string;
};

function loadEnv() {
  dotenv.config();
  console.log("Environment variables loaded");
}

loadEnv();

function getEnvVariable(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/** Dev-only defaults; production must set the env var. Never log the value. */
const INSECURE_SECRET_DEFAULTS = new Set([
  "super_secret_jwt_access_key",
  "super_secret_jwt_refresh_key",
  "dev-internal-service-secret",
]);

function isStrictSecretsMode(): boolean {
  return (
    (process.env.NODE_ENV || "").toLowerCase() === "production" ||
    process.env.REQUIRE_STRICT_SECRETS === "true"
  );
}

/**
 * Dev defaults OK locally. Strict/production rejects missing and known insecure defaults.
 * Never log resolved secret values.
 */
function secretEnv(key: string, devDefault: string): string {
  const value = (process.env[key] || "").trim();
  if (isStrictSecretsMode()) {
    if (!value) {
      throw new Error(`${key} is required in production`);
    }
    if (INSECURE_SECRET_DEFAULTS.has(value) || value === devDefault) {
      throw new Error(
        `${key} must not use a development/default value in production`
      );
    }
    return value;
  }
  return value || devDefault;
}

function resolveInternalSecret(): string {
  const DEV_DEFAULT = "dev-internal-service-secret";
  const fromEnv = (
    process.env.INTERNAL_SERVICE_SECRET ||
    process.env.INTERNAL_REALTIME_SECRET ||
    ""
  ).trim();
  if (isStrictSecretsMode()) {
    if (!fromEnv) {
      throw new Error("INTERNAL_SERVICE_SECRET is required in production");
    }
    if (INSECURE_SECRET_DEFAULTS.has(fromEnv) || fromEnv === DEV_DEFAULT) {
      throw new Error(
        "INTERNAL_SERVICE_SECRET must not use a development/default value in production"
      );
    }
    return fromEnv;
  }
  return fromEnv || DEV_DEFAULT;
}

const redisUrl = getEnvVariable("REDIS_URL");
const queueRedisUrl = (process.env.QUEUE_REDIS_URL || "").trim() || redisUrl;

export const serverConfig: ServerConfig = {
  PORT: Number(process.env.PORT) || 3006,
  MONGO_URL: getEnvVariable("MONGO_URL"),
  REDIS_URL: redisUrl,
  QUEUE_REDIS_URL: queueRedisUrl,
  REDIS_TOKEN: process.env.REDIS_TOKEN || "",
  PROBLEM_SERVICE: getEnvVariable("PROBLEM_SERVICE"),
  SUBMISSION_SERVICE: getEnvVariable("SUBMISSION_SERVICE"),
  ANALYTICS_SERVICE:
    process.env.ANALYTICS_SERVICE || "http://localhost:3007/api/v1",
  LEADERBOARD_SERVICE:
    process.env.LEADERBOARD_SERVICE || "http://localhost:3005/api/v1",
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || "http://localhost:3001",
  JWT_SECRET: secretEnv("JWT_SECRET", "super_secret_jwt_access_key"),
  INTERNAL_SERVICE_SECRET: resolveInternalSecret(),
};
