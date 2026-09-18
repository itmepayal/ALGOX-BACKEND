import dotenv from "dotenv";
dotenv.config();

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

export const serverConfig = {
  PORT: process.env.PORT || 3007,
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/leetcode_analytics",
  REDIS_URL: process.env.REDIS_URL || "",
  REDIS_TOKEN: process.env.REDIS_TOKEN || "",
  NODE_ENV: process.env.NODE_ENV || "development",
  JWT_SECRET: secretEnv("JWT_SECRET", "super_secret_jwt_access_key"),
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || "http://localhost:3001",
  PROBLEM_SERVICE_URL: process.env.PROBLEM_SERVICE_URL || "http://localhost:3003",
  SUBMISSION_SERVICE_URL:
    process.env.SUBMISSION_SERVICE_URL || "http://localhost:3004",
  CONTENT_SERVICE_URL: process.env.CONTENT_SERVICE_URL || "http://localhost:3009",
  INTERNAL_SERVICE_SECRET: resolveInternalSecret(),
};
