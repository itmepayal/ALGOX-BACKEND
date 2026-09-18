import dotenv from "dotenv";

type ServerConfig = {
  PORT: number;
  MONGO_URL: string;
  REDIS_URL: string;
  REDIS_TOKEN: string;
  INTERNAL_SERVICE_SECRET: string;
  JWT_SECRET: string;
  AUTH_SERVICE_URL: string;
};

function loadEnv() {
  dotenv.config();
}

loadEnv();

function getEnvVariable(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

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

export const serverConfig: ServerConfig = {
  PORT: Number(process.env.PORT) || 3005,
  MONGO_URL: getEnvVariable("MONGO_URL"),
  REDIS_URL: getEnvVariable("REDIS_URL"),
  REDIS_TOKEN: getEnvVariable("REDIS_TOKEN"),
  INTERNAL_SERVICE_SECRET: resolveInternalSecret(),
  JWT_SECRET: secretEnv("JWT_SECRET", "super_secret_jwt_access_key"),
  AUTH_SERVICE_URL: process.env.AUTH_SERVICE_URL || "http://localhost:3001",
};
