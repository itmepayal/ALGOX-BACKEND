import dotenv from "dotenv";

type ServerConfig = {
  PORT: number;
  MONGO_URL: string;
  REDIS_URL: string;
  REDIS_TOKEN: string;
  PROBLEM_SERVICE: string;
  SUBMISSION_SERVICE: string;
  JWT_SECRET: string;
  REFRESH_TOKEN_SECRET: string;
  CLOUDINARY_CLOUD_NAME: string;
  CLOUDINARY_API_KEY: string;
  CLOUDINARY_API_SECRET: string;
  INTERNAL_SERVICE_SECRET: string;
  /** Resend API key — required in production. Never log. */
  RESEND_API_KEY: string;
  /** Sender address for Auth emails — required in production. Never a placeholder. */
  EMAIL_FROM: string;
};

function loadEnv() {
  dotenv.config();
  console.log("Environment variables loaded");
}

loadEnv();

function isProduction(): boolean {
  return (process.env.NODE_ENV || "").toLowerCase() === "production";
}

/** Production or explicit REQUIRE_STRICT_SECRETS=true. */
export function isStrictSecretsMode(): boolean {
  return isProduction() || process.env.REQUIRE_STRICT_SECRETS === "true";
}

function requiresStrictEmailConfig(): boolean {
  return isStrictSecretsMode();
}

/** Known insecure development placeholders — never allowed in strict mode. */
const INSECURE_SECRET_DEFAULTS = new Set([
  "super_secret_jwt_access_key",
  "super_secret_jwt_refresh_key",
  "dev-internal-service-secret",
]);

function getEnvVariable(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Dev-only defaults permitted locally.
 * Strict mode: required, trimmed, and must not be a known development default.
 * Never log the resolved value.
 */
function secretEnv(key: string, devDefault?: string): string {
  const value = (process.env[key] || "").trim();
  if (isStrictSecretsMode()) {
    if (!value) {
      throw new Error(`${key} is required in production`);
    }
    if (
      INSECURE_SECRET_DEFAULTS.has(value) ||
      (devDefault !== undefined && value === devDefault)
    ) {
      throw new Error(
        `${key} must not use a development/default value in production`
      );
    }
    return value;
  }
  if (value) return value;
  if (devDefault === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return devDefault;
}

function resolveInternalServiceSecret(): string {
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

/** Accepts `email@domain` or `Display Name <email@domain>`. Rejects empty/placeholder senders. */
export function isUsableEmailFrom(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  const angled = raw.match(/<([^>]+)>/);
  const addr = (angled ? angled[1] : raw).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) return false;
  if (
    addr === "onboarding@resend.dev" ||
    addr.endsWith("@example.com") ||
    addr.endsWith("@localhost") ||
    addr.endsWith(".local") ||
    addr.includes("placeholder") ||
    addr.includes("changeme")
  ) {
    return false;
  }
  return true;
}

function resolveResendApiKey(): string {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (requiresStrictEmailConfig()) {
    if (!key) {
      throw new Error("RESEND_API_KEY is required in production");
    }
    return key;
  }
  return key;
}

function resolveEmailFrom(): string {
  const fromEnv = (process.env.EMAIL_FROM || "").trim();
  if (requiresStrictEmailConfig()) {
    if (!isUsableEmailFrom(fromEnv)) {
      throw new Error(
        "EMAIL_FROM is required in production and must be a valid non-placeholder sender address"
      );
    }
    return fromEnv;
  }
  return fromEnv;
}

export const serverConfig: ServerConfig = {
  PORT: Number(process.env.PORT) || 3000,
  MONGO_URL: getEnvVariable("MONGO_URL"),
  REDIS_URL: getEnvVariable("REDIS_URL"),
  REDIS_TOKEN: getEnvVariable("REDIS_TOKEN"),
  PROBLEM_SERVICE: getEnvVariable("PROBLEM_SERVICE"),
  SUBMISSION_SERVICE: getEnvVariable("SUBMISSION_SERVICE"),
  JWT_SECRET: secretEnv("JWT_SECRET", "super_secret_jwt_access_key"),
  REFRESH_TOKEN_SECRET: secretEnv(
    "REFRESH_TOKEN_SECRET",
    "super_secret_jwt_refresh_key"
  ),
  // Cloudinary: no hardcoded credentials — always required from env.
  CLOUDINARY_CLOUD_NAME: getEnvVariable("CLOUDINARY_CLOUD_NAME"),
  CLOUDINARY_API_KEY: getEnvVariable("CLOUDINARY_API_KEY"),
  CLOUDINARY_API_SECRET: getEnvVariable("CLOUDINARY_API_SECRET"),
  INTERNAL_SERVICE_SECRET: resolveInternalServiceSecret(),
  RESEND_API_KEY: resolveResendApiKey(),
  EMAIL_FROM: resolveEmailFrom(),
};
